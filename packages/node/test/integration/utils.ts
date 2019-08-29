import DolphinCoin from "@counterfactual/cf-funding-protocol-contracts/build/DolphinCoin.json";
import { NetworkContextForTestSuite } from "@counterfactual/local-ganache-server";
import {
  AppABIEncodings,
  AppInstanceJson,
  AppInstanceProposal,
  ContractABI,
  Node as NodeTypes,
  OutcomeType,
  SolidityValueType
} from "@counterfactual/types";
import { Contract, Wallet } from "ethers";
import { One, Zero } from "ethers/constants";
import { JsonRpcProvider } from "ethers/providers";
import { BigNumber } from "ethers/utils";

import {
  CreateChannelMessage,
  InstallVirtualMessage,
  jsonRpcDeserialize,
  JsonRpcResponse,
  Node,
  NODE_EVENTS,
  ProposeMessage,
  ProposeVirtualMessage,
  Rpc
} from "../../src";
import { CONVENTION_FOR_ETH_TOKEN_ADDRESS } from "../../src/constants";

import { initialLinkedState, linkedAbiEncodings } from "./linked-transfer";
import { initialEmptyTTTState, tttAbiEncodings } from "./tic-tac-toe";
import {
  initialTransferState,
  transferAbiEncodings
} from "./unidirectional-transfer";

interface AppContext {
  appDefinition: string;
  abiEncodings: AppABIEncodings;
  initialState: SolidityValueType;
  outcomeType: OutcomeType;
}

/**
 * Even though this function returns a transaction hash, the calling Node
 * will receive an event (CREATE_CHANNEL) that should be subscribed to to
 * ensure a channel has been instantiated and to get its multisig address
 * back in the event data.
 */
export async function getMultisigCreationTransactionHash(
  node: Node,
  xpubs: string[]
): Promise<string> {
  const req = jsonRpcDeserialize({
    jsonrpc: "2.0",
    id: Date.now(),
    method: NodeTypes.RpcMethodName.CREATE_CHANNEL,
    params: {
      owners: xpubs
    }
  });
  const response = await node.rpcRouter.dispatch(req);
  const result = response.result
    .result as NodeTypes.CreateChannelTransactionResult;
  return result.transactionHash;
}

/**
 * Wrapper method making the call to the given node to get the list of
 * multisig addresses the node is aware of.
 * @param node
 * @returns list of multisig addresses
 */
export async function getChannelAddresses(node: Node): Promise<Set<string>> {
  const req = jsonRpcDeserialize({
    jsonrpc: "2.0",
    id: Date.now(),
    method: NodeTypes.RpcMethodName.GET_CHANNEL_ADDRESSES,
    params: {}
  });
  const response = await node.rpcRouter.dispatch(req);
  const result = response.result.result as NodeTypes.GetChannelAddressesResult;
  return new Set(result.multisigAddresses);
}

export async function getAppInstance(
  node: Node,
  appInstanceId: string
): Promise<AppInstanceJson> {
  const req = jsonRpcDeserialize({
    jsonrpc: "2.0",
    id: Date.now(),
    method: NodeTypes.RpcMethodName.GET_APP_INSTANCE_DETAILS,
    params: {
      appInstanceId
    }
  });
  const response = await node.rpcRouter.dispatch(req);
  return (response.result.result as NodeTypes.GetAppInstanceDetailsResult)
    .appInstance;
}

export async function getAppInstanceProposal(
  node: Node,
  appInstanceId: string
): Promise<AppInstanceProposal> {
  const candidates = (await getProposedAppInstances(node)).filter(proposal => {
    return proposal.identityHash === appInstanceId;
  });

  if (candidates.length !== 1) {
    throw new Error("Failed to match exactly one proposed app instance");
  }

  return candidates[0];
}

