import { Node } from "@counterfactual/types";

import { ETH_TOKEN_ADDRESS, ProposedAppInstanceInfo } from "../../models";
import { Store } from "../../store";
import { getChannelFromPeerAddress } from "../../utils";

export async function setAppInstanceIDForProposeInstall(
  myIdentifier: string,
  store: Store,
  params: Node.ProposeInstallParams,
  appInstanceId: string,
  proposedByIdentifier: string
) {
  const channel = await getChannelFromPeerAddress(
    myIdentifier,
    proposedByIdentifier,
    store
  );

  const fixedDepositsParams = {
    ...params,
    myDeposit: params.peerDeposit,
    peerDeposit: params.myDeposit,
    tokenAddress: params.tokenAddress ? params.tokenAddress : ETH_TOKEN_ADDRESS
  };

  const proposedAppInstanceInfo = new ProposedAppInstanceInfo(
    {
      ...fixedDepositsParams,
      proposedByIdentifier
    },
    channel
  );

  await store.addAppInstanceProposal(channel, proposedAppInstanceInfo);
}
