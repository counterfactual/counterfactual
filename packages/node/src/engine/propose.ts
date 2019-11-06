import { defaultAbiCoder, keccak256 } from "ethers/utils";

import {
  CONVENTION_FOR_ETH_TOKEN_ADDRESS,
  UNASSIGNED_SEQ_NO
} from "../constants";
import { SetStateCommitment } from "../ethereum";
import { AppInstanceProposal, StateChannel } from "../models";

import { appIdentityToHash, ProtocolExecutionFlow, xkeyKthAddress } from ".";
import { Opcode, Protocol } from "./enums";
import { Context, ProposeInstallParams, ProtocolMessage } from "./types";
import { assertIsValidSignature } from "./utils/signature-validator";

const protocol = Protocol.Propose;
const { OP_SIGN, IO_SEND, IO_SEND_AND_WAIT } = Opcode;

export const PROPOSE_PROTOCOL: ProtocolExecutionFlow = {
  0 /* Initiating */: async function*(context: Context) {
    const { message, network, store } = context;

    const {
      sharedData: { stateChannelsMap }
    } = store;

    const { processID, params } = message;

    const {
      multisigAddress,
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

    const preProtocolStateChannel = stateChannelsMap[multisigAddress]
      ? StateChannel.fromJson(stateChannelsMap[multisigAddress])
      : StateChannel.createEmptyChannel(multisigAddress, [
          initiatorXpub,
          responderXpub
        ]);

    const appInstanceProposal: AppInstanceProposal = {
      appDefinition,
      abiEncodings,
      initialState,
      outcomeType,
      initiatorDeposit: initiatorDeposit.toHexString(),
      responderDeposit: responderDeposit.toHexString(),
      timeout: timeout.toHexString(),
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
    await store.saveStateChannel(postProtocolStateChannel);
  },

  1 /* Responding */: async function*(context: Context) {
    const { message, network, store } = context;

    const {
      sharedData: { stateChannelsMap }
    } = store;

    const { params, processID } = message;

    const {
      multisigAddress,
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

    const preProtocolStateChannel = stateChannelsMap[multisigAddress]
      ? StateChannel.fromJson(stateChannelsMap[multisigAddress])
      : StateChannel.createEmptyChannel(multisigAddress, [
          initiatorXpub,
          responderXpub
        ]);

    const appInstanceProposal: AppInstanceProposal = {
      appDefinition,
      abiEncodings,
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
      timeout: timeout.toHexString(),
      initiatorDeposit: responderDeposit.toHexString(),
      responderDeposit: initiatorDeposit.toHexString(),
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

    const responderSignatureOnInitialState = yield [
      OP_SIGN,
      setStateCommitment
    ];

    await store.saveStateChannel(postProtocolStateChannel);

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
  }
};