export async function getFreeBalanceState(
  node: Node,
  multisigAddress: string,
  tokenAddress: string = CONVENTION_FOR_ETH_TOKEN_ADDRESS
): Promise<NodeTypes.GetFreeBalanceStateResult> {
  const req = jsonRpcDeserialize({
    id: Date.now(),
    method: NodeTypes.RpcMethodName.GET_FREE_BALANCE_STATE,
    params: {
      multisigAddress,
      tokenAddress
    },
    jsonrpc: "2.0"
  });
  const response = (await node.rpcRouter.dispatch(req)) as JsonRpcResponse;
  return response.result.result as NodeTypes.GetFreeBalanceStateResult;
}

export async function getTokenIndexedFreeBalanceStates(
  node: Node,
  multisigAddress: string
): Promise<NodeTypes.GetTokenIndexedFreeBalanceStatesResult> {
  const req = jsonRpcDeserialize({
    id: Date.now(),
    method: NodeTypes.RpcMethodName.GET_TOKEN_INDEXED_FREE_BALANCE_STATES,
    params: {
      multisigAddress
    },
    jsonrpc: "2.0"
  });
  const response = (await node.rpcRouter.dispatch(req)) as JsonRpcResponse;
  return response.result
    .result as NodeTypes.GetTokenIndexedFreeBalanceStatesResult;
}

export async function getInstalledAppInstances(
  node: Node
): Promise<AppInstanceJson[]> {
  const rpc = jsonRpcDeserialize({
    jsonrpc: "2.0",
    id: Date.now(),
    method: NodeTypes.RpcMethodName.GET_APP_INSTANCES,
    params: {} as NodeTypes.GetAppInstancesParams
  });
  const response = (await node.rpcRouter.dispatch(rpc)) as JsonRpcResponse;
  const result = response.result.result as NodeTypes.GetAppInstancesResult;
  return result.appInstances;
}

export async function getProposedAppInstances(
  node: Node
): Promise<AppInstanceProposal[]> {
  const rpc = jsonRpcDeserialize({
    jsonrpc: "2.0",
    id: Date.now(),
    method: NodeTypes.RpcMethodName.GET_PROPOSED_APP_INSTANCES,
    params: {} as NodeTypes.GetProposedAppInstancesParams
  });
  const response = (await node.rpcRouter.dispatch(rpc)) as JsonRpcResponse;
  const result = response.result
    .result as NodeTypes.GetProposedAppInstancesResult;
  return result.appInstances;
}

export async function deposit(
  node: Node,
  multisigAddress: string,
  amount: BigNumber = One,
  tokenAddress?: string
) {
  const depositReq = constructDepositRpc(multisigAddress, amount, tokenAddress);

  await node.rpcRouter.dispatch(depositReq);
}

export function constructDepositRpc(
  multisigAddress: string,
  amount: BigNumber,
  tokenAddress?: string
): Rpc {
  return jsonRpcDeserialize({
    id: Date.now(),
    method: NodeTypes.RpcMethodName.DEPOSIT,
    params: {
      multisigAddress,
      amount,
      tokenAddress
    } as NodeTypes.DepositParams,
    jsonrpc: "2.0"
  });
}

export function constructWithdrawCommitmentRpc(
  multisigAddress: string,
  amount: BigNumber,
  tokenAddress: string = CONVENTION_FOR_ETH_TOKEN_ADDRESS,
  recipient?: string
): Rpc {
  const withdrawCommitmentReq = constructWithdrawRpc(
    multisigAddress,
    amount,
    tokenAddress,
    recipient
  );

  withdrawCommitmentReq.methodName =
    NodeTypes.RpcMethodName.WITHDRAW_COMMITMENT;
  return withdrawCommitmentReq;
}

export function constructWithdrawRpc(
  multisigAddress: string,
  amount: BigNumber,
  tokenAddress: string = CONVENTION_FOR_ETH_TOKEN_ADDRESS,
  recipient?: string
): Rpc {
  return jsonRpcDeserialize({
    id: Date.now(),
    method: NodeTypes.RpcMethodName.WITHDRAW,
    params: {
      tokenAddress,
      multisigAddress,
      amount,
      recipient
    } as NodeTypes.WithdrawParams,
    jsonrpc: "2.0"
  });
}

