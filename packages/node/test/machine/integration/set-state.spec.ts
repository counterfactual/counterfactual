import ChallengeRegistry from "@counterfactual/contracts/build/ChallengeRegistry.json";
import {
  NetworkContext,
  SolidityABIEncoderV2Type
} from "@counterfactual/types";
import { Contract, Wallet } from "ethers";
import { AddressZero, WeiPerEther } from "ethers/constants";

import { SetStateCommitment } from "../../../src/ethereum";
import { xkeysToSortedKthSigningKeys } from "../../../src/machine";
import { StateChannel } from "../../../src/models";
import { convertFreeBalanceStateToPlainObject } from "../../../src/models/free-balance";

import { toBeEq } from "./bignumber-jest-matcher";
import { connectToGanache } from "./connect-ganache";
import { getRandomHDNodes } from "./random-signing-keys";

// The ChallengeRegistry.setState call _could_ be estimated but we haven't
// written this test to do that yet
const SETSTATE_COMMITMENT_GAS = 6e9;

let wallet: Wallet;
let network: NetworkContext;
let appRegistry: Contract;

expect.extend({ toBeEq });

beforeAll(async () => {
  [{}, wallet, {}] = await connectToGanache();

  network = global["networkContext"];

  appRegistry = new Contract(
    network.ChallengeRegistry,
    ChallengeRegistry.abi,
    wallet
  );
});

/**
 * @summary Setup a StateChannel then set state on ETH Free Balance
 */
describe("set state on free balance", () => {
  it("should have the correct versionNumber", async done => {
    const xkeys = getRandomHDNodes(2);

    const multisigOwnerKeys = xkeysToSortedKthSigningKeys(
      xkeys.map(x => x.extendedKey),
      0
    );

    let stateChannel = StateChannel.setupChannel(
      network.CoinBucket,
      AddressZero,
      xkeys.map(x => x.neuter().extendedKey)
    );
    const ethFreeBalance = {};
    ethFreeBalance[AddressZero] = [
      {
        to: multisigOwnerKeys[0].address,
        amount: WeiPerEther
      },
      {
        to: multisigOwnerKeys[1].address,
        amount: WeiPerEther
      }
    ];

    stateChannel = stateChannel.setFreeBalance(
      (convertFreeBalanceStateToPlainObject(
        ethFreeBalance
      ) as unknown) as SolidityABIEncoderV2Type
    );

    const freeBalanceETH = stateChannel.freeBalance;

    const setStateCommitment = new SetStateCommitment(
      network,
      freeBalanceETH.identity,
      freeBalanceETH.hashOfLatestState,
      freeBalanceETH.versionNumber,
      freeBalanceETH.timeout
    );

    const setStateTx = setStateCommitment.transaction([
      multisigOwnerKeys[0].signDigest(setStateCommitment.hashToSign()),
      multisigOwnerKeys[1].signDigest(setStateCommitment.hashToSign())
    ]);

    await wallet.sendTransaction({
      ...setStateTx,
      gasLimit: SETSTATE_COMMITMENT_GAS
    });

    const contractAppState = await appRegistry.appChallenges(
      freeBalanceETH.identityHash
    );

    expect(contractAppState.versionNumber).toBeEq(
      setStateCommitment.appversionNumber
    );

    done();
  });
});
