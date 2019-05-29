import { BigNumber } from "ethers/utils";
import {
  JsonApiDocument,
  JsonApiErrorsDocument,
  Meta as JsonApiMeta,
  Operation as JsonApiOperation,
  Resource as JsonApiResource
} from "@ebryn/jsonapi-ts";

import {
  AppABIEncodings,
  AppInstanceInfo,
  BlockchainAsset
} from "./data-types";
import {
  Address,
  AppInstanceID,
  SolidityABIEncoderV2Type
} from "./simple-types";

export interface INodeProvider {
  onMessage(callback: (message: Node.Message) => void);
  sendMessage(message: Node.Message);
}

export interface JsonApiINodeProvider {
  onMessage(callback: (message: JsonApi.Document) => void);
  sendMessage(message: JsonApi.Document);
}

export namespace JsonApi {
  // todo: remove operations attr once jsonapi includes it
  export type Document = JsonApiDocument & {
    operations?: JsonApiOperation[];
  };
  export type ErrorsDocument = JsonApiErrorsDocument;
  export type Operation = JsonApiOperation;
  export type Resource = JsonApiResource;
  export type Meta = JsonApiMeta;

  export enum OpName {
    ADD = "add",
    DEPOSIT = "deposit",
    GET = "get",
    GET_STATE = "getState",
    GET_FREE_BALANCE_STATE = "getFreeBalanceState",
    GET_FREE_BALANCE_FOR_STATE = "getFreeBalanceForState",
    INSTALL = "install",
    INSTALL_VIRTUAL = "installVirtual",
    REJECT = "reject",
    REMOVE = "remove",
    TAKE_ACTION = "takeAction",
    UNINSTALL = "uninstall",
    UNINSTALL_VIRTUAL = "uninstallVirtual",
    UPDATE = "update",
    UPDATE_STATE = "updateState",
    WITHDRAW = "withdraw"
  }

  export enum RefType {
    APP = "app",
    CHANNEL = "channel",
    PROPOSAL = "proposal"
  }

  export enum MethodName {
    ERROR = "error",
    CREATE_CHANNEL = "channel:add",
    DEPOSIT = "channel:deposit",
    GET_APP_INSTANCE_DETAILS = "app:get:instance",
    GET_APP_INSTANCES = "app:get",
    GET_CHANNEL_ADDRESSES = "channel:get",
    GET_FREE_BALANCE_STATE = "channel:getFreeBalanceState",
    GET_PROPOSED_APP_INSTANCES = "proposal:get",
    INSTALL = "app:install",
    INSTALL_VIRTUAL = "app:installVirtual",
    PROPOSE_INSTALL = "proposal:install",
    PROPOSE_INSTALL_VIRTUAL = "proposal:installVirtual",
    REJECT_INSTALL = "proposal:reject",
    UPDATE_STATE = "app:updateState",
    GET_STATE = "app:getState",
    TAKE_ACTION = "app:takeAction",
    UNINSTALL = "app:uninstall",
    UNINSTALL_VIRTUAL = "app:uninstallVirtual",
    WITHDRAW = "channel:withdraw"
  }
}

export namespace Node {
  export enum ErrorType {
    ERROR = "error"
  }

  // SOURCE: https://github.com/counterfactual/monorepo/blob/master/packages/cf.js/API_REFERENCE.md#public-methods
  export enum MethodName {
    ACCEPT_STATE = "acceptState",
    CREATE_CHANNEL = "createChannel",
    DEPOSIT = "deposit",
    GET_APP_INSTANCE_DETAILS = "getAppInstanceDetails",
    GET_APP_INSTANCES = "getAppInstances",
    GET_CHANNEL_ADDRESSES = "getChannelAddresses",
    GET_FREE_BALANCE_STATE = "getFreeBalanceState",
    GET_PROPOSED_APP_INSTANCES = "getProposedAppInstances",
    GET_STATE = "getState",
    INSTALL = "install",
    INSTALL_VIRTUAL = "installVirtual",
    PROPOSE_INSTALL = "proposeInstall",
    PROPOSE_INSTALL_VIRTUAL = "proposeInstallVirtual",
    PROPOSE_STATE = "proposeState",
    REJECT_INSTALL = "rejectInstall",
    REJECT_STATE = "rejectState",
    UPDATE_STATE = "updateState",
    TAKE_ACTION = "takeAction",
    UNINSTALL = "uninstall",
    UNINSTALL_VIRTUAL = "uninstallVirtual",
    WITHDRAW = "withdraw"
  }