export function constructInstallRpc(appInstanceId: string): Rpc {
  return jsonRpcDeserialize({
    id: Date.now(),
    method: NodeTypes.RpcMethodName.INSTALL,
    params: {
      appInstanceId
    } as NodeTypes.InstallParams,
    jsonrpc: "2.0"
  });
}

export function constructRejectInstallRpc(appInstanceId: string): Rpc {
  return jsonRpcDeserialize({
    id: Date.now(),
    method: NodeTypes.RpcMethodName.REJECT_INSTALL,
    params: {
      appInstanceId
    } as NodeTypes.RejectInstallParams,
    jsonrpc: "2.0"
  });
}

export function constructAppProposalRpc(
  proposedToIdentifier: string,
  appDefinition: string,
  abiEncodings: AppABIEncodings,
  initialState: SolidityValueType,
  initiatorDeposit: BigNumber = Zero,
  initiatorDepositTokenAddress: string = CONVENTION_FOR_ETH_TOKEN_ADDRESS,
  responderDeposit: BigNumber = Zero,
  responderDepositTokenAddress: string = CONVENTION_FOR_ETH_TOKEN_ADDRESS
): Rpc {
  const { outcomeType } = getAppContext(appDefinition, initialState);
  return jsonRpcDeserialize({
    id: Date.now(),
    method: NodeTypes.RpcMethodName.PROPOSE_INSTALL,
    jsonrpc: "2.0",
    params: {
      proposedToIdentifier,
      initiatorDeposit,
      initiatorDepositTokenAddress,
      responderDeposit,
      responderDepositTokenAddress,
      appDefinition,
      initialState,
      abiEncodings,
      outcomeType,
      timeout: One
    } as NodeTypes.ProposeInstallParams
  });
}

export function constructInstallVirtualRpc(
  appInstanceId: string,
  intermediaryIdentifier: string
): Rpc {
  return jsonRpcDeserialize({
    params: {
      appInstanceId,
      intermediaryIdentifier
    } as NodeTypes.InstallVirtualParams,
    id: Date.now(),
    method: NodeTypes.RpcMethodName.INSTALL_VIRTUAL,
    jsonrpc: "2.0"
  });
}

export function constructVirtualProposalRpc(
  proposedToIdentifier: string,
  intermediaryIdentifier: string,
  appDefinition: string,
  abiEncodings: AppABIEncodings,
  initialState: SolidityValueType = {},
  initiatorDeposit: BigNumber = Zero,
  initiatorDepositTokenAddress = CONVENTION_FOR_ETH_TOKEN_ADDRESS,
  responderDeposit: BigNumber = Zero,
  responderDepositTokenAddress = CONVENTION_FOR_ETH_TOKEN_ADDRESS
): Rpc {
  const installProposalParams = constructAppProposalRpc(
    proposedToIdentifier,
    appDefinition,
    abiEncodings,
    initialState,
    initiatorDeposit,
    initiatorDepositTokenAddress,
    responderDeposit,
    responderDepositTokenAddress
  ).parameters as NodeTypes.ProposeInstallParams;

  const installVirtualParams: NodeTypes.ProposeInstallVirtualParams = {
    ...installProposalParams,
    intermediaryIdentifier
  };

  return jsonRpcDeserialize({
    params: installVirtualParams,
    id: Date.now(),
    method: NodeTypes.RpcMethodName.PROPOSE_INSTALL_VIRTUAL,
    jsonrpc: "2.0"
  });
}

/**
 * @param proposalParams The parameters of the installation proposal.
 * @param appInstanceProposal The proposed app instance contained in the Node.
 */
