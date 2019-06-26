import { Node } from "@counterfactual/types";
import { AddressZero } from "ethers/constants";

import { ProposedAppInstanceInfo } from "../../../models";
import { Store } from "../../../store";
import { getChannelFromPeerAddress } from "../../../utils";

/**
 * Creates a ProposedAppInstanceInfo to reflect the proposal received from
 * the client.
 * @param myIdentifier
 * @param store
 * @param params
 */
export async function createProposedAppInstance(
  myIdentifier: string,
  store: Store,
  params: Node.ProposeInstallParams
): Promise<string> {
  const channel = await getChannelFromPeerAddress(
    myIdentifier,
    params.proposedToIdentifier,
    store
  );

  const proposedAppInstanceInfo = new ProposedAppInstanceInfo(
    {
      ...params,
      proposedByIdentifier: myIdentifier,
      tokenAddress: params.tokenAddress ? params.tokenAddress : AddressZero
    },
    channel
  );

  await store.addAppInstanceProposal(channel, proposedAppInstanceInfo);

  return proposedAppInstanceInfo.id;
}