  // The events that cf.js clients can listen on
  // SOURCE: https://github.com/counterfactual/monorepo/blob/master/packages/cf.js/API_REFERENCE.md#events
  export enum EventName {
    COUNTER_DEPOSIT_CONFIRMED = "counterDepositConfirmed",
    CREATE_CHANNEL = "createChannelEvent",
    DEPOSIT_CONFIRMED = "depositConfirmedEvent",
    DEPOSIT_FAILED = "depositFailed",
    DEPOSIT_STARTED = "depositStartedEvent",
    INSTALL = "installEvent",
    INSTALL_VIRTUAL = "installVirtualEvent",
    PROPOSE_STATE = "proposeStateEvent",
    REJECT_INSTALL = "rejectInstallEvent",
    REJECT_STATE = "rejectStateEvent",
    UNINSTALL = "uninstallEvent",
    UNINSTALL_VIRTUAL = "uninstallVirtualEvent",
    UPDATE_STATE = "updateStateEvent",
    WITHDRAWAL_CONFIRMED = "withdrawalConfirmedEvent",
    WITHDRAWAL_FAILED = "withdrawalFailed",
    WITHDRAWAL_STARTED = "withdrawalStartedEvent",
    PROPOSE_INSTALL = "proposeInstallEvent",
    PROPOSE_INSTALL_VIRTUAL = "proposeInstallVirtualEvent",
    PROTOCOL_MESSAGE_EVENT = "protocolMessageEvent",
    WITHDRAW_EVENT = "withdrawEvent",
    REJECT_INSTALL_VIRTUAL = "rejectInstallVirtualEvent"
  }

  export type DepositParams = {
    multisigAddress: string;
    amount: BigNumber;
    notifyCounterparty?: boolean;
  };

  export type DepositResult = {
    multisigBalance: BigNumber;
  };

  export type WithdrawParams = {
    multisigAddress: string;
    recipient?: string;
    amount: BigNumber;
  };

  export type WithdrawResult = {
    recipient: string;
    amount: BigNumber;
  };

  export type GetFreeBalanceStateParams = {
    multisigAddress: string;
  };

  export type GetFreeBalanceStateResult = {
    alice: Address;
    bob: Address;
    aliceBalance: BigNumber;
    bobBalance: BigNumber;
  };

  export type GetAppInstancesParams = {};

  export type GetProposedAppInstancesParams = {};

  export type GetAppInstancesResult = {
    appInstances: AppInstanceInfo[];
  };

  export type GetProposedAppInstancesResult = {
    appInstances: AppInstanceInfo[];
  };

  export type ProposeInstallParams = {
    appId: Address;
    abiEncodings: AppABIEncodings;
    asset: BlockchainAsset;
    myDeposit: BigNumber;
    peerDeposit: BigNumber;
    timeout: BigNumber;
    initialState: SolidityABIEncoderV2Type;
    proposedToIdentifier: string;
  };

  export type ProposeInstallResult = {
    appInstanceId: AppInstanceID;
  };

  export type ProposeInstallVirtualParams = ProposeInstallParams & {
    intermediaries: string[];
  };

  export type ProposeInstallVirtualResult = ProposeInstallResult;

  export type RejectInstallParams = {
    appInstanceId: AppInstanceID;
  };

  export type RejectInstallResult = {};

  export type InstallParams = {
    appInstanceId: AppInstanceID;
  };