export async function confirmProposedAppInstance(
  methodParams: NodeTypes.MethodParams,
  appInstanceProposal: AppInstanceProposal,
  nonInitiatingNode: boolean = false
) {
  const proposalParams = methodParams as NodeTypes.ProposeInstallParams;
  expect(proposalParams.abiEncodings).toEqual(appInstanceProposal.abiEncodings);
  expect(proposalParams.appDefinition).toEqual(
    appInstanceProposal.appDefinition
  );

  if (nonInitiatingNode) {
    expect(proposalParams.initiatorDeposit).toEqual(
      appInstanceProposal.responderDeposit
    );
    expect(proposalParams.responderDeposit).toEqual(
      appInstanceProposal.initiatorDeposit
    );
  } else {
    expect(proposalParams.initiatorDeposit).toEqual(
      appInstanceProposal.initiatorDeposit
    );
    expect(proposalParams.responderDeposit).toEqual(
      appInstanceProposal.responderDeposit
    );
  }
  expect(proposalParams.timeout).toEqual(appInstanceProposal.timeout);
  // TODO: uncomment when getState is implemented
  // expect(proposalParams.initialState).toEqual(appInstanceInitialState);
}

export function confirmProposedVirtualAppInstance(
  methodParams: NodeTypes.MethodParams,
  proposedAppInstance: AppInstanceProposal,
  nonInitiatingNode: boolean = false
) {
  confirmProposedAppInstance(
    methodParams,
    proposedAppInstance,
    nonInitiatingNode
  );
  const proposalParams = methodParams as NodeTypes.ProposeInstallVirtualParams;
  expect(proposalParams.intermediaryIdentifier).toEqual(
    proposedAppInstance.intermediaryIdentifier
  );
}

export function constructGetStateRpc(appInstanceId: string): Rpc {
  return jsonRpcDeserialize({
    params: {
      appInstanceId
    },
    id: Date.now(),
    method: NodeTypes.RpcMethodName.GET_STATE,
    jsonrpc: "2.0"
  });
}

export function constructTakeActionRpc(
  appInstanceId: string,
  action: any
): Rpc {
  return jsonRpcDeserialize({
    params: {
      appInstanceId,
      action
    } as NodeTypes.TakeActionParams,
    id: Date.now(),
    jsonrpc: "2.0",
    method: NodeTypes.RpcMethodName.TAKE_ACTION
  });
}

export function constructGetAppsRpc(): Rpc {
  return jsonRpcDeserialize({
    params: {},
    id: Date.now(),
    method: NodeTypes.RpcMethodName.GET_APP_INSTANCES,
    jsonrpc: "2.0"
  });
}

export function constructUninstallRpc(appInstanceId: string): Rpc {
  return jsonRpcDeserialize({
    params: {
      appInstanceId
    } as NodeTypes.UninstallParams,
    id: Date.now(),
    jsonrpc: "2.0",
    method: NodeTypes.RpcMethodName.UNINSTALL
  });
}

export function constructUninstallVirtualRpc(
  appInstanceId: string,
  intermediaryIdentifier: string
): Rpc {
  return jsonRpcDeserialize({
    params: {
      appInstanceId,
      intermediaryIdentifier
    } as NodeTypes.UninstallVirtualParams,
    id: Date.now(),
    jsonrpc: "2.0",
    method: NodeTypes.RpcMethodName.UNINSTALL_VIRTUAL
  });
}

export async function collateralizeChannel(
  multisigAddress: string,
  node1: Node,
  node2?: Node,
  amount: BigNumber = One,
  tokenAddress: string = CONVENTION_FOR_ETH_TOKEN_ADDRESS
): Promise<void> {
  const depositReq = constructDepositRpc(multisigAddress, amount, tokenAddress);
  node1.on(NODE_EVENTS.DEPOSIT_CONFIRMED, () => {});
  await node1.rpcRouter.dispatch(depositReq);
  if (!node2) {
    return;
  }
  node2.on(NODE_EVENTS.DEPOSIT_CONFIRMED, () => {});
  await node2.rpcRouter.dispatch(depositReq);
}

export async function createChannel(nodeA: Node, nodeB: Node): Promise<string> {
  return new Promise(async resolve => {
    nodeB.on(NODE_EVENTS.CREATE_CHANNEL, async (msg: CreateChannelMessage) => {
      expect(await getInstalledAppInstances(nodeB)).toEqual([]);
      resolve(msg.data.multisigAddress);
    });

    // trigger channel creation but only resolve with the multisig address
    // as acknowledged by the node
    await getMultisigCreationTransactionHash(nodeA, [
      nodeA.publicIdentifier,
      nodeB.publicIdentifier
    ]);

    expect(await getInstalledAppInstances(nodeA)).toEqual([]);
  });
}

