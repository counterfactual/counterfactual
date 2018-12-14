import { AssetType, NetworkContext } from "@counterfactual/types";

import { InstallCommitment } from "../ethereum";
import { AppInstance, StateChannel } from "../models";
import { Opcode } from "../opcodes";
import { InstallData, ProtocolMessage } from "../protocol-types-tbd";
import { Context } from "../types";

import { prepareToSendSignature } from "./signature-forwarder";

/**
 * @description This exchange is described at the following URL:
 *
 * specs.counterfactual.com/05-install-protocol#messages
 *
 */
export const INSTALL_PROTOCOL = {
  0: [
    // Compute the next state of the channel
    proposeStateTransition,

    // Decide whether or not to sign the transition
    Opcode.OP_SIGN,

    // Wrap the signature into a message to be sent
    prepareToSendSignature,

    // Send the message to your counterparty
    Opcode.IO_SEND,

    // Wait for them to countersign the message
    Opcode.IO_WAIT,

    // Verify they did indeed countersign the right thing
    Opcode.OP_SIGN_VALIDATE,

    // Consider the state transition finished and commit it
    Opcode.STATE_TRANSITION_COMMIT
  ],

  1: [
    // Compute the _proposed_ next state of the channel
    proposeStateTransition,

    // Validate your counterparties signature is for the above proposal
    Opcode.OP_SIGN_VALIDATE,

    // Sign the same state update yourself
    Opcode.OP_SIGN,

    // Wrap the signature into a message to be sent
    prepareToSendSignature,

    // Send the message to your counterparty
    Opcode.IO_SEND,

    // Consider the state transition finished and commit it
    Opcode.STATE_TRANSITION_COMMIT
  ]
};

function proposeStateTransition(
  message: ProtocolMessage,
  context: Context,
  state: StateChannel
) {
  const {
    aliceBalanceDecrement,
    bobBalanceDecrement,
    signingKeys,
    initialState,
    terms,
    appInterface,
    defaultTimeout
  } = message.params as InstallData;

  const app = new AppInstance(
    state.multisigAddress,
    signingKeys,
    defaultTimeout,
    appInterface,
    terms,
    // KEY: Sets it to NOT be a MetaChannelApp
    false,
    // KEY: The app sequence number
    // FIXME: Add to InstallData?
    42,
    initialState,
    // KEY: Set the nonce to be 0
    0,
    defaultTimeout
  );

  context.stateChannel = state.installApp(
    app,
    aliceBalanceDecrement,
    bobBalanceDecrement
  );

  context.operation = constructInstallOp(
    context.network,
    context.stateChannel,
    app.id
  );
}

export function constructInstallOp(
  network: NetworkContext,
  stateChannel: StateChannel,
  appInstanceId: string
) {
  const app = stateChannel.apps.get(appInstanceId);

  if (app === undefined) {
    throw Error(
      "Attempted to construct InstallApp commitment with undefined app"
    );
  }

  const freeBalance = stateChannel.getFreeBalanceFor(AssetType.ETH);

  return new InstallCommitment(
    network,
    stateChannel.multisigAddress,
    stateChannel.multisigOwners,
    app.identity,
    app.terms,
    freeBalance.identity,
    freeBalance.terms,
    freeBalance.hashOfLatestState,
    freeBalance.latestNonce,
    freeBalance.latestTimeout,
    freeBalance.dependencyReferenceNonce
  );
}
