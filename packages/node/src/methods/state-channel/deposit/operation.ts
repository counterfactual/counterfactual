import { Node, OutcomeType } from "@counterfactual/types";
import { Zero } from "ethers/constants";
import { TransactionRequest, TransactionResponse } from "ethers/providers";
import { BigNumber, bigNumberify } from "ethers/utils";

import { DirectChannelProtocolContext, xkeyKthAddress } from "../../../machine";
import { RequestHandler } from "../../../request-handler";
import { NODE_EVENTS } from "../../../types";
import { getPeersAddressFromChannel } from "../../../utils";
import { DEPOSIT_FAILED } from "../../errors";

export interface ETHBalanceRefundAppState {
  recipient: string;
  multisig: string;
  threshold: BigNumber;
}

export async function installBalanceRefundApp(
  requestHandler: RequestHandler,
  params: Node.DepositParams
) {
  const {
    publicIdentifier,
    instructionExecutor,
    networkContext,
    store,
    provider
  } = requestHandler;

  const [peerAddress] = await getPeersAddressFromChannel(
    publicIdentifier,
    store,
    params.multisigAddress
  );

  const stateChannel = await store.getStateChannel(params.multisigAddress);

  const initialState = {
    recipient: xkeyKthAddress(publicIdentifier, 0),
    multisig: stateChannel.multisigAddress,
    threshold: await provider.getBalance(params.multisigAddress)
  };

  const {
    stateChannel: updatedStateChannel
  } = (await instructionExecutor.runInstallProtocol(stateChannel, {
    initialState,
    initiatingXpub: publicIdentifier,
    respondingXpub: peerAddress,
    multisigAddress: stateChannel.multisigAddress,
    initiatingBalanceDecrement: Zero,
    respondingBalanceDecrement: Zero,
    signingKeys: stateChannel.getNextSigningKeys(),
    appInterface: {
      addr: networkContext.ETHBalanceRefundApp,
      stateEncoding:
        "tuple(address recipient, address multisig,  uint256 threshold)",
      actionEncoding: undefined
    },
    // this is the block-time equivalent of 7 days
    defaultTimeout: 1008,
    outcomeType: OutcomeType.COIN_TRANSFER
  })) as DirectChannelProtocolContext;

  await store.saveStateChannel(updatedStateChannel);
}

export async function makeDeposit(
  requestHandler: RequestHandler,
  params: Node.DepositParams
): Promise<boolean> {
  const { multisigAddress, amount } = params;
  const { provider, blocksNeededForConfirmation, outgoing } = requestHandler;

  const signer = await requestHandler.getSigner();

  const tx: TransactionRequest = {
    to: multisigAddress,
    value: bigNumberify(amount),
    gasLimit: 30000,
    gasPrice: await provider.getGasPrice()
  };

  let txResponse: TransactionResponse;

  let retryCount = 3;
  while (retryCount > 0) {
    try {
      txResponse = await signer.sendTransaction(tx);
      break;
    } catch (e) {
      if (e.toString().includes("reject") || e.toString().includes("denied")) {
        outgoing.emit(NODE_EVENTS.DEPOSIT_FAILED, e);
        console.error(`${DEPOSIT_FAILED}: ${e}`);
        return false;
      }

      retryCount -= 1;

      if (retryCount === 0) {
        throw new Error(`${DEPOSIT_FAILED}: ${e}`);
      }
    }
  }

  outgoing.emit(NODE_EVENTS.DEPOSIT_STARTED, {
    value: amount,
    txHash: txResponse!.hash
  });

  await txResponse!.wait(blocksNeededForConfirmation);

  return true;
}

export async function uninstallBalanceRefundApp(
  requestHandler: RequestHandler,
  params: Node.DepositParams
) {
  const {
    publicIdentifier,
    store,
    instructionExecutor,
    networkContext
  } = requestHandler;

  const { ETHBalanceRefundApp } = networkContext;

  const [peerAddress] = await getPeersAddressFromChannel(
    publicIdentifier,
    store,
    params.multisigAddress
  );

  const stateChannel = await store.getStateChannel(params.multisigAddress);

  const refundApp = stateChannel.getAppInstanceOfKind(ETHBalanceRefundApp);

  const {
    stateChannel: updatedStateChannel
  } = (await instructionExecutor.runUninstallProtocol(stateChannel, {
    initiatingXpub: publicIdentifier,
    respondingXpub: peerAddress,
    multisigAddress: stateChannel.multisigAddress,
    appIdentityHash: refundApp.identityHash
  })) as DirectChannelProtocolContext;

  await store.saveStateChannel(updatedStateChannel);
}
