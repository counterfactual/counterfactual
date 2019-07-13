import { parseEther } from "ethers/utils";
import { JsonRPCResponse } from "web3/providers";
import {
  CounterfactualEvent,
  CounterfactualMethod,
  EthereumGlobal
} from "../types";

export const ETHEREUM_MOCK_ADDRESS =
  "0x9aF5D0dcABc31B1d80639ac3042b2aD754f072FE";

export const MULTISIG_MOCK_ADDRESS =
  "0x54601F103dD6AE110aEf7F9007670f593d24a6ac";

export const NODE_MOCK_ADDRESS =
  "xpub6EAvo4pQADUK1nFB2UnC9nC5G9iDN3YaeVQ8vA77eU7GEjaZK8H5jDP8M89kJeajTqXJrfbKXgptCqtvpaG1ydED657Kj6dbfjYse6F7Uxy";

export const COUNTERPARTY_MOCK_ADDRESS =
  "xpub6E7Ww5YRUry7BRUNAqyNGqR1A3AyaRP1dKy8adD5N5nniqkDJpibhspkiLzyhKe9o5TFnHpEhdtautQLqxahWQFCDCeQdBFmRwUiChfUXP4";

export const FREE_BALANCE_MOCK_ADDRESS =
  "0xDe214c9409962811C8b7522a663710Bf334D6260";

export const COUNTERPARTY_FREE_BALANCE_MOCK_ADDRESS =
  "0xb6c0924Ca0C030AC64c037C3Af665aebb78cB109";

export type EthereumMockBehaviors = {
  failOnEnable: boolean;
  rejectDeposit: boolean;
};

export default class EthereumMock implements EthereumGlobal {
  responseCallbacks: undefined;
  notificationCallbacks: undefined;
  connection: undefined;
  addDefaultEvents: undefined;

  networkVersion: string = "";
  selectedAddress: string = "";

  isMetaMask?: boolean = false;
  host?: string;
  path?: string;

  mockBehaviors: EthereumMockBehaviors = {
    failOnEnable: false,
    rejectDeposit: false
  };

  constructor(private readonly events: { [key: string]: Function[] } = {}) {}

  async enable() {
    if (this.mockBehaviors.failOnEnable) {
      throw new Error();
    }

    this.selectedAddress = ETHEREUM_MOCK_ADDRESS;
  }

  on(type: string, callback: () => any): undefined {
    this.events[type] = [...(this.events[type] || []), callback];
    return;
  }

  removeListener(type: string, callback: () => any): undefined {
    this.events[type] = (this.events[type] || []).filter(cb => cb === callback);
    return;
  }

  removeAllListeners(type: string): undefined {
    this.events[type] = [];
    return;
  }

  async send(
    eventOrMethod: CounterfactualMethod | CounterfactualEvent,
    data?: any[]
  ): Promise<JsonRPCResponse> {
    if (eventOrMethod === CounterfactualMethod.RequestDeposit) {
      if (this.mockBehaviors.rejectDeposit) {
        throw new Error();
      }
    }

    if (eventOrMethod === CounterfactualMethod.RequestBalances) {
      return {
        jsonrpc: "2.0",
        result: {
          [FREE_BALANCE_MOCK_ADDRESS]: parseEther("1.0"),
          [COUNTERPARTY_FREE_BALANCE_MOCK_ADDRESS]: parseEther("1.0")
        },
        id: Date.now()
      };
    }

    return {
      jsonrpc: "2.0",
      result: {}
    } as JsonRPCResponse;
  }

  reset(): undefined {
    return;
  }
}
