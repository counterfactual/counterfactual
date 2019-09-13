import { Node } from "@counterfactual/types";
import { jsonRpcMethod } from "rpc-server";

import { RequestHandler } from "../../../request-handler";
import { NODE_EVENTS, ProposeVirtualMessage } from "../../../types";
import { getCreate2MultisigAddress } from "../../../utils";
import { NodeController } from "../../controller";
import { NULL_INITIAL_STATE_FOR_PROPOSAL } from "../../errors";

import {
  createProposedVirtualAppInstance,
  getNextNodeAddress
} from "./operation";

/**
 * This creates an entry of a proposed Virtual AppInstance while sending the
 * proposal to the intermediaryIdentifier and the responder Node.
 * @param params
 * @returns The AppInstanceId for the proposed AppInstance
 */
export default class ProposeInstallVirtualController extends NodeController {
  @jsonRpcMethod(Node.RpcMethodName.PROPOSE_INSTALL_VIRTUAL)
  public executeMethod = super.executeMethod;

  protected async getRequiredLockNames(
    requestHandler: RequestHandler,
    params: Node.ProposeInstallVirtualParams
  ): Promise<string[]> {
    const { publicIdentifier, networkContext } = requestHandler;
    const { proposedToIdentifier, intermediaryIdentifier } = params;

    const multisigAddress = getCreate2MultisigAddress(
      [publicIdentifier, intermediaryIdentifier],
      networkContext.ProxyFactory,
      networkContext.MinimumViableMultisig
    );

    const metachannelAddress = getCreate2MultisigAddress(
      [publicIdentifier, proposedToIdentifier],
      networkContext.ProxyFactory,
      networkContext.MinimumViableMultisig
    );

    return [multisigAddress, metachannelAddress];
  }

  protected async executeMethodImplementation(
    requestHandler: RequestHandler,
    params: Node.ProposeInstallVirtualParams
  ): Promise<Node.ProposeInstallVirtualResult> {
    const {
      store,
      publicIdentifier,
      messagingService,
      networkContext
    } = requestHandler;

    const { initialState, proposedToIdentifier } = params;

    if (!initialState) {
      throw Error(NULL_INITIAL_STATE_FOR_PROPOSAL);
    }
    // TODO: check if channel is open with the first intermediary
    // and that there are sufficient funds

    // TODO: Also create the proposed eth virtual app agreement

    const appInstanceId = await createProposedVirtualAppInstance(
      publicIdentifier,
      store,
      params,
      networkContext
    );

    const proposalMsg: ProposeVirtualMessage = {
      from: publicIdentifier,
      type: NODE_EVENTS.PROPOSE_INSTALL_VIRTUAL,
      data: {
        params,
        appInstanceId,
        proposedByIdentifier: publicIdentifier
      }
    };

    await messagingService.send(proposedToIdentifier, proposalMsg);

    return {
      appInstanceId
    };
  }
}
