import { legacy } from "@counterfactual/cf.js";
import {
  Address,
  AppInstanceInfo,
  AssetType,
  Node
} from "@counterfactual/common-types";
import { ethers } from "ethers";

import { IStoreService } from "./service-interfaces";
import { zeroBalance } from "./utils";

import Nonce = legacy.utils.Nonce;
import FreeBalance = legacy.utils.FreeBalance;

/**
 * The schema of a channel is below.
 * The following Channels class encapsulates the state and persistence of all
 * the channels in a Node.
 */

/**
 * The fully expanded schema for a channel:
 * multisigAddress: {
 *  multisigAddress: Address,
 *  multisigOwners: Address[],
 *  appsNonce: Nonce,
 *  appInstances: Map<AppInstanceID,
 *    appInstance: {
 *      id: string,
 *      appId: Address,
 *      abiEncodings: {
 *        stateEncoding: string,
 *        actionEncoding: string
 *      },
 *      appState: any,
 *      localNonce: Nonce,
 *      dependencyNonce: Nonce,
 *      timeout: BigNumber,
 *      asset: {
 *        assetType: AssetType,
 *        token?: Address
 *      },
 *      deposits: Map<Address, BigNumber>
 *    }
 *  },
 *  proposedAppInstances: same schema as appInstances,
 *  freeBalances: Map<AssetType,
 *    freeBalance: {
 *      alice: Address,
 *      aliceBalance: BigNumber,
 *      bob: Address,
 *      bobBalance: BigNumber,
 *      uniqueId: number,
 *      localNonce: number,
 *      timeout: number,
 *      dependencyNonce: {
 *        isSet: boolean,
 *        salt: string,
 *        nonceValue: number
 *      }
 *    }
 *  }
 * }
 */

/**
 * This class is only a type implementation of a channel schema for the
 * purposes of updating and retrieving a channel's state from the store.
 *
 * An instance is by itself stateless and effectively reflects the state of an
 * according channel in the store.
 */
class Channel {
  constructor(
    readonly multisigAddress: Address,
    readonly multisigOwners: Address[],
    readonly appsNonce: Nonce = new Nonce(true, 0, 0),
    readonly freeBalances: {
      [assetType: number]: FreeBalance;
    } = Channel.initialFreeBalances(multisigOwners, appsNonce),
    readonly appInstances: {
      [appInstanceId: string]: AppInstanceInfo;
    } = {},
    readonly proposedAppInstances: {
      [appInstanceId: string]: AppInstanceInfo;
    } = {}
  ) {}

  static initialFreeBalances(
    multisigOwners: Address[],
    initialAppsNonce: Nonce
  ): {
    [assetType: number]: FreeBalance;
  } {
    // TODO: extend to all asset types
    const ethFreeBalance = new FreeBalance(
      multisigOwners[0],
      zeroBalance,
      multisigOwners[1],
      zeroBalance,
      0,
      0,
      0,
      initialAppsNonce
    );
    return {
      [AssetType.ETH]: ethFreeBalance
    };
  }
}

/**
 * Used in standardizing how to set/get app instances within a channel according
 * to their correct status.
 */
enum APP_INSTANCE_STATUS {
  INSTALLED = "installed",
  PROPOSED = "proposed"
}

/**
 * Note: this class itelf does not hold any meaningful state either.
 * It encapsulates the operations performed on relevant appInstances and
 * abstracts the persistence to the store service.
 */
export class Channels {
  /**
   * A convenience lookup table from a set of owners to multisig address.
   */
  private readonly ownersToMultisigAddress = {};

  /**
   * A convenience lookup table from appInstance ID to multisig address.
   */
  private readonly appInstanceIdToMultisigAddress = {};

  static readonly APP_INSTANCE_STATUS = APP_INSTANCE_STATUS;

  /**
   * @param selfAddress The address of the account being used with the Node.
   * @param store
   * @param multisigKeyPrefix The prefix to add to the key being used
   *        for indexing multisig addresses according to the execution
   *        environment.
   */
  constructor(
    public readonly selfAddress: Address,
    private readonly store: IStoreService,
    private readonly multisigKeyPrefix: string
  ) {}

  /**
   * Called when a new multisig is created for a set of owners.
   * @param multisigAddress
   * @param multisigOwners
   * @param freeBalances
   */
  async createMultisig(params: Node.CreateMultisigParams): Promise<Address> {
    const multisigAddress = Channels.getMultisigAddress(params.owners);
    const channel: Channel = new Channel(multisigAddress, params.owners);
    const ownersHash = Channels.canonicalizeAddresses(params.owners);
    this.ownersToMultisigAddress[ownersHash] = multisigAddress;
    await this.save(channel);
    return multisigAddress;
  }

  async addMultisig(multisigAddress: Address, owners: Address[]) {
    const channel = new Channel(multisigAddress, owners);
    const ownersHash = Channels.canonicalizeAddresses(owners);
    this.ownersToMultisigAddress[ownersHash] = multisigAddress;
    await this.save(channel);
  }

  private async getChannelFromPeerAddress(
    peerAddress: Address
  ): Promise<Channel> {
    const owners = Channels.canonicalizeAddresses([
      this.selfAddress,
      peerAddress
    ]);
    const multisigAddress = this.ownersToMultisigAddress[owners];
    const channel = await this.getChannelFromStore(multisigAddress);
    return new Channel(
      channel.multisigAddress,
      channel.multisigOwners,
      channel.appsNonce,
      channel.freeBalances,
      channel.appInstances,
      channel.proposedAppInstances
    );
  }

