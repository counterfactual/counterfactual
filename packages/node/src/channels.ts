import { AppInstance, StateChannel } from "@counterfactual/machine";
import {
  Address,
  AppFunctionsSigHashes,
  AppInstanceInfo,
  AppInterface,
  AssetType,
  NetworkContext,
  Node,
  Terms
} from "@counterfactual/types";
import { Wallet } from "ethers";
import { bigNumberify } from "ethers/utils";
import { v4 as generateUUID } from "uuid";

import { APP_INSTANCE_STATUS } from "./db-schema";
import { IStoreService } from "./services";
import { Store } from "./store";
import { orderedAddressesHash } from "./utils";
import { ProposedAppInstanceInfo } from "./types";

/**
 * This class itelf does not hold any meaningful state.
 * It encapsulates the operations performed on relevant appInstances and
 * abstracts the persistence to the store service.
 */
export class Channels {
  private readonly store: Store;
  /**
   * @param selfAddress The address of the account being used with the Node.
   * @param store
   * @param storeKeyPrefix The prefix to add to the key being used
   *        for indexing store records (multisigs, look up tables, etc).
   */
  constructor(
    readonly selfAddress: Address,
    readonly networkContext: NetworkContext,
    storeService: IStoreService,
    storeKeyPrefix: string
  ) {
    this.store = new Store(storeService, storeKeyPrefix);
  }

  /**
   * Called to create a new multisig for a set of owners.
   * @param multisigAddress
   * @param multisigOwners
   * @param freeBalances
   */
  async createMultisig(params: Node.CreateMultisigParams): Promise<Address> {
    const multisigAddress = this.generateNewMultisigAddress(params.owners);
    let stateChannel: StateChannel = new StateChannel(
      multisigAddress,
      params.owners
    ).setupChannel(this.networkContext);
    const freeBalanceETH = stateChannel.getFreeBalanceFor(AssetType.ETH);

    const state = {
      alice: stateChannel.multisigOwners[0],
      bob: stateChannel.multisigOwners[1],
      aliceBalance: bigNumberify(0),
      bobBalance: bigNumberify(0)
    };

    stateChannel = stateChannel.setState(freeBalanceETH.id, state);
    const ownersHash = orderedAddressesHash(params.owners);
    await this.store.saveChannel(stateChannel, ownersHash);
    return multisigAddress;
  }

  /**
   * Called when a peer creates a multisig with the account on this Node.
   * @param multisigAddress
   * @param owners
   */
  async addMultisig(multisigAddress: Address, owners: Address[]) {
    let stateChannel = new StateChannel(multisigAddress, owners).setupChannel(
      this.networkContext
    );
    const freeBalanceETH = stateChannel.getFreeBalanceFor(AssetType.ETH);

    const state = {
      alice: stateChannel.multisigOwners[0],
      bob: stateChannel.multisigOwners[1],
      aliceBalance: bigNumberify(0),
      bobBalance: bigNumberify(0)
    };

    stateChannel = stateChannel.setState(freeBalanceETH.id, state);
    const ownersHash = orderedAddressesHash(owners);
    await this.store.saveChannel(stateChannel, ownersHash);
  }

  async getAddresses(): Promise<Address[]> {
    const channels = await this.store.getAllChannelsJSON();
    return Object.keys(channels);
  }

  async getPeersAddressFromClientAppInstanceID(
    clientAppInstanceID: string
  ): Promise<Address[]> {
    const multisigAddress = await this.store.getMultisigAddressFromClientAppInstanceID(
      clientAppInstanceID
    );
    const stateChannel: StateChannel = await this.store.getChannelJSONFromStore(
      multisigAddress
    );
    const owners = stateChannel.multisigOwners;
    return owners.filter(owner => owner !== this.selfAddress);
  }

  /**
   * Gets the list of app instances depending on the provided app status
   * specified.
   * @param status
   */
  async getAppInstances(
    status: APP_INSTANCE_STATUS
  ): Promise<AppInstanceInfo[]> {
    if (!Object.values(APP_INSTANCE_STATUS).includes(status)) {
      return Promise.reject(
        `The specified app status "${status}" is not a valid app instance status`
      );
    }
    if (status === APP_INSTANCE_STATUS.INSTALLED) {
      return await this.getInstalledAppInstances();
    }
    return await this.store.getProposedAppInstances();
  }

  async proposeInstall(params: Node.ProposeInstallParams): Promise<string> {
    const clientAppInstanceID = generateUUID();
    const channel = await this.getChannelFromPeerAddress(params.peerAddress);

    const proposedAppInstance = new ProposedAppInstanceInfo(
      clientAppInstanceID,
      params
    );

    await this.store.addAppInstanceProposal(
      channel,
      proposedAppInstance,
      clientAppInstanceID
    );
    return clientAppInstanceID;
  }

