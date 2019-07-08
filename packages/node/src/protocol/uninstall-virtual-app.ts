import { NetworkContext } from "@counterfactual/types";
import { BaseProvider } from "ethers/providers";
import { fromExtendedKey } from "ethers/utils/hdnode";

import { SetStateCommitment, VirtualAppSetStateCommitment } from "../ethereum";
import { ProtocolExecutionFlow } from "../machine";
import { Opcode, Protocol } from "../machine/enums";
import {
  Context,
  ProtocolMessage,
  ProtocolParameters,
  UninstallVirtualAppParams
} from "../machine/types";
import { computeUniqueIdentifierForStateChannelThatWrapsVirtualApp } from "../machine/virtual-app-unique-identifier";
import { xkeyKthAddress } from "../machine/xkeys";
import { StateChannel } from "../models";

import { getChannelFromCounterparty } from "./utils/get-channel-from-counterparty";
import { computeFreeBalanceIncrements } from "./utils/get-outcome-increments";
import { UNASSIGNED_SEQ_NO } from "./utils/signature-forwarder";
import { requireValidSignatureOrThrowError } from "./utils/signature-validator";

const zA = (xpub: string) => {
  return fromExtendedKey(xpub).derivePath("0").address;
};

/**
 * @description This exchange is described at the following URL:
 *
 * specs.counterfactual.com/en/latest/protocols/uninstall-virtual-app.html
 */
