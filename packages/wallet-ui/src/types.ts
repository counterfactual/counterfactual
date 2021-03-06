import { AsyncSendable, JsonRpcSigner, Web3Provider } from "ethers/providers";
import { IpcProvider, JsonRPCResponse } from "web3/providers";
import { AddressZero } from "ethers/constants";
import { AssetType } from "./store/types";
import Web3 from "web3";

export enum RoutePath {
  Root = "/",
  SetupRegister = "/setup/register",
  SetupDeposit = "/setup/deposit",
  Deposit = "/deposit",
  Balance = "/balance",
  Withdraw = "/withdraw",
  Channels = "/channels"
}

export const defaultToken: AssetType = {
  tokenAddress: AddressZero,
  name: "Ethereum",
  shortName: "ETH"
};

export type EthereumServiceContext = {
  provider: Web3Provider;
  signer: JsonRpcSigner;
};

export enum CounterfactualMethod {
  GetNodeAddress = "counterfactual:get:nodeAddress",
  SetUser = "counterfactual:set:user",
  RequestUser = "counterfactual:request:user",
  RequestDeposit = "counterfactual:request:deposit",
  RequestWithdraw = "counterfactual:request:withdraw",
  RequestBalances = "counterfactual:request:balances",
  RequestIndexedBalances = "counterfactual:request:token_indexed_balances",
  RequestChannels = "counterfactual:request:channels",
  RequestChannel = "counterfactual:request:channel"
}

export enum CounterfactualEvent {
  CreateChannel = "counterfactual:listen:createChannel",
  RequestDepositStart = "counterfactual:request:deposit_start"
}

export type EthereumGlobal = Omit<IpcProvider, "send"> &
  Omit<AsyncSendable, "send"> & {
    enable: () => Promise<void>;
    selectedAddress: string;
    networkVersion: string;
    send: (
      eventOrMethod: CounterfactualMethod | CounterfactualEvent,
      data?: any[]
    ) => Promise<JsonRPCResponse>;
  };

declare global {
  interface Window {
    ethereum: EthereumGlobal;
    web3: Web3;
  }
}