export async function installApp(
  nodeA: Node,
  nodeB: Node,
  appDefinition: string,
  initialState?: SolidityValueType,
  initiatorDeposit: BigNumber = Zero,
  initiatorDepositTokenAddress: string = CONVENTION_FOR_ETH_TOKEN_ADDRESS,
  responderDeposit: BigNumber = Zero,
  responderDepositTokenAddress: string = CONVENTION_FOR_ETH_TOKEN_ADDRESS
): Promise<[string, NodeTypes.ProposeInstallParams]> {
  const appContext = getAppContext(appDefinition, initialState);
  let proposedParams: NodeTypes.ProposeInstallParams;

  return new Promise(async resolve => {
    const installationProposalRpc = constructAppProposalRpc(
      nodeB.publicIdentifier,
      appContext.appDefinition,
      appContext.abiEncodings,
      appContext.initialState,
      initiatorDeposit,
      initiatorDepositTokenAddress,
      responderDeposit,
      responderDepositTokenAddress
    );

    proposedParams = installationProposalRpc.parameters as NodeTypes.ProposeInstallParams;

    nodeB.on(NODE_EVENTS.PROPOSE_INSTALL, async (msg: ProposeMessage) => {
      confirmProposedAppInstance(
        installationProposalRpc.parameters,
        await getAppInstanceProposal(nodeA, msg.data.appInstanceId)
      );

      const installRpc = constructInstallRpc(msg.data.appInstanceId);
      await nodeB.rpcRouter.dispatch(installRpc);
    });

    nodeA.on(NODE_EVENTS.INSTALL, async () => {
      const appInstanceNodeA = await getAppInstance(nodeA, appInstanceId);
      const appInstanceNodeB = await getAppInstance(nodeB, appInstanceId);
      expect(appInstanceNodeA).toEqual(appInstanceNodeB);
      resolve([appInstanceId, proposedParams]);
    });

    const response = await nodeA.rpcRouter.dispatch(installationProposalRpc);

    const { appInstanceId } = response.result
      .result as NodeTypes.ProposeInstallResult;
  });
}

export async function installVirtualApp(
  nodeA: Node,
  nodeB: Node,
  nodeC: Node,
  appDefinition: string,
  initialState?: SolidityValueType,
  assetId?: string,
  initiatorDeposit?: BigNumber,
  responderDeposit?: BigNumber
): Promise<string> {
  return new Promise(async resolve => {
    nodeA.on(NODE_EVENTS.INSTALL_VIRTUAL, (msg: InstallVirtualMessage) => {
      resolve(msg.data.params.appInstanceId);
    });

    nodeC.on(
      NODE_EVENTS.PROPOSE_INSTALL_VIRTUAL,
      async (msg: ProposeVirtualMessage) => {
        const installReq = constructInstallVirtualRpc(
          msg.data.appInstanceId,
          msg.data.params.intermediaryIdentifier
        );
        await nodeC.rpcRouter.dispatch(installReq);
      }
    );

    await makeVirtualProposal(
      nodeA,
      nodeC,
      nodeB,
      appDefinition,
      initialState,
      assetId,
      initiatorDeposit,
      responderDeposit
    );
  });
}

export async function confirmChannelCreation(
  nodeA: Node,
  nodeB: Node,
  ownersPublicIdentifiers: string[],
  data: NodeTypes.CreateChannelResult
) {
  const openChannelsNodeA = await getChannelAddresses(nodeA);
  const openChannelsNodeB = await getChannelAddresses(nodeB);

  expect(openChannelsNodeA.has(data.multisigAddress)).toBeTruthy();
  expect(openChannelsNodeB.has(data.multisigAddress)).toBeTruthy();
  expect(data.owners).toEqual(ownersPublicIdentifiers);
}

