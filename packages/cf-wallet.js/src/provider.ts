import {
  Address,
  AppInstanceID,
  AppInstanceInfo,
  INodeProvider,
  Node
} from "@counterfactual/types";
import { BigNumber } from "ethers/utils";
import EventEmitter from "eventemitter3";

import { AppInstance } from "./app-instance";
import { CounterfactualEvent, EventType } from "./types";

/**
 * Milliseconds until a method request to the Node is considered timed out.
 */
export const NODE_REQUEST_TIMEOUT = 20000;

/**
 * Provides convenience methods for interacting with a Counterfactual node
 */
export class Provider {
  /** @ignore */
  private readonly requestListeners: {
    [requestId: string]: (msg: Node.Message) => void;
  } = {};
  /** @ignore */
  private readonly eventEmitter = new EventEmitter();
  /** @ignore */
  private readonly appInstances: { [appInstanceId: string]: AppInstance } = {};
  private readonly validEventTypes = Object.keys(EventType).map(
    key => EventType[key]
  );

  /**
   * Construct a new instance
   * @param nodeProvider NodeProvider instance that enables communication with the Counterfactual node
   */
  constructor(readonly nodeProvider: INodeProvider) {
    this.nodeProvider.onMessage(this.onNodeMessage.bind(this));
  }

  /**
   * Install a non-virtual app instance given its ID.
   *
   * @note
   * Installs non-virtual app instances i.e. in a direct channel between you and your peer.
   * For virtual app instances use [[installVirtual]].
   *
   * @async
   *
   * @param appInstanceId ID of the app instance to be installed, generated using [[AppFactory.proposeInstall]]
   * @return Installed AppInstance
   */
  async install(appInstanceId: AppInstanceID): Promise<AppInstance> {
    const response = await this.callRawNodeMethod(Node.MethodName.INSTALL, {
      appInstanceId
    });
    const { appInstance } = response.result as Node.InstallResult;
    return this.getOrCreateAppInstance(appInstanceId, appInstance);
  }

  /**
   * Install a virtual app instance given its ID and a list of intermediaries.
   *
   * @note
   * Installs virtual app instances i.e. routed through at least one intermediary channel.
   * For non-virtual app instances use [[install]].
   *
   * @async
   *
   * @param appInstanceId ID of the app instance to be installed, generated with [[AppFactory.proposeInstallVirtual]].
   * @param intermediaries Array of addresses of intermediary peers to route installation through
   * @return Installed AppInstance
   */
  async installVirtual(
    appInstanceId: AppInstanceID,
    intermediaries: Address[]
  ): Promise<AppInstance> {
    const response = await this.callRawNodeMethod(
      Node.MethodName.INSTALL_VIRTUAL,
      {
        appInstanceId,
        intermediaries
      }
    );
    const { appInstance } = response.result as Node.InstallVirtualResult;
    return this.getOrCreateAppInstance(appInstanceId, appInstance);
  }

  /**
   * Reject installation of a proposed app instance
   *
   * @async
   *
   * @param appInstanceId ID of the app instance to reject
   */
  async rejectInstall(appInstanceId: AppInstanceID) {
    await this.callRawNodeMethod(Node.MethodName.REJECT_INSTALL, {
      appInstanceId
    });
  }

  /**
   * Creates a channel by deploying a multisignature wallet contract.
   *
   * @async
   *
   * @param owners The channel's owning addresses
   * @return transactionHash for the channel creation
   */
  async createChannel(owners: Address[]): Promise<string> {
    const response = await this.callRawNodeMethod(
      Node.MethodName.CREATE_CHANNEL,
      {
        owners
      }
    );

    const {
      transactionHash
    } = response.result as Node.CreateChannelTransactionResult;

    return transactionHash;

    // ALTERNATIVELY: return the actual multisig address??
    //
    // return new Promise((resolve) => {
    //   this.once(
    //     EventType.CREATE_CHANNEL,
    //     (createChannelMsg: CounterfactualEvent) => {
    //       const { multisigAddress } = createChannelMsg.data as Node.CreateChannelResult;
    //       resolve(multisigAddress);
    //     }
    //   );
    // });
  }

