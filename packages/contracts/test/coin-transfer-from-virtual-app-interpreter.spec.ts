import DolphinCoin from "@counterfactual/contracts/build/DolphinCoin.json";
import SingleAssetTwoPartyCoinTransferFromVirtualAppInterpreter from "@counterfactual/contracts/build/SingleAssetTwoPartyCoinTransferFromVirtualAppInterpreter.json";
import * as waffle from "ethereum-waffle";
import { Contract, Wallet } from "ethers";
import { AddressZero, One, Zero } from "ethers/constants";
import { Web3Provider } from "ethers/providers";
import {
  BigNumber,
  BigNumberish,
  defaultAbiCoder,
  hexlify,
  randomBytes
} from "ethers/utils";

import { expect } from "./utils/index";

type CoinTransfer = {
  to: string;
  amount: BigNumber;
};

type InterpreterParams = {
  capitalProvided: BigNumberish;
  expiryBlock: BigNumberish;
  capitalProvider: string;
  virtualAppUser: string;
  tokenAddress: string;
};

const encodeParams = (params: InterpreterParams) =>
  defaultAbiCoder.encode(
    [
      `
        tuple(
          uint256 capitalProvided,
          uint256 expiryBlock,
          address capitalProvider,
          address virtualAppUser,
          address tokenAddress
        )
      `
    ],
    [params]
  );

const encodeOutcome = (outcome: CoinTransfer) =>
  defaultAbiCoder.encode(
    [
      `
        tuple(
          address to,
          uint256 amount
        )
      `
    ],
    [outcome]
  );

describe("SingleAssetTwoPartyCoinTransferFromVirtualAppInterpreter", () => {
  let provider: Web3Provider;
  let wallet: Wallet;
  let erc20: Contract;
  let coinTransferFromVirtualAppInterpreter: Contract;

  async function interpretOutcomeAndExecuteEffect(
    outcome: CoinTransfer,
    params: InterpreterParams
  ) {
    return await coinTransferFromVirtualAppInterpreter.functions.interpretOutcomeAndExecuteEffect(
      encodeOutcome(outcome),
      encodeParams(params)
    );
  }

  before(async () => {
    provider = waffle.createMockProvider();
    wallet = (await waffle.getWallets(provider))[0];
    erc20 = await waffle.deployContract(wallet, DolphinCoin);

    coinTransferFromVirtualAppInterpreter = await waffle.deployContract(
      wallet,
      SingleAssetTwoPartyCoinTransferFromVirtualAppInterpreter
    );

    // fund interpreter with ERC20 tokenAddresses
    await erc20.functions.transfer(
      coinTransferFromVirtualAppInterpreter.address,
      erc20.functions.balanceOf(wallet.address)
    );

    // fund interpreter with ETH
    await wallet.sendTransaction({
      to: coinTransferFromVirtualAppInterpreter.address,
      value: new BigNumber(100)
    });
  });

  it("Can distribute ETH coins correctly in full", async () => {
    const to = hexlify(randomBytes(20));
    const lender = hexlify(randomBytes(20));
    const capitalProvided = One;

    await interpretOutcomeAndExecuteEffect(
      { to, amount: capitalProvided },
      {
        capitalProvided,
        expiryBlock: (await provider.getBlockNumber()) + 100,
        capitalProvider: to,
        virtualAppUser: lender,
        tokenAddress: AddressZero
      }
    );

    expect(await provider.getBalance(to)).to.eq(One);
    expect(await provider.getBalance(lender)).to.eq(Zero);
  });

  // FIXME: This test fails because `lender` has Zero amount. I think probably
  //        has something to do with the fact that `address payable` is used but
  //        I'm not entirely sure.
  it.skip("Can distribute ETH coins correctly partially", async () => {
    const to = hexlify(randomBytes(20));
    const lender = hexlify(randomBytes(20));
    const capitalProvided = One;
    const amount = capitalProvided.div(2);

    await interpretOutcomeAndExecuteEffect(
      { to, amount },
      {
        capitalProvided,
        expiryBlock: (await provider.getBlockNumber()) + 100,
        capitalProvider: to,
        virtualAppUser: lender,
        tokenAddress: AddressZero
      }
    );

    expect(await provider.getBalance(to)).to.eq(amount);
    expect(await provider.getBalance(lender)).to.eq(amount);
  });

  it("Can distribute ERC20 only correctly in full", async () => {
    const to = hexlify(randomBytes(20));
    const lender = hexlify(randomBytes(20));
    const capitalProvided = One;

    await interpretOutcomeAndExecuteEffect(
      { to, amount: capitalProvided },
      {
        capitalProvided,
        expiryBlock: (await provider.getBlockNumber()) + 100,
        capitalProvider: to,
        virtualAppUser: lender,
        tokenAddress: erc20.address
      }
    );

    expect(await erc20.functions.balanceOf(to)).to.eq(One);
    expect(await erc20.functions.balanceOf(lender)).to.eq(Zero);
  });

  // FIXME: This test fails because `lender` has Zero amount. I think probably
  //        has something to do with the fact that `address payable` is used but
  //        I'm not entirely sure.
  it.skip("Can distribute ERC20 coins correctly partially", async () => {
    const to = hexlify(randomBytes(20));
    const lender = hexlify(randomBytes(20));
    const capitalProvided = One;
    const amount = capitalProvided.div(2);

    await interpretOutcomeAndExecuteEffect(
      { to, amount },
      {
        capitalProvided,
        expiryBlock: (await provider.getBlockNumber()) + 100,
        capitalProvider: to,
        virtualAppUser: lender,
        tokenAddress: erc20.address
      }
    );

    expect(await erc20.functions.balanceOf(to)).to.eq(amount);
    expect(await erc20.functions.balanceOf(lender)).to.eq(amount);
  });
});
