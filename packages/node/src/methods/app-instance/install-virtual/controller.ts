import { Node } from "@counterfactual/types";
import { jsonRpcMethod } from "rpc-server";

import { RequestHandler } from "../../../request-handler";
import { InstallVirtualMessage, NODE_EVENTS } from "../../../types";
import { getCreate2MultisigAddress, prettyPrintObject } from "../../../utils";
import { NodeController } from "../../controller";
import { NO_MULTISIG_FOR_APP_INSTANCE_ID } from "../../errors";

import { installVirtual } from "./operation";

export default class InstallVirtualController extends NodeController {
  @jsonRpcMethod(Node.RpcMethodName.INSTALL_VIRTUAL)
  public executeMethod = super.executeMethod;

  protected async getRequiredLockNames(
    requestHandler: RequestHandler,
    params: Node.InstallVirtualParams
  ) {
    const { store, publicIdentifier, networkContext } = requestHandler;
    const { appInstanceId, intermediaryIdentifier } = params;

    const multisigAddressWithHub = getCreate2MultisigAddress(
      [publicIdentifier, intermediaryIdentifier],
      networkContext.ProxyFactory,
      networkContext.MinimumViableMultisig
    );

    const proposal = await store.getAppInstanceProposal(appInstanceId);

    const { proposedByIdentifier } = proposal;

    const multisigAddressWithResponding = getCreate2MultisigAddress(
      [publicIdentifier, proposedByIdentifier],
      networkContext.ProxyFactory,
      networkContext.MinimumViableMultisig
    );

    const multisigAddressBetweenHubAndResponding = getCreate2MultisigAddress(
      [intermediaryIdentifier, proposedByIdentifier],
      networkContext.ProxyFactory,
      networkContext.MinimumViableMultisig
    );

    return [
      multisigAddressWithHub,
      multisigAddressWithResponding,
      multisigAddressBetweenHubAndResponding
    ];
  }

  protected async beforeExecution(
    requestHandler: RequestHandler,
    params: Node.InstallVirtualParams
  ) {
    const { store, publicIdentifier, networkContext } = requestHandler;
    const { intermediaryIdentifier } = params;

    if (!intermediaryIdentifier) {
      throw Error(
        "Cannot install virtual app: you did not provide an intermediary."
      );
    }

    const multisigAddress = getCreate2MultisigAddress(
      [publicIdentifier, intermediaryIdentifier],
      networkContext.ProxyFactory,
      networkContext.MinimumViableMultisig
    );

    const stateChannelWithIntermediary = await store.getStateChannel(
      multisigAddress
    );

    if (!stateChannelWithIntermediary) {
      throw Error(
        "Cannot install virtual app: you do not have a channel with the intermediary provided."
      );
    }

    if (!stateChannelWithIntermediary.freeBalance) {
      throw Error(
        "Cannot install virtual app: channel with intermediary has no free balance app instance installed."
      );
    }
  }

  protected async executeMethodImplementation(
    requestHandler: RequestHandler,
    params: Node.InstallVirtualParams
  ): Promise<Node.InstallVirtualResult> {
    const { store, protocolRunner } = requestHandler;

    const { appInstanceId } = params;

    await store.getAppInstanceProposal(appInstanceId);

    await installVirtual(store, protocolRunner, params);

    return {
      appInstance: (await store.getAppInstance(appInstanceId)).toJson()
    };
  }
}
