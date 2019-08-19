import MinimumViableMultisig from "@counterfactual/cf-funding-protocol-contracts/build/MinimumViableMultisig.json";
import ProxyFactory from "@counterfactual/cf-funding-protocol-contracts/build/ProxyFactory.json";
import { NetworkContext, Node } from "@counterfactual/types";
import { Contract, Signer } from "ethers";
import { Provider, TransactionResponse } from "ethers/providers";
import { Interface } from "ethers/utils";
import Queue from "p-queue";
import { jsonRpcMethod } from "rpc-server";

import { MULTISIG_DEPLOYED_BYTECODE } from "../../../constants";
import { xkeysToSortedKthAddresses } from "../../../machine";
import { RequestHandler } from "../../../request-handler";
import { CreateChannelMessage, NODE_EVENTS } from "../../../types";
import {
  getCreate2MultisigAddress,
  prettyPrintObject,
  sleep
} from "../../../utils";
import { NodeController } from "../../controller";
import {
  CHANNEL_CREATION_FAILED,
  NO_TRANSACTION_HASH_FOR_MULTISIG_DEPLOYMENT
} from "../../errors";

// TODO: Add good estimate for ProxyFactory.createProxy
const CREATE_PROXY_AND_SETUP_GAS = 6e6;

/**
 * This instantiates a StateChannel object to encapsulate the "channel"
 * having been opened via the deterministical calculation of the multisig contract's
 * address. This also deploys the multisig contract to chain though it's not
 * strictly needed to deploy it here as per
 * https://github.com/counterfactual/monorepo/issues/1183.
 *
 * This then sends the details of this multisig to the peer with whom the multisig
 * is owned and the multisig's _address_ is sent as an event
 * to whoever subscribed to the `NODE_EVENTS.CREATE_CHANNEL` event on the Node.
 */
export default class CreateChannelController extends NodeController {
  public static readonly methodName = Node.MethodName.CREATE_CHANNEL;

  @jsonRpcMethod(Node.RpcMethodName.CREATE_CHANNEL)
  public executeMethod = super.executeMethod;

  protected async enqueueByShard(
    requestHandler: RequestHandler
  ): Promise<Queue[]> {
    return [requestHandler.getShardedQueue(CreateChannelController.methodName)];
  }

  protected async executeMethodImplementation(
    requestHandler: RequestHandler,
    params: Node.CreateChannelParams
  ): Promise<Node.CreateChannelTransactionResult> {
    const { owners, retryCount } = params;
    const { wallet, networkContext } = requestHandler;

    const multisigAddress = getCreate2MultisigAddress(
      owners,
      networkContext.ProxyFactory,
      networkContext.MinimumViableMultisig
    );

    const transactionHash = await this.sendMultisigDeployTx(
      wallet,
      owners,
      networkContext,
      retryCount
    );

    this.handleDeployedMultisigOnChain(multisigAddress, requestHandler, params);

    return { transactionHash };
  }

  private async handleDeployedMultisigOnChain(
    multisigAddress: string,
    requestHandler: RequestHandler,
    params: Node.CreateChannelParams
  ) {
    const { owners } = params;
    const {
      publicIdentifier,
      instructionExecutor,
      store,
      outgoing
    } = requestHandler;

    const [responderXpub] = owners.filter(x => x !== publicIdentifier);

    const channel = (await instructionExecutor.runSetupProtocol({
      multisigAddress,
      responderXpub,
      initiatorXpub: publicIdentifier
    })).get(multisigAddress)!;

    await store.saveStateChannel(channel);
    await store.saveFreeBalance(channel);

    const msg: CreateChannelMessage = {
      from: publicIdentifier,
      type: NODE_EVENTS.CREATE_CHANNEL,
      data: {
        multisigAddress,
        owners,
        counterpartyXpub: responderXpub
      } as Node.CreateChannelResult
    };

    outgoing.emit(NODE_EVENTS.CREATE_CHANNEL, msg);
  }

