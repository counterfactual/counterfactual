import { Node } from "@counterfactual/types";
import { jsonRpcMethod } from "rpc-server";

import { StateChannel } from "../../../models";
import { RequestHandler } from "../../../request-handler";
import { NodeController } from "../../controller";

import { install } from "./operation";

/**
 * This converts a proposed app instance to an installed app instance while
 * sending an approved ack to the proposer.
 * @param params
 */
export default class InstallController extends NodeController {
  @jsonRpcMethod(Node.RpcMethodName.INSTALL)
  public executeMethod = super.executeMethod;

  protected async getShardKeysForQueueing(
    requestHandler: RequestHandler,
    params: Node.InstallParams
  ): Promise<string[]> {
    const { store } = requestHandler;
    const { appInstanceId } = params;

    const sc = await store.getChannelFromAppInstanceID(appInstanceId);

    return [sc.multisigAddress];
  }

  protected async executeMethodImplementation(
    requestHandler: RequestHandler,
    params: Node.InstallParams
  ): Promise<Node.InstallResult> {
    const { store, protocolRunner, publicIdentifier } = requestHandler;

    const [
      responderAddress
    ] = await StateChannel.getPeersAddressFromAppInstanceID(
      publicIdentifier,
      store,
      params.appInstanceId
    );

    const appInstanceProposal = await install(store, protocolRunner, params);

    return {
      appInstance: (await store.getAppInstance(
        appInstanceProposal.identityHash
      )).toJson()
    };
  }
}
