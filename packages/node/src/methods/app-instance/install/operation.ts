import { AppInstanceProposal, Node } from "@counterfactual/types";

import { InstructionExecutor, Protocol } from "../../../machine";
import { StateChannel } from "../../../models";
import { Store } from "../../../store";
import { NO_APP_INSTANCE_ID_TO_INSTALL } from "../../errors";

export async function install(
  store: Store,
  instructionExecutor: InstructionExecutor,
  params: Node.InstallParams
): Promise<AppInstanceProposal> {
  const { appInstanceId } = params;

  if (!appInstanceId || !appInstanceId.trim()) {
    throw Error(NO_APP_INSTANCE_ID_TO_INSTALL);
  }

  const proposal = await store.getAppInstanceProposal(appInstanceId);

  const stateChannel = await store.getChannelFromAppInstanceID(appInstanceId);

  // console.error(proposal.appSeqNo)
  // console.error(stateChannel.numProposedApps)
  // if (proposal.appSeqNo !== stateChannel.numProposedApps) {
  //   throw new Error("test");
  // }

  const stateChannelsMap = await instructionExecutor.initiateProtocol(
    Protocol.Install,
    new Map<string, StateChannel>([
      // TODO: (architectural decision) Should this use `getAllChannels` or
      //       is this good enough? InstallProtocol only operates on a single
      //       channel, anyway. PR #532 might make this question obsolete.
      [stateChannel.multisigAddress, stateChannel]
    ]),
    {
      initiatorXpub: proposal.proposedToIdentifier,
      responderXpub: proposal.proposedByIdentifier,
      initiatorBalanceDecrement: proposal.initiatorDeposit,
      responderBalanceDecrement: proposal.responderDeposit,
      multisigAddress: stateChannel.multisigAddress,
      participants: stateChannel.getSigningKeysFor(proposal.appSeqNo),
      initialState: proposal.initialState,
      appInterface: {
        ...proposal.abiEncodings,
        addr: proposal.appDefinition
      },
      appSeqNo: proposal.appSeqNo,
      defaultTimeout: proposal.timeout.toNumber(),
      outcomeType: proposal.outcomeType,
      initiatorDepositTokenAddress: proposal.initiatorDepositTokenAddress,
      responderDepositTokenAddress: proposal.responderDepositTokenAddress,
      disableLimit: false
    }
  );

  await store.saveStateChannel(
    stateChannelsMap.get(stateChannel.multisigAddress)!
  );

  await store.saveRealizedProposedAppInstance(proposal);

  return proposal;
}