export async function confirmAppInstanceInstallation(
  proposedParams: NodeTypes.ProposeInstallParams,
  appInstance: AppInstanceJson
) {
  expect(appInstance.appInterface.addr).toEqual(proposedParams.appDefinition);
  expect(appInstance.appInterface.stateEncoding).toEqual(
    proposedParams.abiEncodings.stateEncoding
  );
  expect(appInstance.appInterface.actionEncoding).toEqual(
    proposedParams.abiEncodings.actionEncoding
  );
  expect(appInstance.defaultTimeout).toEqual(proposedParams.timeout.toNumber());
  expect(appInstance.latestState).toEqual(proposedParams.initialState);
}

export async function getState(
  nodeA: Node,
  appInstanceId: string
): Promise<SolidityValueType> {
  const getStateReq = constructGetStateRpc(appInstanceId);
  const getStateResult = await nodeA.rpcRouter.dispatch(getStateReq);
  return (getStateResult.result.result as NodeTypes.GetStateResult).state;
}

export async function makeVirtualProposal(
  nodeA: Node,
  nodeC: Node,
  nodeB: Node,
  appDefinition: string,
  initialState?: SolidityValueType,
  assetId?: string,
  initiatorDeposit?: BigNumber,
  responderDeposit?: BigNumber
): Promise<{
  appInstanceId: string;
  params: NodeTypes.ProposeInstallVirtualParams;
}> {
  const appContext = getAppContext(appDefinition, initialState);

  const virtualProposalRpc = constructVirtualProposalRpc(
    nodeC.publicIdentifier,
    nodeB.publicIdentifier,
    appContext.appDefinition,
    appContext.abiEncodings,
    appContext.initialState,
    initiatorDeposit || One,
    assetId || CONVENTION_FOR_ETH_TOKEN_ADDRESS,
    responderDeposit || Zero,
    assetId || CONVENTION_FOR_ETH_TOKEN_ADDRESS
  );
  const params = virtualProposalRpc.parameters as NodeTypes.ProposeInstallVirtualParams;
  const {
    result: {
      result: { appInstanceId }
    }
  } = await nodeA.rpcRouter.dispatch(
    jsonRpcDeserialize({
      params,
      jsonrpc: "2.0",
      method: NodeTypes.RpcMethodName.PROPOSE_INSTALL_VIRTUAL,
      id: Date.now()
    })
  );
  // expect(appInstanceId).toBeDefined();
  return { appInstanceId, params };
}

export async function installTTTVirtual(
  node: Node,
  appInstanceId: string,
  intermediaryIdentifier: string
) {
  const installVirtualReq = constructInstallVirtualRpc(
    appInstanceId,
    intermediaryIdentifier
  );
  await node.rpcRouter.dispatch(installVirtualReq);
}

export function makeInstallCall(node: Node, appInstanceId: string) {
  const installRpc = constructInstallRpc(appInstanceId);
  return node.rpcRouter.dispatch(installRpc);
}

export async function makeVirtualProposeCall(
  nodeA: Node,
  nodeC: Node,
  nodeB: Node,
  appDefinition: string,
  initialState?: SolidityValueType
): Promise<{
  appInstanceId: string;
  params: NodeTypes.ProposeInstallVirtualParams;
}> {
  const appContext = getAppContext(appDefinition, initialState);

  const virtualProposalRpc = constructVirtualProposalRpc(
    nodeC.publicIdentifier,
    nodeB.publicIdentifier,
    appContext.appDefinition,
    appContext.abiEncodings,
    appContext.initialState
  );

  const response = await nodeA.rpcRouter.dispatch(virtualProposalRpc);

  return {
    appInstanceId: (response.result as NodeTypes.ProposeInstallVirtualResult)
      .appInstanceId,
    params: virtualProposalRpc.parameters as NodeTypes.ProposeInstallVirtualParams
  };
}

