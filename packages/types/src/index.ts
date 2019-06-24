import {
  AppIdentity,
  AppInterface,
  CoinBucketBalance,
  DecodedFreeBalance,
  SignedStateHashUpdate
} from "./app-instance";
import {
  AppABIEncodings,
  AppInstanceInfo,
  coinBalanceRefundStateEncoding,
  CoinTransferInterpreterParams,
  OutcomeType,
  TwoPartyFixedOutcome,
  TwoPartyFixedOutcomeInterpreterParams
} from "./data-types";
import { INodeProvider, IRpcNodeProvider, Node } from "./node";
import {
  ABIEncoding,
  Address,
  AppInstanceID,
  Bytes32,
  ContractABI,
  SolidityABIEncoderV2Type
} from "./simple-types";

export interface NetworkContext {
  ChallengeRegistry: string;
  CoinBalanceRefundApp: string;
  CoinBucket: string;
  CoinInterpreter: string;
  MinimumViableMultisig: string;
  MultiSend: string;
  ProxyFactory: string;
  RootNonceRegistry: string;
  StateChannelTransaction: string;
  TwoPartyEthAsLump: string;
  TwoPartyVirtualEthAsLump: string;
  UninstallKeyRegistry: string;
}

// Keep in sync with above
export const networkContextProps = [
  "ChallengeRegistry",
  "CoinBalanceRefundApp",
  "CoinBucket",
  "CoinInterpreter",
  "MinimumViableMultisig",
  "MultiSend",
  "ProxyFactory",
  "RootNonceRegistry",
  "StateChannelTransaction",
  "TwoPartyEthAsLump",
  "TwoPartyVirtualEthAsLump",
  "UninstallKeyRegistry"
];

export interface ContractMigration {
  contractName: string;
  address: string;
  transactionHash: string;
}

export {
  ABIEncoding,
  Address,
  AppABIEncodings,
  AppIdentity,
  AppInstanceID,
  AppInstanceInfo,
  AppInterface,
  CoinTransferInterpreterParams,
  SolidityABIEncoderV2Type,
  Bytes32,
  ContractABI,
  DecodedFreeBalance,
  coinBalanceRefundStateEncoding,
  CoinBucketBalance,
  INodeProvider,
  IRpcNodeProvider,
  Node,
  OutcomeType,
  SignedStateHashUpdate,
  TwoPartyFixedOutcome,
  TwoPartyFixedOutcomeInterpreterParams
};
