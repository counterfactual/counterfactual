import { Node } from "@counterfactual/types";
import { JsonRpcProvider, TransactionResponse } from "ethers/providers";
import Queue from "p-queue";
import { jsonRpcMethod } from "rpc-server";

import { CONVENTION_FOR_ETH_TOKEN_ADDRESS } from "../../../constants";
import { xkeyKthAddress } from "../../../machine";
import { RequestHandler } from "../../../request-handler";
import { NODE_EVENTS } from "../../../types";
import { prettyPrintObject } from "../../../utils";
import { NodeController } from "../../controller";
import {
  CANNOT_WITHDRAW,
  INSUFFICIENT_FUNDS_TO_WITHDRAW,
  WITHDRAWAL_FAILED
} from "../../errors";

import { runWithdrawProtocol } from "./operation";

export default class WithdrawController extends NodeController {
  public static readonly methodName = Node.MethodName.WITHDRAW;

  @jsonRpcMethod(Node.RpcMethodName.WITHDRAW)
  public executeMethod = super.executeMethod;

  public static async enqueueByShard(
    requestHandler: RequestHandler,
    params: Node.WithdrawParams
  ): Promise<Queue[]> {
    const { store, publicIdentifier, networkContext } = requestHandler;

    const stateChannel = await store.getStateChannel(params.multisigAddress);

    if (
      stateChannel.hasAppInstanceOfKind(networkContext.CoinBalanceRefundApp)
    ) {
      throw new Error(CANNOT_WITHDRAW);
    }

    const tokenAddress =
      params.tokenAddress || CONVENTION_FOR_ETH_TOKEN_ADDRESS;

    const senderBalance = stateChannel
      .getFreeBalanceClass()
      .getBalance(
        tokenAddress,
        stateChannel.getFreeBalanceAddrOf(publicIdentifier)
      );
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

  protected async executeMethodImplementation(
    requestHandler: RequestHandler,
    params: Node.WithdrawParams
  ): Promise<Node.WithdrawResult> {
    const {
      store,
      provider,
      wallet,
      publicIdentifier,
      blocksNeededForConfirmation,
      outgoing
    } = requestHandler;

    const { multisigAddress, amount, recipient } = params;

    params.recipient = recipient || xkeyKthAddress(publicIdentifier, 0);

    await runWithdrawProtocol(requestHandler, params);

    const commitment = await store.getWithdrawalCommitment(multisigAddress);

    if (!commitment) {
      throw new Error("No withdrawal commitment found");
    }

    const tx = {
      ...commitment,
      gasPrice: await provider.getGasPrice(),
      gasLimit: 300000
    };

    let txResponse: TransactionResponse;
    try {
      if (provider instanceof JsonRpcProvider) {
        const signer = await provider.getSigner();
        txResponse = await signer.sendTransaction(tx);
      } else {
        txResponse = await wallet.sendTransaction(tx);
      }

      outgoing.emit(NODE_EVENTS.WITHDRAWAL_STARTED, {
        value: amount,
        txHash: txResponse.hash
      });

      const txReceipt = await provider.waitForTransaction(
        txResponse.hash as string,
        blocksNeededForConfirmation
      );

      outgoing.emit(NODE_EVENTS.WITHDRAWAL_CONFIRMED, {
        txReceipt
      });
    } catch (e) {
      outgoing.emit(NODE_EVENTS.WITHDRAWAL_FAILED, e);
      throw new Error(`${WITHDRAWAL_FAILED}: ${prettyPrintObject(e)}`);
    }

    return {
      recipient: params.recipient,
      txHash: txResponse.hash!
    };
  }
}
