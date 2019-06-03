import { SolidityABIEncoderV2Type } from "@counterfactual/types";
import chai from "chai";
import * as waffle from "ethereum-waffle";
import { Contract } from "ethers";
import { Zero } from "ethers/constants";
import { BigNumber, defaultAbiCoder } from "ethers/utils";

import EthUnidirectionalTransferApp from "../build/EthUnidirectionalTransferApp.json";

chai.use(waffle.solidity);

type EthTransfer = {
  to: string;
  amount: BigNumber;
};

type EthTransferAppState = {
  transfers: EthTransfer[];
  finalized: boolean;
};

type Action = {
  transferAmount: BigNumber;
  finalize: boolean;
};

const { expect } = chai;

function mkAddress(prefix: string = "0xa"): string {
  return prefix.padEnd(42, "0");
}

function decodeBytesToAppState(encodedAppState: string): EthTransferAppState {
  return defaultAbiCoder.decode(
    [`tuple(tuple(address to, uint256 amount)[2] transfers, bool finalized)`],
    encodedAppState
  )[0];
}

describe("EthTransferApp", () => {
  let ethTransferApp: Contract;

  function encodeState(state: SolidityABIEncoderV2Type) {
    return defaultAbiCoder.encode(
      [`tuple(tuple(address to, uint256 amount)[2] transfers, bool finalized)`],
      [state]
    );
  }

  function encodeAction(state: SolidityABIEncoderV2Type) {
    return defaultAbiCoder.encode(
      [`tuple(uint256 transferAmount, bool finalize)`],
      [state]
    );
  }

  async function applyAction(
    state: SolidityABIEncoderV2Type,
    action: SolidityABIEncoderV2Type
  ) {
    return await ethTransferApp.functions.applyAction(
      encodeState(state),
      encodeAction(action)
    );
  }

  before(async () => {
    const provider = waffle.createMockProvider();
    const wallet = (await waffle.getWallets(provider))[0];
    ethTransferApp = await waffle.deployContract(
      wallet,
      EthUnidirectionalTransferApp
    );
  });

  describe("applyAction", () => {
    it("can make payments", async () => {
      const senderAddr = mkAddress("0xa");
      const receiverAddr = mkAddress("0xb");
      const senderAmt = new BigNumber(10000);
      const transferAmt1 = new BigNumber(10);
      const transferAmt2 = new BigNumber(20);
      const preState: EthTransferAppState = {
        transfers: [
          {
            to: senderAddr,
            amount: senderAmt
          },
          {
            to: receiverAddr,
            amount: Zero
          }
        ],
        finalized: false
      };

      let action: Action = {
        transferAmount: transferAmt1,
        finalize: false
      };

      let ret = await applyAction(preState, action);

      let state = decodeBytesToAppState(ret);
      expect(state.transfers[0].amount).to.eq(senderAmt.sub(transferAmt1));
      expect(state.transfers[1].amount).to.eq(transferAmt1);

      action = {
        transferAmount: transferAmt2,
        finalize: false
      };
      ret = await applyAction(state, action);

      state = decodeBytesToAppState(ret);
      expect(state.transfers[0].amount).to.eq(
        senderAmt.sub(transferAmt1).sub(transferAmt2)
      );
      expect(state.transfers[1].amount).to.eq(transferAmt1.add(transferAmt2));
    });
  });

  it("can finalize the state with a 0 payment", async () => {
    const senderAddr = mkAddress("0xa");
    const receiverAddr = mkAddress("0xb");
    const senderAmt = new BigNumber(10000);
    const preState: EthTransferAppState = {
      transfers: [
        {
          to: senderAddr,
          amount: senderAmt
        },
        {
          to: receiverAddr,
          amount: Zero
        }
      ],
      finalized: false
    };

    const action: Action = {
      transferAmount: Zero,
      finalize: true
    };

    const ret = await applyAction(preState, action);
    const state = decodeBytesToAppState(ret);
    expect(state.finalized).to.be.true;
  });
});
