import { NetworkContext } from "@counterfactual/types";
import { Signature } from "ethers/utils";

import { EthereumCommitment } from "./ethereum/utils";
import { AppInstance, StateChannel } from "./models";
import { Opcode } from "./opcodes";
import { ProtocolMessage } from "./protocol-types-tbd";

export enum Protocol {
  Setup = "setup",
  Install = "install",
  Update = "update",
  Uninstall = "uninstall",
  InstallVirtualApp = "install-virtual-app"
}

export type ProtocolExecutionFlow = {
  [x: number]: Instruction[];
};

export type Middleware = {
  (message: ProtocolMessage, next: Function, context: Context): void;
};

export type Instruction = Function | Opcode;

/// TODO(ldct): the following fields are hacked in to make install-virtual-app work:
/// - commitment2, signature2: the intermediary needs to generate three signatures:
///   two sigs authorizing ETHVirtualAppAgreements, and one authorizing virtualAppSetState.
/// - targetVirtualAppInstance: this is a state modification that should be returned to called, but the current
///   mechanism for returning stuff like this is to modify the `statechannel` parameter. But this parameter
///   is already used for the ledger channel (we write the ETHVirtualAppAgreement instance into it).
export interface Context {
  network: NetworkContext;
  outbox: ProtocolMessage[];
  inbox: ProtocolMessage[];
  stateChannel: StateChannel;
  commitment?: EthereumCommitment;
  commitment2?: EthereumCommitment;
  signature?: Signature;
  signature2?: Signature;
  targetVirtualAppInstance?: AppInstance;
}