  public async getPeersAddressFromAppInstanceId(
    appInstanceId: string
  ): Promise<Address[]> {
    const multisigAddress = this.appInstanceIdToMultisigAddress[appInstanceId];
    const channel: Channel = await this.getChannelFromStore(multisigAddress);
    const owners = channel.multisigOwners;
    return owners.filter(owner => owner !== this.selfAddress);
  }

  private async getChannelFromAppInstanceId(
    appInstanceId: string
  ): Promise<Channel> {
    const multisigAddress = this.appInstanceIdToMultisigAddress[appInstanceId];
    const channel = await this.getChannelFromStore(multisigAddress);
    return new Channel(
      channel.multisigAddress,
      channel.multisigOwners,
      channel.appsNonce,
      channel.freeBalances,
      channel.appInstances,
      channel.proposedAppInstances
    );
  }

  async getAppInstances(
    status: APP_INSTANCE_STATUS
  ): Promise<AppInstanceInfo[]> {
    if (!Object.values(APP_INSTANCE_STATUS).includes(status)) {
      return Promise.reject(
        `The specified app status "${status}" is not a valid app instance state`
      );
    }
    if (status === APP_INSTANCE_STATUS.INSTALLED) {
      return await this.getInstalledAppInstances();
    }
    return await this.getProposedAppInstances();
  }
  /**
   * Gets all installed appInstances across all of the channels open on
   * this Node.
   */
  private async getInstalledAppInstances(): Promise<AppInstanceInfo[]> {
    const apps: AppInstanceInfo[] = [];
    const channels = await this.getAllChannels();
    Object.values(channels).forEach((channel: Channel) => {
      if (channel.appInstances) {
        apps.push(...Object.values(channel.appInstances));
      } else {
        console.log(
          `No app instances exist for channel with multisig address: ${
            channel.multisigAddress
          }`
        );
      }
    });
    return apps;
  }

  /**
   * Gets all proposed appInstances across all of the channels open on
   * this Node.
   */
  private async getProposedAppInstances(): Promise<AppInstanceInfo[]> {
    const apps: AppInstanceInfo[] = [];
    const channels = await this.getAllChannels();
    Object.values(channels).forEach((channel: Channel) => {
      if (channel.proposedAppInstances) {
        apps.push(...Object.values(channel.proposedAppInstances));
      } else {
        console.log(
          `No app instances exist for channel with multisig address: ${
            channel.multisigAddress
          }`
        );
      }
    });
    return apps;
  }

  async proposeInstall(params: Node.ProposeInstallParams): Promise<string> {
    const channel = await this.getChannelFromPeerAddress(params.peerAddress);
    // TODO: generate the id correctly
    const appInstanceId = channel.appsNonce!.nonceValue.toString();
    const appInstanceState = { ...params };
    delete appInstanceState.peerAddress;
    const appInstance: AppInstanceInfo = {
      id: appInstanceId,
      ...appInstanceState
    };
    await this.addAppInstanceProposal(channel, appInstance);
    this.appInstanceIdToMultisigAddress[appInstanceId] =
      channel.multisigAddress;
    return appInstanceId;
  }

  async install(params: Node.InstallParams): Promise<AppInstanceInfo> {
    const channel = await this.getChannelFromAppInstanceId(
      params.appInstanceId
    );
    const appInstance: AppInstanceInfo = channel.proposedAppInstances![
      params.appInstanceId
    ];
    await this.installAppInstance(channel, appInstance);
    return appInstance;
  }

  // Methods for interacting with the store persisting changes to a channel

  // getters

  /**
   * Returns a JSON object with the keys being the multisig addresses and the
   * values being objects reflecting the channel schema described above.
   */
  async getAllChannels(): Promise<object> {
    const channels = await this.store.get(this.multisigKeyPrefix);
    if (!channels) {
      console.log("No channels exist yet");
      return {};
    }
    return channels;
  }

  /**
   * Returns a JSON object matching the channel schema.
   * @param multisigAddress
   */
  async getChannelFromStore(multisigAddress: Address) {
    return await this.store.get(`${this.multisigKeyPrefix}/${multisigAddress}`);
  }

  // setters

  async save(channel: Channel) {
    await this.store.set(
      `${this.multisigKeyPrefix}/${channel.multisigAddress}`,
      channel
    );
  }

  /**
   * The app's installation is confirmed iff the store write operation
   * succeeds as the write operation's confirmation provides the desired
   * atomicity of moving an app instance from pending to installed.
   * @param channel
   * @param appInstance
   */
  async installAppInstance(channel: Channel, appInstance: AppInstanceInfo) {
    delete channel.proposedAppInstances[appInstance.id];
    channel.appInstances[appInstance.id] = appInstance;
    await this.store.set(
      `${this.multisigKeyPrefix}/${channel.multisigAddress}`,
      channel
    );
  }

  /**
   * Adds the given proposed appInstance to a channel's collection of proposed
   * app instances.
   * @param channel
   * @param appInstance
   */
  async addAppInstanceProposal(channel: Channel, appInstance: AppInstanceInfo) {
    channel.proposedAppInstances[appInstance.id] = appInstance;
    await this.store.set(
      `${this.multisigKeyPrefix}/${
        channel.multisigAddress
      }/proposedAppInstances`,
      channel.proposedAppInstances
    );
  }

  // Utility methods

  static canonicalizeAddresses(addresses: Address[]): string {
    addresses.sort((addrA: Address, addrB: Address) => {
      return new ethers.utils.BigNumber(addrA).lt(addrB) ? -1 : 1;
    });
    return ethers.utils.hashMessage(addresses.join(""));
  }

  static getMultisigAddress(owners: Address[]): Address {
    // TODO: implement this using CREATE2
    return ethers.Wallet.createRandom().address;
  }
}