  private async sendMultisigDeployTx(
    signer: Signer,
    owners: string[],
    networkContext: NetworkContext,
    retryCount: number = 4
  ): Promise<string> {
    const proxyFactory = new Contract(
      networkContext.ProxyFactory,
      ProxyFactory.abi,
      signer
    );

    const provider = await signer.provider;

    if (!provider) {
      throw new Error("wallet must have a provider");
    }

    const { gasLimit: networkGasLimit } = await provider.getBlock(
      provider.getBlockNumber()
    );

    const multisigAddress = getCreate2MultisigAddress(
      owners,
      networkContext.ProxyFactory,
      networkContext.MinimumViableMultisig
    );

    const multisigContract = new Contract(
      multisigAddress,
      MinimumViableMultisig.abi,
      provider
    );

    try {
      console.error("getting owners");
      console.error(await multisigContract.functions.getOwners());
      return Promise.resolve("channel has already been setup");
    } catch (e) {
      console.error("channel hasn't been setup yet");
      console.error(e);
    }

    console.error(`Expected multisig address: ${multisigAddress}`);
    console.error(owners);

    const bytecode = await provider.getCode(multisigAddress);
    console.error(bytecode);

    let error;
    for (let tryCount = 0; tryCount < retryCount; tryCount += 1) {
      console.error(`Attempt number ${tryCount}`);
      try {
        const extraGasLimit = tryCount * 1e6;
        const gasLimit = CREATE_PROXY_AND_SETUP_GAS + extraGasLimit;
        const clampedGasLimit = networkGasLimit.lt(gasLimit)
          ? networkGasLimit
          : gasLimit;

        const tx: TransactionResponse = await proxyFactory.functions.createProxyWithNonce(
          networkContext.MinimumViableMultisig,
          new Interface(MinimumViableMultisig.abi).functions.setup.encode([
            xkeysToSortedKthAddresses(owners, 0)
          ]),
          0, // TODO: Increment nonce as needed
          {
            gasLimit: clampedGasLimit,
            gasPrice: provider.getGasPrice()
          }
        );

        if (!tx.hash) {
          throw Error(
            `${NO_TRANSACTION_HASH_FOR_MULTISIG_DEPLOYMENT}: ${prettyPrintObject(
              tx
            )}`
          );
        }

        const receipt = await tx.wait();
        const event: Event = (receipt as any).events.pop();
        console.error("got event");
        console.error(event);

        if (
          !(await checkForCorrectDeployedByteCode(
            tx!,
            provider,
            owners,
            networkContext
          ))
        ) {
          error = `
            Could not confirm the deployed multisig contract has the expected bytecode
            for multisig address ${multisigAddress}
            signer address: ${await signer.getAddress()}
            gas limit: ${CREATE_PROXY_AND_SETUP_GAS + extraGasLimit}
            tx: ${prettyPrintObject(tx)}
            `;
          await sleep(1000 * tryCount ** 2);
          continue;
        }

        return tx.hash;
      } catch (e) {
        error = e;
        console.error(`Channel creation attempt ${tryCount} failed: ${e}.\n
                      Retrying ${retryCount - tryCount} more times`);
      }
    }

    throw Error(`${CHANNEL_CREATION_FAILED}: ${prettyPrintObject(error)}`);
  }
}

async function checkForCorrectDeployedByteCode(
  tx: TransactionResponse,
  provider: Provider,
  owners: string[],
  networkContext: NetworkContext
): Promise<boolean> {
  const multisigAddress = getCreate2MultisigAddress(
    owners,
    networkContext.ProxyFactory,
    networkContext.MinimumViableMultisig
  );

  const multisigDeployedBytecode = await provider.getCode(
    multisigAddress,
    tx.blockHash
  );

  return MULTISIG_DEPLOYED_BYTECODE === multisigDeployedBytecode;
}
