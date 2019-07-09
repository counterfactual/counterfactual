import { Node } from "@counterfactual/types";
import { JsonRpcProvider, TransactionResponse } from "ethers/providers";
import Queue from "p-queue";
import { jsonRpcMethod } from "rpc-server";

import { xkeyKthAddress } from "../../../machine";
import {
  CONVENTION_FOR_ETH_TOKEN_ADDRESS,
  convertCoinTransfersToCoinTransfersMap,
  deserializeFreeBalanceState,
  FreeBalanceStateJSON
} from "../../../models/free-balance";
import { RequestHandler } from "../../../request-handler";
import { NODE_EVENTS } from "../../../types";
import { NodeController } from "../../controller";
import {
  CANNOT_WITHDRAW,
  INSUFFICIENT_FUNDS_TO_WITHDRAW,
  INVALID_WITHDRAW,
  WITHDRAWAL_FAILED
} from "../../errors";

import { runWithdrawProtocol } from "./operation";

export default class WithdrawController extends NodeController {
  public static readonly methodName = Node.MethodName.WITHDRAW;

  @jsonRpcMethod("chan_withdraw")
  public executeMethod = super.executeMethod;

  protected async enqueueByShard(
    requestHandler: RequestHandler,
    params: Node.WithdrawParams
  ): Promise<Queue[]> {
    const { store, getSignerAddress } = requestHandler;

    const stateChannel = await store.getStateChannel(params.multisigAddress);

    const freeBalance = deserializeFreeBalanceState(stateChannel.freeBalance
      .state as FreeBalanceStateJSON);

    const tokenAddress =
      params.tokenAddress || CONVENTION_FOR_ETH_TOKEN_ADDRESS;

    if (!(tokenAddress in freeBalance)) {
      throw new Error(INVALID_WITHDRAW(tokenAddress));
    }

    const tokenFreeBalance = convertCoinTransfersToCoinTransfersMap(
      freeBalance[tokenAddress]
    );
    const senderBalance = tokenFreeBalance[await getSignerAddress()];
    if (senderBalance.lt(params.amount)) {
      throw new Error(
        INSUFFICIENT_FUNDS_TO_WITHDRAW(
          tokenAddress,
          params.amount,
          senderBalance
        )
      );
    }

    return [requestHandler.getShardedQueue(params.multisigAddress)];
  }

  protected async beforeExecution(
    requestHandler: RequestHandler,
    params: Node.WithdrawParams
  ): Promise<void> {
    const { store, networkContext } = requestHandler;
    const { multisigAddress } = params;

    const stateChannel = await store.getStateChannel(multisigAddress);

    if (
      stateChannel.hasAppInstanceOfKind(networkContext.CoinBalanceRefundApp)
    ) {
      throw new Error(CANNOT_WITHDRAW);
    }
  }

  protected async executeMethodImplementation(
    requestHandler: RequestHandler,
    params: Node.WithdrawParams
  ): Promise<Node.WithdrawResult> {
    const {
      store,
      provider,
      wallet,
      publicIdentifier,
      blocksNeededForConfirmation
    } = requestHandler;
    const { multisigAddress, amount, recipient } = params;

    params.recipient = recipient || xkeyKthAddress(publicIdentifier, 0);

    await runWithdrawProtocol(requestHandler, params);

    const commitment = await store.getWithdrawalCommitment(multisigAddress);

    if (!commitment) {
      throw Error("no commitment found");
    }

    const tx = {
      ...commitment,
      gasPrice: await provider.getGasPrice(),
      gasLimit: 300000
    };

    try {
      let txResponse: TransactionResponse;

      if (provider instanceof JsonRpcProvider) {
        const signer = await provider.getSigner();
        txResponse = await signer.sendTransaction(tx);
      } else {
        txResponse = await wallet.sendTransaction(tx);
      }

      requestHandler.outgoing.emit(NODE_EVENTS.WITHDRAWAL_STARTED, {
        value: amount,
        txHash: txResponse.hash
      });

      await provider.waitForTransaction(
        txResponse.hash as string,
        blocksNeededForConfirmation
      );
    } catch (e) {
      requestHandler.outgoing.emit(NODE_EVENTS.WITHDRAWAL_FAILED, e);
      throw new Error(`${WITHDRAWAL_FAILED}: ${e}`);
    }

    return {
      amount,
      recipient: params.recipient
    };
  }
}
