import { Node } from "@counterfactual/types";
import { bigNumberify } from "ethers/utils";

import { CONVENTION_FOR_ETH_TOKEN_ADDRESS } from "../../../constants";
import { appIdentityToHash, xkeysToSortedKthSigningKeys } from "../../../machine";
import { AppInstanceProposal } from "../../../models";
import { Store } from "../../../store";
import { getCreate2MultisigAddress } from "../../../utils";

/**
 * Creates a AppInstanceProposal to reflect the proposal received from
 * the client.
 * @param myIdentifier
 * @param store
 * @param params
 */
export async function createProposedAppInstance(
  myIdentifier: string,
  store: Store,
  networkContext,
  params: Node.ProposeInstallParams
): Promise<string> {
  const {
    abiEncodings,
    appDefinition,
    initialState,
    initiatorDeposit,
    initiatorDepositTokenAddress,
    outcomeType,
    proposedToIdentifier,
    responderDeposit,
    responderDepositTokenAddress,
    timeout
  } = params;

  const multisigAddress = getCreate2MultisigAddress(
    [myIdentifier, proposedToIdentifier],
    networkContext.ProxyFactory,
    networkContext.MinimumViableMultisig
  );

  const stateChannel = await store.getOrCreateStateChannelBetweenVirtualAppParticipants(
    multisigAddress,
    myIdentifier,
    proposedToIdentifier
  );

  const appInstanceProposal: AppInstanceProposal = {
    identityHash: appIdentityToHash({
      appDefinition,
      channelNonce: stateChannel.numProposedApps,
      participants: stateChannel.getSigningKeysFor(
        stateChannel.numProposedApps
      ),
      defaultTimeout: timeout.toNumber()
    }),
    abiEncodings: abiEncodings,
    appDefinition: appDefinition,
    appSeqNo: stateChannel.numProposedApps,
    initialState: initialState,
    initiatorDeposit: bigNumberify(initiatorDeposit),
    initiatorDepositTokenAddress:
      initiatorDepositTokenAddress || CONVENTION_FOR_ETH_TOKEN_ADDRESS,
    outcomeType: outcomeType,
    proposedByIdentifier: myIdentifier,
    proposedToIdentifier: proposedToIdentifier,
    responderDeposit: bigNumberify(responderDeposit),
    responderDepositTokenAddress:
      responderDepositTokenAddress || CONVENTION_FOR_ETH_TOKEN_ADDRESS,
    timeout: bigNumberify(timeout)
  };

  await store.saveStateChannel(stateChannel.addProposal(appInstanceProposal));

  return appInstanceProposal.identityHash;
}