export const UNINSTALL_VIRTUAL_APP_PROTOCOL: ProtocolExecutionFlow = {
  /**
   * Sequence 0 of the UNINSTALL_VIRTUAL_APP_PROTOCOL requires the initiating
   * party to request to the intermediary to lock the state of the virtual app,
   * then upon receiving confirmation it has been locked, then request to the
   * intermediary to uninstall the agreement that was signed locking up the
   * intermediaries capital based on the outcome of the virtul app at the
   * agreed upon locked state.
   *
   * @param {Context} context
   */

  0 /* Initiating */: async function*(context: Context) {
    const {
      message: { protocolExecutionID, params },
      provider
    } = context;

    const {
      intermediaryXpub,
      respondingXpub
    } = params as UninstallVirtualAppParams;

    const intermediaryAddress = xkeyKthAddress(intermediaryXpub, 0);
    const respondingAddress = xkeyKthAddress(respondingXpub, 0);

    const lockCommitment = addVirtualAppStateTransitionToContext(
      params,
      context,
      false
    );

    const signature = yield [Opcode.OP_SIGN, lockCommitment];

    const m4 = yield [
      Opcode.IO_SEND_AND_WAIT,
      {
        // m1
        protocol: Protocol.UninstallVirtualApp,
        protocolExecutionID: protocolExecutionID,
        params: params,
        seq: 1,
        toXpub: intermediaryXpub,
        signature: signature
      } as ProtocolMessage
    ];

    const { signature: s3, signature2: signature2 } = m4;

    requireValidSignatureOrThrowError(respondingAddress, lockCommitment, s3);
    requireValidSignatureOrThrowError(
      intermediaryAddress,
      lockCommitment,
      signature2,
      true
    );

    const uninstallLeft = await addLeftUninstallAgreementToContext(
      params,
      context,
      provider
    );

    const s4 = yield [Opcode.OP_SIGN, uninstallLeft];

    // send m5, wait for m6
    const { signature: s6 } = yield [
      Opcode.IO_SEND_AND_WAIT,
      {
        protocolExecutionID: protocolExecutionID,
        seq: UNASSIGNED_SEQ_NO,
        toXpub: intermediaryXpub,
        signature: s4
      }
    ];

    requireValidSignatureOrThrowError(intermediaryAddress, uninstallLeft, s6);
    removeVirtualAppInstance(params, context);
  },

  1 /* Intermediary */: async function*(context: Context) {
    const {
      message: { protocolExecutionID, params, signature },
      provider
    } = context;

    const {
      initiatingXpub,
      respondingXpub
    } = params as UninstallVirtualAppParams;

    const initiatingAddress = xkeyKthAddress(initiatingXpub, 0);
    const respondingAddress = xkeyKthAddress(respondingXpub, 0);

    const lockCommitment = addVirtualAppStateTransitionToContext(
      params,
      context,
      true
    );

    requireValidSignatureOrThrowError(
      initiatingAddress,
      lockCommitment,
      signature
    );

    const signature2 = yield [Opcode.OP_SIGN_AS_INTERMEDIARY, lockCommitment];

    const m3 = yield [
      Opcode.IO_SEND_AND_WAIT,
      {
        // m2
        protocol: Protocol.UninstallVirtualApp,
        protocolExecutionID: protocolExecutionID,
        params: params,
        seq: 2,
        toXpub: respondingXpub,
        signature: signature,
        signature2: signature2
      } as ProtocolMessage
    ];
    const { signature: s3 } = m3;

    requireValidSignatureOrThrowError(respondingAddress, lockCommitment, s3);

    const m5 = yield [
      Opcode.IO_SEND_AND_WAIT,
      {
        // m4
        protocol: Protocol.UninstallVirtualApp,
        protocolExecutionID: protocolExecutionID,
        seq: UNASSIGNED_SEQ_NO,
        toXpub: initiatingXpub,
        signature: s3,
        signature2: signature2
      } as ProtocolMessage
    ];

    const { signature: s4 } = m5;

    const leftUninstallCommitment = await addLeftUninstallAgreementToContext(
      params,
      context,
      context.provider
    );

    requireValidSignatureOrThrowError(
      initiatingAddress,
      leftUninstallCommitment,
      s4
    );

    const s5 = yield [Opcode.OP_SIGN, leftUninstallCommitment];

    // send m6 without waiting for a reply
    yield [
      Opcode.IO_SEND,
      {
        protocol: Protocol.UninstallVirtualApp,
        protocolExecutionID: protocolExecutionID,
        seq: UNASSIGNED_SEQ_NO,
        toXpub: initiatingXpub,
        signature: s5
      } as ProtocolMessage
    ];

    const rightUninstallCommitment = await addRightUninstallAgreementToContext(
      params,
      context,
      provider
    );

    const s6 = yield [Opcode.OP_SIGN, rightUninstallCommitment];

    const m8 = yield [
      Opcode.IO_SEND_AND_WAIT,
      {
        // m7
        protocol: Protocol.UninstallVirtualApp,
        protocolExecutionID: protocolExecutionID,
        seq: UNASSIGNED_SEQ_NO,
        toXpub: respondingXpub,
        signature: s6
      } as ProtocolMessage
    ];
    const { signature: s7 } = m8;

    requireValidSignatureOrThrowError(
      respondingAddress,
      rightUninstallCommitment,
      s7
    );

    removeVirtualAppInstance(params, context);
  },

  2 /* Responding */: async function*(context: Context) {
    const {
      message: { protocolExecutionID, params, signature, signature2 },
      provider
    } = context;

    const {
      initiatingXpub,
      intermediaryXpub
    } = params as UninstallVirtualAppParams;

    const initiatingAddress = xkeyKthAddress(initiatingXpub, 0);
    const intermediaryAddress = xkeyKthAddress(intermediaryXpub, 0);

    const lockCommitment = addVirtualAppStateTransitionToContext(
      params,
      context,
      false
    );

    requireValidSignatureOrThrowError(
      initiatingAddress,
      lockCommitment,
      signature
    );

    requireValidSignatureOrThrowError(
      intermediaryAddress,
      lockCommitment,
      signature2,
      true
    );

    const s3 = yield [Opcode.OP_SIGN, lockCommitment];

    const m7 = yield [
      Opcode.IO_SEND_AND_WAIT,
      {
        // m3
        protocolExecutionID,
        protocol: Protocol.UninstallVirtualApp,
        seq: UNASSIGNED_SEQ_NO,
        toXpub: intermediaryXpub,
        signature: s3
      } as ProtocolMessage
    ];

    const { signature: s6 } = m7;

    const rightUninstallCommitment = await addRightUninstallAgreementToContext(
      params,
      context,
      provider
    );

    requireValidSignatureOrThrowError(
      intermediaryAddress,
      rightUninstallCommitment,
      s6
    );

    const s7 = yield [Opcode.OP_SIGN, rightUninstallCommitment];

    yield [
      Opcode.IO_SEND,
      {
        protocolExecutionID,
        protocol: Protocol.UninstallVirtualApp,
        seq: UNASSIGNED_SEQ_NO,
        toXpub: intermediaryXpub,
        signature: s7
      } as ProtocolMessage
    ];

    removeVirtualAppInstance(params, context);
  }
};

