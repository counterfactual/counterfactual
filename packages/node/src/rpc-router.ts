import { Node } from "@counterfactual/types";
import {
  Controller,
  JsonRpcResponse,
  jsonRpcSerializeAsResponse,
  Router,
  Rpc
} from "rpc-server";

import { RequestHandler } from "./request-handler";

type AsyncCallback = (...args: any) => Promise<any>;

export default class RpcRouter extends Router {
  private readonly requestHandler: RequestHandler;

  constructor({
    controllers,
    requestHandler
  }: {
    controllers: (typeof Controller)[];
    requestHandler: RequestHandler;
  }) {
    super({ controllers });

    this.requestHandler = requestHandler;
  }

  async dispatch(rpc: Rpc): Promise<JsonRpcResponse> {
    const controller = Object.values(Controller.rpcMethods).find(
      mapping => mapping.method === rpc.methodName
    );

    if (!controller) {
      throw Error(`Cannot execute ${rpc.methodName}: no controller`);
    }

    const result = jsonRpcSerializeAsResponse(
      {
        result: await new controller.type()[controller.callback](
          this.requestHandler,
          rpc.parameters
        ),
        type: rpc.methodName
      },
      rpc.id as number
    );

    this.requestHandler.outgoing.emit(rpc.methodName, result);

    return result;
  }

  async subscribe(event: string, callback: AsyncCallback) {
    this.requestHandler.outgoing.on(event, callback);
  }

  async subscribeOnce(event: string, callback: AsyncCallback) {
    this.requestHandler.outgoing.once(event, callback);
  }

  async unsubscribe(event: string, callback?: AsyncCallback) {
    this.requestHandler.outgoing.off(event, callback);
  }

  async emit(event: string, data: any, emitter = "incoming") {
    let eventData = data;

    if (!eventData["jsonrpc"]) {
      // It's a legacy message. Reformat it to JSONRPC.
      eventData = jsonRpcSerializeAsResponse(eventData, Date.now());
    }

    this.requestHandler[emitter].emit(event, eventData.result);
  }

  eventListenerCount(event: string): number {
    return typeof this.requestHandler.outgoing.listenerCount === "function"
      ? this.requestHandler.outgoing.listenerCount(event)
      : 0;
  }

  mapRPCMethodNameToFinishedEventName(methodName: string): Node.EventName {
    console.log(
      `Mapping RPC method name to finished event name: ${methodName}`
    );
    switch (methodName) {
      case "chan_create":
        return Node.EventName.SETUP_FINISHED;
      case "chan_deposit":
        return Node.EventName.DEPOSIT_FINISHED;
      case "chan_install":
        return Node.EventName.INSTALL_FINISHED;
      case "chan_uninstall":
        return Node.EventName.UNINSTALL_FINISHED;
      case "chan_installVirtual":
        return Node.EventName.INSTALL_VIRTUAL_FINISHED;
      case "chan_uninstallVirtual":
        return Node.EventName.UNINSTALL_VIRTUAL_FINISHED;
      case "chan_withdraw":
        return Node.EventName.WITHDRAWAL_FINISHED;
      default:
        return methodName as any;
    }
  }
}