  /**
   * Deposits the specified amount of funds into the channel
   * with the specified multisig address.
   *
   * @async
   *
   * @param multisigAddress Address of the state channel multisig
   * @param amount BigNumber representing the deposit's value
   * @param notifyCounterparty Boolean
   */
  async deposit(
    multisigAddress: Address,
    amount: BigNumber,
    notifyCounterparty: boolean = true
  ) {
    await this.callRawNodeMethod(Node.MethodName.DEPOSIT, {
      multisigAddress,
      amount,
      notifyCounterparty
    });
  }

  /**
   * Withdraws the specified amount of funds into the channel
   * with the specified multisig address.
   *
   * @async
   *
   * @param multisigAddress Address of the state channel multisig
   * @param amount BigNumber representing the deposit's value
   * @param recipient Address of the party that should receive the withdrawn funds
   */
  async withdraw(
    multisigAddress: Address,
    amount: BigNumber,
    recipient: Address
  ) {
    await this.callRawNodeMethod(Node.MethodName.WITHDRAW, {
      multisigAddress,
      recipient,
      amount
    });
  }

  /**
   * Queries for the current free balance state of the channel
   * with the specified multisig address.
   *
   * @async
   *
   * @param multisigAddress Address of the state channel multisig
   * @return GetFreeBalanceStateResult
   */
  async getFreeBalanceState(
    multisigAddress: Address
  ): Promise<Node.GetFreeBalanceStateResult> {
    const response = await this.callRawNodeMethod(
      Node.MethodName.GET_FREE_BALANCE_STATE,
      {
        multisigAddress
      }
    );

    return response.result as Node.GetFreeBalanceStateResult;
  }

  /**
   * Subscribe to event.
   *
   * @async
   *
   * @param eventType Event type to subscribe to.
   * @param callback Function to be called when event is fired.
   */
  on(eventType: EventType, callback: (e: CounterfactualEvent) => void) {
    this.validateEventType(eventType);
    this.eventEmitter.on(eventType, callback);
  }

  /**
   * Subscribe to event. Unsubscribe once event is fired once.
   *
   * @param eventType Event type to subscribe to.
   * @param callback Function to be called when event is fired.
   */
  once(eventType: EventType, callback: (e: CounterfactualEvent) => void) {
    this.validateEventType(eventType);
    this.eventEmitter.once(eventType, callback);
  }

  /**
   * Unsubscribe from event.
   *
   * @param eventType Event type to unsubscribe from.
   * @param callback Original callback passed to subscribe call.
   */
  off(eventType: EventType, callback: (e: CounterfactualEvent) => void) {
    this.validateEventType(eventType);
    this.eventEmitter.off(eventType, callback);
  }

  /**
   * Call a Node method
   *
   * @param methodName Name of Node method to call
   * @param params Method-specific parameter object
   */
  async callRawNodeMethod(
    methodName: Node.MethodName,
    params: Node.MethodParams
  ): Promise<Node.MethodResponse> {
    const requestId = new Date().valueOf().toString();
    return new Promise<Node.MethodResponse>((resolve, reject) => {
      const request: Node.MethodRequest = {
        requestId,
        params,
        type: methodName
      };
      this.requestListeners[requestId] = response => {
        if (response.type === Node.ErrorType.ERROR) {
          return reject({
            type: EventType.ERROR,
            data: response.data
          });
        }
        if (response.type !== methodName) {
          return reject({
            type: EventType.ERROR,
            data: {
              errorName: "unexpected_message_type",
              message: `Unexpected response type. Expected ${methodName}, got ${
                response.type
              }`
            }
          });
        }
        resolve(response as Node.MethodResponse);
      };
      setTimeout(() => {
        if (this.requestListeners[requestId] !== undefined) {
          reject({
            type: EventType.ERROR,
            data: {
              errorName: "request_timeout",
              message: `Request timed out: ${JSON.stringify(request)}`
            }
          });
          delete this.requestListeners[requestId];
        }
      }, NODE_REQUEST_TIMEOUT);
      this.nodeProvider.sendMessage(request);
    });
  }