function removeVirtualAppInstance(
  params: ProtocolParameters,
  context: Context
) {
  const {
    intermediaryXpub,
    respondingXpub,
    initiatingXpub,
    targetAppIdentityHash
  } = params as UninstallVirtualAppParams;

  const key = computeUniqueIdentifierForStateChannelThatWrapsVirtualApp(
    [initiatingXpub, respondingXpub],
    intermediaryXpub
  );

  const sc = context.stateChannelsMap.get(key)!;

  context.stateChannelsMap.set(key, sc.removeVirtualApp(targetAppIdentityHash));
}

function addVirtualAppStateTransitionToContext(
  params: ProtocolParameters,
  context: Context,
  isIntermediary: boolean
): VirtualAppSetStateCommitment {
  const {
    intermediaryXpub,
    respondingXpub,
    initiatingXpub,
    targetAppIdentityHash,
    targetAppState
  } = params as UninstallVirtualAppParams;

  const key = computeUniqueIdentifierForStateChannelThatWrapsVirtualApp(
    [initiatingXpub, respondingXpub],
    intermediaryXpub
  );

  let sc = context.stateChannelsMap.get(key) as StateChannel;

  if (isIntermediary) {
    sc = sc.setState(targetAppIdentityHash, targetAppState);
  }

  sc = sc.lockAppInstance(targetAppIdentityHash);
  const targetAppInstance = sc.getAppInstance(targetAppIdentityHash);

  context.stateChannelsMap.set(key, sc);

  // post-expiry lock commitment
  return new VirtualAppSetStateCommitment(
    context.network,
    targetAppInstance.identity,
    targetAppInstance.defaultTimeout,
    targetAppInstance.hashOfLatestState,
    targetAppInstance.appSeqNo
  );
}

function constructUninstallOp(
  network: NetworkContext,
  stateChannel: StateChannel
) {
  const freeBalance = stateChannel.freeBalance;

  return new SetStateCommitment(
    network,
    freeBalance.identity,
    freeBalance.hashOfLatestState,
    freeBalance.versionNumber,
    freeBalance.timeout
  );
}

async function addRightUninstallAgreementToContext(
  params: ProtocolParameters,
  context: Context,
  provider: BaseProvider
) {
  // uninstall right agreement
  const {
    initiatingXpub,
    intermediaryXpub,
    respondingXpub,
    targetAppIdentityHash
  } = params as UninstallVirtualAppParams;

  const key = computeUniqueIdentifierForStateChannelThatWrapsVirtualApp(
    [initiatingXpub, respondingXpub],
    intermediaryXpub
  );

  const metachannel = context.stateChannelsMap.get(key) as StateChannel;

  const increments = await computeFreeBalanceIncrements(
    context.network,
    metachannel,
    targetAppIdentityHash,
    provider
  );

  const sc = getChannelFromCounterparty(
    context.stateChannelsMap,
    respondingXpub,
    intermediaryXpub
  )!;

  const newStateChannel = sc.removeSingleAssetTwoPartyIntermediaryAgreement(
    targetAppIdentityHash,
    {
      [zA(intermediaryXpub)]: increments[zA(initiatingXpub)],
      [zA(respondingXpub)]: increments[zA(respondingXpub)]
    }
  );

  context.stateChannelsMap.set(sc.multisigAddress, newStateChannel);

  return constructUninstallOp(context.network, sc);
}

async function addLeftUninstallAgreementToContext(
  params: ProtocolParameters,
  context: Context,
  provider: BaseProvider
): Promise<SetStateCommitment> {
  // uninstall left virtual app agreement

  const {
    initiatingXpub,
    intermediaryXpub,
    respondingXpub,
    targetAppIdentityHash
  } = params as UninstallVirtualAppParams;

  const key = computeUniqueIdentifierForStateChannelThatWrapsVirtualApp(
    [initiatingXpub, respondingXpub],
    intermediaryXpub
  );

  const metachannel = context.stateChannelsMap.get(key) as StateChannel;

  const increments = await computeFreeBalanceIncrements(
    context.network,
    metachannel,
    targetAppIdentityHash,
    provider
  );

  const sc = getChannelFromCounterparty(
    context.stateChannelsMap,
    initiatingXpub,
    intermediaryXpub
  )!;

  const newStateChannel = sc.removeSingleAssetTwoPartyIntermediaryAgreement(
    targetAppIdentityHash,
    {
      [zA(intermediaryXpub)]: increments[zA(respondingXpub)],
      [zA(initiatingXpub)]: increments[zA(initiatingXpub)]
    }
  );

  context.stateChannelsMap.set(sc.multisigAddress, newStateChannel);

  return constructUninstallOp(context.network, sc);
}