export async function makeProposeCall(
  nodeA: Node,
  nodeB: Node,
  appDefinition: string,
  initialState?: SolidityValueType,
  initiatorDeposit: BigNumber = Zero,
  initiatorDepositTokenAddress: string = CONVENTION_FOR_ETH_TOKEN_ADDRESS,
  responderDeposit: BigNumber = Zero,
  responderDepositTokenAddress: string = CONVENTION_FOR_ETH_TOKEN_ADDRESS
): Promise<{
  appInstanceId: string;
  params: NodeTypes.ProposeInstallParams;
}> {
  const appContext = getAppContext(appDefinition, initialState);
  const installationProposalRpc = constructAppProposalRpc(
    nodeB.publicIdentifier,
    appContext.appDefinition,
    appContext.abiEncodings,
    appContext.initialState,
    initiatorDeposit,
    initiatorDepositTokenAddress,
    responderDeposit,
    responderDepositTokenAddress
  );

  const {
    result: {
      result: { appInstanceId }
    }
  } = await nodeA.rpcRouter.dispatch(installationProposalRpc);

  return {
    appInstanceId,
    params: installationProposalRpc.parameters as NodeTypes.ProposeInstallParams
  };
}

/**
 * @return the ERC20 token balance of the receiver
 */
export async function transferERC20Tokens(
  toAddress: string,
  tokenAddress: string = global["networkContext"]["DolphinCoin"],
  contractABI: ContractABI = DolphinCoin.abi,
  amount: BigNumber = One
): Promise<BigNumber> {
  const deployerAccount = new Wallet(
    global["fundedPrivateKey"],
    new JsonRpcProvider(global["ganacheURL"])
  );

  const contract = new Contract(tokenAddress, contractABI, deployerAccount);

  const balanceBefore: BigNumber = await contract.functions.balanceOf(
    toAddress
  );

  await contract.functions.transfer(toAddress, amount);
  const balanceAfter: BigNumber = await contract.functions.balanceOf(toAddress);

  expect(balanceAfter.sub(balanceBefore)).toEqual(amount);

  return balanceAfter;
}

export function getAppContext(
  appDefinition: string,
  initialState?: SolidityValueType,
  senderAddress?: string, // needed for both types of transfer apps
  receiverAddress?: string // needed for both types of transfer apps
): AppContext {
  let abiEncodings: AppABIEncodings;
  let initialAppState: SolidityValueType;
  let outcomeType: OutcomeType;

  const checkForAddresses = () => {
    const missingAddr = !senderAddress || !receiverAddress;
    if (missingAddr && !initialState) {
      throw new Error(
        "Must have sender and redeemer addresses to generate initial state for either transfer app context"
      );
    }
  };

  switch (appDefinition) {
    case (global["networkContext"] as NetworkContextForTestSuite).TicTacToeApp:
      initialAppState = initialState || initialEmptyTTTState();
      abiEncodings = tttAbiEncodings;
      outcomeType = OutcomeType.TWO_PARTY_FIXED_OUTCOME;
      break;

    case (global["networkContext"] as NetworkContextForTestSuite)
      .UnidirectionalTransferApp:
      checkForAddresses();
      initialAppState =
        initialState || initialTransferState(senderAddress!, receiverAddress!);
      abiEncodings = transferAbiEncodings;
      outcomeType = OutcomeType.SINGLE_ASSET_TWO_PARTY_COIN_TRANSFER;
      break;

    case (global["networkContext"] as NetworkContextForTestSuite)
      .UnidirectionalLinkedTransferApp:
      checkForAddresses();
      // TODO: need a better way to return the action info that generated
      // the linked hash as well
      const { state } = initialLinkedState(senderAddress!, receiverAddress!);
      initialAppState = initialState || state;
      abiEncodings = linkedAbiEncodings;
      outcomeType = OutcomeType.SINGLE_ASSET_TWO_PARTY_COIN_TRANSFER;
      break;

    default:
      throw Error(
        `Proposing the specified app is not supported: ${appDefinition}`
      );
  }

  return {
    appDefinition,
    abiEncodings,
    outcomeType,
    initialState: initialAppState
  };
}
