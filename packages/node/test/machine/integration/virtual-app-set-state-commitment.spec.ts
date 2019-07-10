import ChallengeRegistry from "@counterfactual/contracts/build/ChallengeRegistry.json";
import { NetworkContext } from "@counterfactual/types";
import * as chai from "chai";
import { randomBytes } from "crypto";
import * as matchers from "ethereum-waffle/dist/matchers/matchers";
import { Contract, Wallet } from "ethers";
import { AddressZero, MaxUint256, WeiPerEther, Zero } from "ethers/constants";
import {
  bigNumberify,
  getAddress,
  hexlify,
  Signature,
  SigningKey
} from "ethers/utils";

import { VirtualAppSetStateCommitment } from "../../../src/ethereum/virtual-app-set-state-commitment";
import { xkeysToSortedKthSigningKeys } from "../../../src/machine";
import { AppInstance, StateChannel } from "../../../src/models";
import { createFreeBalanceStateWithFundedETHAmounts } from "../../integration/utils";

import { toBeEq } from "./bignumber-jest-matcher";
import { connectToGanache } from "./connect-ganache";
import { getRandomHDNodes } from "./random-signing-keys";

// The ChallengeRegistry.setState call _could_ be estimated but we haven't
// written this test to do that yet
const SETSTATE_COMMITMENT_GAS = 6e9;

// The app versionNumber that the intermediary signs
const EXPIRY_TURN_NUM = MaxUint256.sub(1);

let wallet: Wallet;
let network: NetworkContext;
let appRegistry: Contract;

let multisigOwnerKeys: SigningKey[];
let virtualAppInstance: AppInstance;
let intermediaryCommitment: VirtualAppSetStateCommitment;
let intermediarySignature: Signature;

expect.extend({ toBeEq });

const expect2 = chai.use(matchers.default).expect;

beforeAll(async () => {
  [{}, wallet, {}] = await connectToGanache();

  network = global["networkContext"];

  appRegistry = new Contract(
    network.ChallengeRegistry,
    ChallengeRegistry.abi,
    wallet
  );
});

beforeEach(() => {
  const xkeys = getRandomHDNodes(2);

  multisigOwnerKeys = xkeysToSortedKthSigningKeys(
    xkeys.map(x => x.extendedKey),
    0
  );

  const stateChannel = StateChannel.setupChannel(
    network.FreeBalanceApp,
    AddressZero,
    xkeys.map(x => x.neuter().extendedKey)
  ).setFreeBalance(
    createFreeBalanceStateWithFundedETHAmounts(
      multisigOwnerKeys.map<string>(key => key.address),
      WeiPerEther
    )
  );

  virtualAppInstance = new AppInstance(
    /* multisigAddress */ stateChannel.multisigAddress,
    /* signingKeys */ stateChannel.multisigOwners,
    /* defautTimeout */ 10,
    /* appInterface */ {
      addr: getAddress(hexlify(randomBytes(20))),
      stateEncoding: "tuple(address foo, uint256 bar)",
      actionEncoding: undefined
    },
    /* isVirtualApp */ true,
    /* appSeqNo */ 5,
    /* latestState */ { foo: AddressZero, bar: bigNumberify(0) },
    /* latestVersionNumber */ 10,
    /* latestTimeout */ 10,
    /* twoPartyOutcomeInterpreterParams */ {
      playerAddrs: [AddressZero, AddressZero],
      amount: Zero
    },
    /* coinTransferInterpreterParams */ undefined
  );

  intermediaryCommitment = new VirtualAppSetStateCommitment(
    network,
    virtualAppInstance.identity,
    virtualAppInstance.timeout,
    undefined,
    undefined
  );
  intermediarySignature = multisigOwnerKeys[0].signDigest(
    intermediaryCommitment.hashToSign(true)
  );
});

describe.skip("The virtualAppSetState transaction generated by the commitment", () => {
  it("succeeds", async () => {
    const userCommitment = new VirtualAppSetStateCommitment(
      network,
      virtualAppInstance.identity,
      virtualAppInstance.timeout,
      virtualAppInstance.hashOfLatestState,
      virtualAppInstance.versionNumber
    );

    const userSignature = multisigOwnerKeys[1].signDigest(
      userCommitment.hashToSign(false)
    );

    const txn = userCommitment.getSignedTransaction(
      [userSignature],
      intermediarySignature
    );

    await wallet.sendTransaction({
      ...txn,
      gasLimit: SETSTATE_COMMITMENT_GAS
    });

    const contractAppState = await appRegistry.appChallenges(
      virtualAppInstance.identityHash
    );

    expect(contractAppState.appStateHash).toBe(
      virtualAppInstance.hashOfLatestState
    );
  });

  it("fails with versionNumber above expiry", async () => {
    // the commitment with all the information needed to generate signatures
    // and a transaction
    const fullCommitment = new VirtualAppSetStateCommitment(
      network,
      virtualAppInstance.identity,
      virtualAppInstance.timeout,
      virtualAppInstance.hashOfLatestState,
      EXPIRY_TURN_NUM.add(1)
    );

    const s1 = multisigOwnerKeys[1].signDigest(
      fullCommitment.hashToSign(false)
    );

    const txn = fullCommitment.getSignedTransaction(
      [s1],
      intermediarySignature
    );

    expect2(true);

    await (expect2(
      wallet.sendTransaction({
        ...txn,
        gasLimit: SETSTATE_COMMITMENT_GAS
      })
    ).to.be as any).revertedWith(
      "Tried to call virtualAppSetState with versionNumber greater than intermediary versionNumber expiry"
    );
  });
});