  async install(params: Node.InstallParams): Promise<AppInstanceInfo> {
    if (!params.appInstanceId) {
      return Promise.reject("No AppInstance ID specified to install");
    }

    const channel = await this.getChannelFromClientAppInstanceID(
      params.appInstanceId
    );

    const clientAppInstanceID = params.appInstanceId;
    const appInstanceInfo = await this.store.getProposedAppInstanceInfo(
      clientAppInstanceID
    );
    const appInstance: AppInstance = this.createAppInstanceFromAppInstanceInfo(
      appInstanceInfo,
      channel
    );
    await this.store.installAppInstance(
      appInstance,
      channel,
      clientAppInstanceID
    );

    return appInstanceInfo;
  }

  async setClientAppInstanceIDForProposeInstall(
    params: Node.InterNodeProposeInstallParams,
    clientAppInstanceID: string
  ) {
    const channel = await this.getChannelFromPeerAddress(params.peerAddress);
    const proposedAppInstance = new ProposedAppInstanceInfo(params.id, params);

    await this.store.addAppInstanceProposal(
      channel,
      proposedAppInstance,
      clientAppInstanceID
    );
  }

  // private utility methods

  private async getChannelFromPeerAddress(
    peerAddress: Address
  ): Promise<StateChannel> {
    const ownersHash = orderedAddressesHash([this.selfAddress, peerAddress]);
    const multisigAddress = await this.store.getMultisigAddressFromOwnersHash(
      ownersHash
    );
    return await this.store.getChannelJSONFromStore(multisigAddress);
  }

  /**
   * A JSON object with keys being the app instance IDs and the values being
   * the AppInstances.
   *
   * @param appInstances
   */
  private async replaceChannelAppInstanceIDWithClientAppInstanceID(
    appInstances: object
  ): Promise<object> {
    for (const appInstance of Object.values(appInstances)) {
      const clientAppInstanceID = await this.store.getClientAppInstanceIDFromChannelAppInstanceID(
        appInstance.id
      );
      appInstance.id = clientAppInstanceID;
    }
    return appInstances;
  }

  /**
   * Gets all installed appInstances across all of the channels open on
   * this Node.
   *
   * Note that the AppInstance IDs that are returned are the clientAppInstanceIDs
   * that the clients are expecting, and not the channelAppInstanceIDs.
   */
  private async getInstalledAppInstances(): Promise<AppInstanceInfo[]> {
    const apps: AppInstanceInfo[] = [];
    const channels = await this.store.getAllChannelsJSON();
    for (const channel of Object.values(channels)) {
      if (channel.appInstances) {
        const modifiedAppInstances = await this.replaceChannelAppInstanceIDWithClientAppInstanceID(
          channel.appInstances
        );
        apps.push(...Object.values(modifiedAppInstances));
      } else {
        console.log(
          `No app instances exist for channel with multisig address: ${
            channel.multisigAddress
          }`
        );
      }
    }
    return apps;
  }

  private async getChannelFromClientAppInstanceID(
    clientAppInstanceID: string
  ): Promise<StateChannel> {
    const multisigAddress = await this.store.getMultisigAddressFromClientAppInstanceID(
      clientAppInstanceID
    );
    return await this.store.getChannelJSONFromStore(multisigAddress);
  }

  private generateNewMultisigAddress(owners: Address[]): Address {
    // TODO: implement this using CREATE2
    return Wallet.createRandom().address;
  }

  /**
   * @param appInstanceInfo The AppInstanceInfo to convert
   * @param channel The channel the AppInstanceInfo belongs to
   */
  private createAppInstanceFromAppInstanceInfo(
    proposedAppInstanceInfo: ProposedAppInstanceInfo,
    channel: StateChannel
  ): AppInstance {
    const appFunctionSigHashes = getAppFunctionSigHashes(
      proposedAppInstanceInfo
    );

    const appInterface: AppInterface = {
      addr: proposedAppInstanceInfo.appId,
      applyAction: appFunctionSigHashes.applyAction,
      resolve: appFunctionSigHashes.resolve,
      getTurnTaker: appFunctionSigHashes.getTurnTaker,
      isStateTerminal: appFunctionSigHashes.isStateTerminal,
      stateEncoding: proposedAppInstanceInfo.abiEncodings.stateEncoding,
      actionEncoding: proposedAppInstanceInfo.abiEncodings.actionEncoding
    };

    const terms: Terms = {
      assetType: proposedAppInstanceInfo.asset.assetType,
      limit: proposedAppInstanceInfo.myDeposit.add(
        proposedAppInstanceInfo.peerDeposit
      )
    };
    if (proposedAppInstanceInfo.asset.token) {
      terms.token = proposedAppInstanceInfo.asset.token;
    }

    return new AppInstance(
      channel.multisigAddress,
      // TODO: generate ephemeral app-specific keys
      channel.multisigOwners,
      proposedAppInstanceInfo.timeout.toNumber(),
      appInterface,
      terms,
      // TODO: pass correct value when virtual app support gets added
      false,
      // TODO: this should be thread-safe
      channel.numInstalledApps,
      channel.rootNonceValue,
      proposedAppInstanceInfo.initialState,
      0,
      proposedAppInstanceInfo.timeout.toNumber()
    );
  }
}

function getAppFunctionSigHashes(
  appInstanceInfo: AppInstanceInfo
): AppFunctionsSigHashes {
  return {
    applyAction: "",
    resolve: "",
    getTurnTaker: "",
    isStateTerminal: ""
  };
}