  export type InstallResult = {
    appInstance: AppInstanceInfo;
  };

  export type InstallVirtualParams = InstallParams & {
    intermediaries: string[];
  };

  export type InstallVirtualResult = InstallResult;

  export type GetStateParams = {
    appInstanceId: AppInstanceID;
  };

  export type GetStateResult = {
    state: SolidityABIEncoderV2Type;
  };

  export type GetAppInstanceDetailsParams = {
    appInstanceId: AppInstanceID;
  };

  export type GetAppInstanceDetailsResult = {
    appInstance: AppInstanceInfo;
  };

  export type UpdateStateParams = {
    appInstanceId: AppInstanceID;
    newState: SolidityABIEncoderV2Type;
  };

  export type UpdateStateResult = {
    newState: SolidityABIEncoderV2Type;
  };

  export type TakeActionParams = {
    appInstanceId: AppInstanceID;
    action: SolidityABIEncoderV2Type;
  };

  export type TakeActionResult = {
    newState: SolidityABIEncoderV2Type;
  };

  export type UninstallParams = {
    appInstanceId: AppInstanceID;
  };

  export type UninstallResult = {};

  export type UninstallVirtualParams = UninstallParams & {
    intermediaryIdentifier: string;
  };

  export type UninstallVirtualResult = UninstallResult;

  export type CreateChannelParams = {
    owners: Address[];
  };

  export type CreateChannelTransactionResult = {
    transactionHash: string;
  };

  export type CreateChannelResult = {
    multisigAddress: string;
    owners: string[];
    counterpartyXpub: string;
  };

  export type GetChannelAddressesParams = {};

  export type GetChannelAddressesResult = {
    multisigAddresses: Address[];
  };

  export type MethodParams =
    | GetAppInstancesParams
    | GetProposedAppInstancesParams
    | ProposeInstallParams
    | ProposeInstallVirtualParams
    | RejectInstallParams
    | InstallParams
    | InstallVirtualParams
    | GetStateParams
    | GetAppInstanceDetailsParams
    | TakeActionParams
    | UninstallParams
    | CreateChannelParams
    | GetChannelAddressesParams;

  export type MethodResult =
    | GetAppInstancesResult
    | GetProposedAppInstancesResult
    | ProposeInstallResult
    | ProposeInstallVirtualResult
    | RejectInstallResult
    | InstallResult
    | InstallVirtualResult
    | GetStateResult
    | GetAppInstanceDetailsResult
    | TakeActionResult
    | UninstallResult
    | CreateChannelResult
    | GetChannelAddressesResult;

  export type InstallEventData = {
    appInstanceId: AppInstanceID;
  };

  export type RejectInstallEventData = {
    appInstance: AppInstanceInfo;
  };

  export type UpdateStateEventData = {
    appInstanceId: AppInstanceID;
    newState: SolidityABIEncoderV2Type;
    action?: SolidityABIEncoderV2Type;
  };

  export type UninstallEventData = {
    appInstanceId: string;
  };

  export type WithdrawEventData = {
    amount: BigNumber;
  };

  export type CreateMultisigEventData = {
    owners: Address[];
    multisigAddress: Address;
  };

  export type EventData =
    | InstallEventData
    | RejectInstallEventData
    | UpdateStateEventData
    | UninstallEventData
    | CreateMultisigEventData;

  export type MethodMessage = {
    type: MethodName;
    requestId: string;
  };

  export type MethodRequest = MethodMessage & {
    params: MethodParams;
  };

  export type MethodResponse = MethodMessage & {
    result: MethodResult;
  };

  export type Event = {
    type: EventName;
    data: EventData;
  };

  export type Error = {
    type: ErrorType;
    requestId?: string;
    data: {
      errorName: string;
      message?: string;
      appInstanceId?: string;
      extra?: { [k: string]: string | number | boolean | object };
    };
  };

  export type Message = MethodRequest | MethodResponse | Event | Error;
}