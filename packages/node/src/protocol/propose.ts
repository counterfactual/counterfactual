import { defaultAbiCoder, keccak256 } from "ethers/utils";

import { CONVENTION_FOR_ETH_TOKEN_ADDRESS } from "../constants";
import { SetStateCommitment } from "../ethereum";
import {
  appIdentityToHash,
  ProtocolExecutionFlow,
  xkeyKthAddress
} from "../machine";
import { Opcode, Protocol } from "../machine/enums";
import {
  Context,
  ProposeInstallParams,
  ProtocolMessage
} from "../machine/types";
import { AppInstanceProposal, StateChannel } from "../models";
import { getCreate2MultisigAddress } from "../utils";

import { UNASSIGNED_SEQ_NO } from "./utils/signature-forwarder";
import { assertIsValidSignature } from "./utils/signature-validator";

const protocol = Protocol.Propose;
const { OP_SIGN, IO_SEND, IO_SEND_AND_WAIT, PERSIST_STATE_CHANNEL } = Opcode;

export const PROPOSE_PROTOCOL: ProtocolExecutionFlow = {
  0 /* Initiating */: async function*(context: Context) {
    const { message, network, stateChannelsMap } = context;

    const { processID, params } = message;

    const {
      initiatorXpub,
      responderXpub,
      appDefinition,
      abiEncodings,
      initiatorDeposit,
      initiatorDepositTokenAddress,
      responderDeposit,
      responderDepositTokenAddress,
      timeout,
      initialState,
      outcomeType
    } = params as ProposeInstallParams;

    const multisigAddress = getCreate2MultisigAddress(
      [initiatorXpub, responderXpub],
      network.ProxyFactory,
      network.MinimumViableMultisig
    );

    const preProtocolStateChannel =
      stateChannelsMap.get(multisigAddress) ||
      StateChannel.createEmptyChannel(multisigAddress, [
        initiatorXpub,
        responderXpub
      ]);

    const appInstanceProposal: AppInstanceProposal = {
      appDefinition,
      abiEncodings,
      initiatorDeposit,
      responderDeposit,
      timeout,
      initialState,
      outcomeType,
      identityHash: appIdentityToHash({
        appDefinition,
        channelNonce: preProtocolStateChannel.numProposedApps + 1,
        participants: preProtocolStateChannel.getSigningKeysFor(
          preProtocolStateChannel.numProposedApps + 1
        ),
        defaultTimeout: timeout.toNumber()
      }),
      proposedByIdentifier: initiatorXpub,
      proposedToIdentifier: responderXpub,
      appSeqNo: preProtocolStateChannel.numProposedApps + 1,
      initiatorDepositTokenAddress:
        initiatorDepositTokenAddress || CONVENTION_FOR_ETH_TOKEN_ADDRESS,
      responderDepositTokenAddress:
        responderDepositTokenAddress || CONVENTION_FOR_ETH_TOKEN_ADDRESS
    };

    const postProtocolStateChannel = preProtocolStateChannel.addProposal(
      appInstanceProposal
    );

    yield [PERSIST_STATE_CHANNEL, [postProtocolStateChannel]];

    const setStateCommitment = new SetStateCommitment(
      network,
      {
        appDefinition,
        channelNonce: preProtocolStateChannel.numProposedApps + 1,
        participants: preProtocolStateChannel.getSigningKeysFor(
          preProtocolStateChannel.numProposedApps + 1
        ),
        defaultTimeout: timeout.toNumber()
      },
      keccak256(
        defaultAbiCoder.encode([abiEncodings.stateEncoding], [initialState])
      ),
      0,
      timeout.toNumber()
    );

    const initiatorSignatureOnInitialState = yield [
      OP_SIGN,
      setStateCommitment
    ];

    const m1 = {
      protocol,
      processID,
      params,
      seq: 1,
      toXpub: responderXpub,
      customData: {
        signature: initiatorSignatureOnInitialState
      }
    } as ProtocolMessage;

    const m2 = yield [IO_SEND_AND_WAIT, m1];

    const {
      customData: { signature: responderSignatureOnInitialState }
    } = m2! as ProtocolMessage;

    const responderAddress = xkeyKthAddress(responderXpub, 0);

    assertIsValidSignature(
      responderAddress,
      setStateCommitment,
      responderSignatureOnInitialState
    );

    context.stateChannelsMap.set(
      postProtocolStateChannel.multisigAddress,
      postProtocolStateChannel
    );
  },

  1 /* Responding */: async function*(context: Context) {
    const { message, network, stateChannelsMap } = context;

    const { params, processID } = message;

    const {
      initiatorXpub,
      responderXpub,
      appDefinition,
      abiEncodings,
      initiatorDeposit,
      initiatorDepositTokenAddress,
      responderDeposit,
      responderDepositTokenAddress,
      timeout,
      initialState,
      outcomeType
    } = params as ProposeInstallParams;

    const {
      customData: { signature: initiatorSignatureOnInitialState }
    } = message;

    const multisigAddress = getCreate2MultisigAddress(
      [initiatorXpub, responderXpub],
      network.ProxyFactory,
      network.MinimumViableMultisig
    );

    const preProtocolStateChannel =
      stateChannelsMap.get(multisigAddress) ||
      StateChannel.createEmptyChannel(multisigAddress, [
        initiatorXpub,
        responderXpub
      ]);

    const appInstanceProposal: AppInstanceProposal = {
      appDefinition,
      abiEncodings,
      timeout,
      initialState,
      outcomeType,
      identityHash: appIdentityToHash({
        appDefinition,
        channelNonce: preProtocolStateChannel.numProposedApps + 1,
        participants: preProtocolStateChannel.getSigningKeysFor(
          preProtocolStateChannel.numProposedApps + 1
        ),
        defaultTimeout: timeout.toNumber()
      }),
      initiatorDeposit: responderDeposit,
      responderDeposit: initiatorDeposit,
      proposedByIdentifier: initiatorXpub,
      proposedToIdentifier: responderXpub,
      appSeqNo: preProtocolStateChannel.numProposedApps + 1,
      initiatorDepositTokenAddress:
        responderDepositTokenAddress || CONVENTION_FOR_ETH_TOKEN_ADDRESS,
      responderDepositTokenAddress:
        initiatorDepositTokenAddress || CONVENTION_FOR_ETH_TOKEN_ADDRESS
    };

    const setStateCommitment = new SetStateCommitment(
      network,
      {
        appDefinition,
        channelNonce: preProtocolStateChannel.numProposedApps + 1,
        participants: preProtocolStateChannel.getSigningKeysFor(
          preProtocolStateChannel.numProposedApps + 1
        ),
        defaultTimeout: timeout.toNumber()
      },
      keccak256(
        defaultAbiCoder.encode([abiEncodings.stateEncoding], [initialState])
      ),
      0,
      timeout.toNumber()
    );

    const initiatorAddress = xkeyKthAddress(initiatorXpub, 0);

    assertIsValidSignature(
      initiatorAddress,
      setStateCommitment,
      initiatorSignatureOnInitialState
    );

    const postProtocolStateChannel = preProtocolStateChannel.addProposal(
      appInstanceProposal
    );

    yield [PERSIST_STATE_CHANNEL, [postProtocolStateChannel]];

    const responderSignatureOnInitialState = yield [
      OP_SIGN,
      setStateCommitment
    ];

    yield [
      IO_SEND,
      {
        protocol,
        processID,
        seq: UNASSIGNED_SEQ_NO,
        toXpub: initiatorXpub,
        customData: {
          signature: responderSignatureOnInitialState
        }
      } as ProtocolMessage
    ];

    context.stateChannelsMap.set(
      postProtocolStateChannel.multisigAddress,
      postProtocolStateChannel
    );
  }
};