  /**
   * Get app instance given its ID.
   * If one doesn't exist, it will be created and its details will be loaded from the Node.
   *
   * @param id ID of app instance
   * @param info Optional info to be used to create app instance if it doesn't exist
   * @return App instance
   */
  async getOrCreateAppInstance(
    id: AppInstanceID,
    info?: AppInstanceInfo
  ): Promise<AppInstance> {
    if (!(id in this.appInstances)) {
      let newInfo;
      if (info) {
        newInfo = info;
      } else {
        const { result } = await this.callRawNodeMethod(
          Node.MethodName.GET_APP_INSTANCE_DETAILS,
          { appInstanceId: id }
        );
        newInfo = (result as Node.GetAppInstanceDetailsResult).appInstance;
      }
      this.appInstances[id] = new AppInstance(newInfo, this);
    }
    return this.appInstances[id];
  }

  /**
   * @ignore
   */
  private validateEventType(eventType: EventType) {
    if (!this.validEventTypes.includes(eventType)) {
      throw new Error(`"${eventType}" is not a valid event`);
    }
  }

  /**
   * @ignore
   */
  private onNodeMessage(message: Node.Message) {
    const type = message.type;
    if (Object.values(Node.ErrorType).indexOf(type) !== -1) {
      this.handleNodeError(message as Node.Error);
    } else if ((message as Node.MethodResponse).requestId) {
      this.handleNodeMethodResponse(message as Node.MethodResponse);
    } else {
      this.handleNodeEvent(message as Node.Event);
    }
  }

  /**
   * @ignore
   */
  private handleNodeError(error: Node.Error) {
    const requestId = error.requestId;
    if (requestId && this.requestListeners[requestId]) {
      this.requestListeners[requestId](error);
      delete this.requestListeners[requestId];
    }
    this.eventEmitter.emit(error.type, error);
  }

  /**
   * @ignore
   */
  private handleNodeMethodResponse(response: Node.MethodResponse) {
    const { requestId } = response;
    if (requestId in this.requestListeners) {
      this.requestListeners[requestId](response);
      delete this.requestListeners[requestId];
    } else {
      const error = {
        type: EventType.ERROR,
        data: {
          errorName: "orphaned_response",
          message: `Response has no corresponding inflight request: ${JSON.stringify(
            response
          )}`
        }
      };
      this.eventEmitter.emit(error.type, error);
    }
  }

  /**
   * @ignore
   */
  private async handleNodeEvent(nodeEvent: Node.Event) {
    switch (nodeEvent.type) {
      case Node.EventName.REJECT_INSTALL:
        return this.handleRejectInstallEvent(nodeEvent);

      case Node.EventName.INSTALL:
        return this.handleInstallEvent(nodeEvent);

      case Node.EventName.INSTALL_VIRTUAL:
        return this.handleInstallVirtualEvent(nodeEvent);

      default:
        return this.handleUnexpectedEvent(nodeEvent);
    }
  }

  /**
   * @ignore
   */
  private handleUnexpectedEvent(nodeEvent: Node.Event) {
    const event = {
      type: EventType.ERROR,
      data: {
        errorName: "unexpected_event_type",
        message: `Unexpected event type: ${nodeEvent.type}: ${JSON.stringify(
          nodeEvent
        )}`
      }
    };
    return this.eventEmitter.emit(event.type, event);
  }

  /**
   * @ignore
   */
  private async handleInstallEvent(nodeEvent: Node.Event) {
    const { appInstanceId } = nodeEvent.data as Node.InstallEventData;
    const appInstance = await this.getOrCreateAppInstance(appInstanceId);
    const event = {
      type: EventType.INSTALL,
      data: {
        appInstance
      }
    };
    return this.eventEmitter.emit(event.type, event);
  }

  /**
   * @ignore
   */
  private async handleInstallVirtualEvent(nodeEvent: Node.Event) {
    const { appInstanceId } = nodeEvent.data["params"];
    const appInstance = await this.getOrCreateAppInstance(appInstanceId);
    const event = {
      type: EventType.INSTALL_VIRTUAL,
      data: {
        appInstance
      }
    };
    return this.eventEmitter.emit(event.type, event);
  }

  /**
   * @ignore
   */
  private async handleRejectInstallEvent(nodeEvent: Node.Event) {
    const data = nodeEvent.data as Node.RejectInstallEventData;
    const info = data.appInstance;
    const appInstance = await this.getOrCreateAppInstance(info.id, info);
    const event = {
      type: EventType.REJECT_INSTALL,
      data: {
        appInstance
      }
    };
    return this.eventEmitter.emit(event.type, event);
  }
}
