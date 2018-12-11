import { legacy } from "@counterfactual/cf.js";
import { ethers } from "ethers";

import {
  AppIdentity,
  AppInterface,
  AssetType,
  Terms
} from "@counterfactual/types";

import { UninstallProposer } from "../../../src/middleware/state-transition/uninstall-proposer";
import { Node, StateChannelInfoImpl } from "../../../src/node";
import { Opcode } from "../../../src/opcodes";
import { InternalMessage, StateProposal } from "../../../src/types";
import { appIdentityToHash } from "../../../src/utils/app-identity";
import { APP_INTERFACE, TERMS } from "../../../src/utils/encodings";
import {
  freeBalanceTerms,
  freeBalanceTermsHash,
  getFreeBalanceAppInterfaceHash
} from "../../../src/utils/free-balance";

const {
  bigNumberify,
  hexlify,
  randomBytes,
  getAddress,
  keccak256,
  defaultAbiCoder
} = ethers.utils;

const { AddressZero } = ethers.constants;

describe("Install Proposer", () => {
  let proposal: StateProposal;

  // Test network context
  const networkContext = {
    ETHBucket: getAddress(hexlify(randomBytes(20))),
    StateChannelTransaction: getAddress(hexlify(randomBytes(20))),
    MultiSend: getAddress(hexlify(randomBytes(20))),
    NonceRegistry: getAddress(hexlify(randomBytes(20))),
    AppRegistry: getAddress(hexlify(randomBytes(20))),
    ETHBalanceRefund: getAddress(hexlify(randomBytes(20)))
  };

  // General interaction testing values
  const interaction = {
    sender: getAddress(hexlify(randomBytes(20))),
    receiver: getAddress(hexlify(randomBytes(20)))
  };

  // State channel testing values
  const stateChannel = {
    multisigAddress: getAddress(hexlify(randomBytes(20))),
    // Need to sort the addresses upon entry atm
    // TODO: Figure out better address sorting handler (throw error if not sorted?)
    multisigOwners: [interaction.sender, interaction.receiver].sort((a, b) =>
      parseInt(a, 16) < parseInt(b, 16) ? -1 : 1
    ),
    monotonicallyIncreasingAppNonce: 1
  };

  // App-to-be-uninstalled test values
  const app = {
    uniqueAppNonceWithinStateChannel: 1,

    stateEncoding: `
      tuple(
        address foo,
        uint256 bar
      )
    `,

    interface: {
      addr: getAddress(hexlify(randomBytes(20))),
      applyAction: hexlify(randomBytes(4)),
      resolve: hexlify(randomBytes(4)),
      isStateTerminal: hexlify(randomBytes(4)),
      getTurnTaker: hexlify(randomBytes(4))
    } as AppInterface,

    terms: {
      assetType: AssetType.ETH,
      limit: bigNumberify(8),
      token: AddressZero
    } as Terms,

    identity: {
      /* assignment done below to reuse app.{interface, terms} values */
    } as AppIdentity,

    initialState: ""
  };

  // TODO: (idea) The InstallProposer should probably do this internally.
  app.initialState = defaultAbiCoder.encode(
    [app.stateEncoding],
    [{ foo: AddressZero, bar: 0 }]
  );

  app.identity = {
    owner: stateChannel.multisigAddress,
    signingKeys: [
      getAddress(hexlify(randomBytes(20))),
      getAddress(hexlify(randomBytes(20)))
      // Need to sort the addresses upon entry atm
      // TODO: Figure out better address sorting handler (throw error if not sorted?)
    ].sort((a, b) => (parseInt(a, 16) < parseInt(b, 16) ? -1 : 1)),
    appInterfaceHash: keccak256(
      defaultAbiCoder.encode([APP_INTERFACE], [app.interface])
    ),
    termsHash: keccak256(defaultAbiCoder.encode([TERMS], [app.terms])),
    defaultTimeout: 100
  };

  // Test free balance values
  const freeBalance = {
    uniqueAppNonceWithinStateChannel: 0,

    currentLocalNonce: 10,

    defaultTimeout: 100,

    appIdentity: {
      owner: stateChannel.multisigAddress,
      signingKeys: stateChannel.multisigOwners,
      appInterfaceHash: getFreeBalanceAppInterfaceHash(
        networkContext.ETHBucket
      ),
      termsHash: freeBalanceTermsHash,
      // NOTE: This *must* be the same as freeBalance.defaultTimeout above
      defaultTimeout: 100
    } as AppIdentity,

    terms: freeBalanceTerms,

    state: {
      alice: stateChannel.multisigOwners[0],
      bob: stateChannel.multisigOwners[1],
      aliceBalance: bigNumberify(Math.ceil(100 * Math.random())),
      bobBalance: bigNumberify(Math.ceil(100 * Math.random()))
    }
  };

  beforeAll(() => {
    const message = new InternalMessage(
      legacy.node.ActionName.UNINSTALL,
      Opcode.STATE_TRANSITION_PROPOSE,
      {
        action: legacy.node.ActionName.UNINSTALL,
        data: {
          peerAmounts: [
            new legacy.utils.PeerBalance(
              freeBalance.state.alice,
              freeBalance.state.aliceBalance.div(2)
            ),
            new legacy.utils.PeerBalance(
              freeBalance.state.bob,
              freeBalance.state.bobBalance.div(2)
            )
          ]
        },
        appInstanceId: appIdentityToHash(app.identity),
        multisigAddress: stateChannel.multisigAddress,
        fromAddress: interaction.sender,
        toAddress: interaction.receiver,
        seq: 0
      }
    );

    proposal = UninstallProposer.propose(
      message,
      new Node(
        {
          [stateChannel.multisigAddress]: new StateChannelInfoImpl(
            interaction.receiver,
            interaction.sender,
            stateChannel.multisigAddress,
            {
              [appIdentityToHash(app.identity)]: {
                id: appIdentityToHash(app.identity),
                uniqueId: app.uniqueAppNonceWithinStateChannel,
                peerA: new legacy.utils.PeerBalance(
                  freeBalance.state.alice,
                  freeBalance.state.aliceBalance.div(2)
                ),
                peerB: new legacy.utils.PeerBalance(
                  freeBalance.state.bob,
                  freeBalance.state.bobBalance.div(2)
                ),
                // TODO: These fields are optional on the type
                // keyA: app.identity.signingKeys[0],
                // keyB: app.identity.signingKeys[1],
                encodedState: app.initialState,
                appStateHash: keccak256(app.initialState),
                localNonce: 10,
                timeout: 100,
                terms: new legacy.app.Terms(
                  app.terms.assetType,
                  app.terms.limit,
                  app.terms.token
                ),
                cfApp: new legacy.app.AppInterface(
                  app.interface.addr,
                  app.interface.applyAction,
                  app.interface.resolve,
                  app.interface.getTurnTaker,
                  app.interface.isStateTerminal,
                  app.stateEncoding
                ),
                dependencyNonce: new legacy.utils.Nonce(false, 0, 0)
                // TODO: These fields are optional on the type
                // stateChannel: {
                //   counterParty: interaction.receiver,
                //   me: interaction.sender,
                //   multisigAddress: stateChannel.multisigAddress,
                //   appInstances: [],
                //   freeBalance: null,
                //   owners: () => []
              }
            },
            new legacy.utils.FreeBalance(
              freeBalance.state.alice,
              freeBalance.state.aliceBalance,
              freeBalance.state.bob,
              freeBalance.state.bobBalance,
              freeBalance.currentLocalNonce, // local nonce
              // Whys is "uniqueId" a number?
              0, // TODO: appIdentityToHash(freeBalance.appIdentity),
              freeBalance.defaultTimeout, // timeout
              new legacy.utils.Nonce(true, 0, 0) // nonce
            )
          )
        },
        {}
      )
    );
  });

  it("should return an object with one key, the multisig address", () => {
    const { state } = proposal;
    expect(Object.keys(state).length).toEqual(1);
    expect(Object.keys(state)[0]).toBe(stateChannel.multisigAddress);
  });

  describe("the generated proposed state", () => {
    let multisigAddress: string;
    let updatedFreeBalance: legacy.utils.FreeBalance;
    let me: string;
    let appInstances: legacy.app.AppInstanceInfos;
    let counterParty: string;

    beforeAll(() => {
      const info = proposal.state[stateChannel.multisigAddress];
      multisigAddress = info.multisigAddress;
      updatedFreeBalance = info.freeBalance;
      me = info.me;
      counterParty = info.counterParty;
      appInstances = info.appInstances;
    });

    it("should set the free balance to the computed resolution values", () => {
      const alicesNewBalance = freeBalance.state.aliceBalance.add(
        freeBalance.state.aliceBalance.div(2)
      );
      const bobsNewBalance = freeBalance.state.bobBalance.add(
        freeBalance.state.bobBalance.div(2)
      );
      expect(updatedFreeBalance.aliceBalance).toEqual(alicesNewBalance);
      expect(updatedFreeBalance.bobBalance).toEqual(bobsNewBalance);
    });

    it("should set the open app instances to be of length 0 (b/c we uninstalled)", () => {
      expect(Object.keys(appInstances).length).toEqual(0);
    });

    it("should return correct channel metadata", () => {
      expect(multisigAddress).toBe(stateChannel.multisigAddress);
      expect(me).toBe(interaction.sender);
      expect(counterParty).toBe(interaction.receiver);
    });

    //   describe("the proposed AppInstance", () => {
    //     let appInstance: legacy.app.AppInstanceInfo;

    //     beforeAll(() => {
    //       // We check the 0th indexed value to parallelize tests even in the case
    //       // where the key is set incorrectly (the test immediately below this one)
    //       appInstance = appInstances[Object.keys(appInstances)[0]];
    //     });

    //     it("should set the id correctly", () => {
    //       const expectedId = appIdentityToHash(app.identity);
    //       expect(Object.keys(appInstances)[0]).toEqual(expectedId);
    //       expect(appInstances[expectedId].id).toEqual(expectedId);
    //     });

    //     it("should compute the subdeposits correctly", () => {
    //       expect(appInstance.peerA.address).toEqual(interaction.sender);
    //       expect(appInstance.peerA.balance).toEqual(bigNumberify(5));
    //       expect(appInstance.peerB.address).toEqual(interaction.receiver);
    //       expect(appInstance.peerB.balance).toEqual(bigNumberify(3));
    //     });

    //     it("should return the proposed encoded state", () => {
    //       expect(appInstance.encodedState).toEqual(app.initialState);
    //     });

    //     it("should start the nonce at 1", () => {
    //       expect(appInstance.localNonce).toEqual(1);
    //     });

    //     it("should use the default timeout for the new apps initial state", () => {
    //       expect(appInstance.timeout).toEqual(app.identity.defaultTimeout);
    //     });

    //     it("should use the terms provided", () => {
    //       expect(appInstance.terms.assetType).toEqual(AssetType.ETH);
    //       expect(appInstance.terms.limit).toEqual(app.terms.limit);
    //       expect(appInstance.terms.token).toEqual(app.terms.token);
    //     });

    //     it("should use the app interface provided", () => {
    //       expect(appInstance.cfApp.address).toEqual(app.interface.addr);
    //       expect(appInstance.cfApp.applyAction).toEqual(
    //         app.interface.applyAction
    //       );
    //       expect(appInstance.cfApp.resolve).toEqual(app.interface.resolve);
    //       expect(appInstance.cfApp.getTurnTaker).toEqual(
    //         app.interface.getTurnTaker
    //       );
    //       expect(appInstance.cfApp.isStateTerminal).toEqual(
    //         app.interface.isStateTerminal
    //       );
    //     });

    //     it("should set the dependency nonce to some random number", () => {
    //       const expectedSalt = keccak256(
    //         defaultAbiCoder.encode(
    //           ["uint256"],
    //           [stateChannel.monotonicallyIncreasingAppNonce + 1]
    //         )
    //       );
    //       expect(appInstance.dependencyNonce.salt).toEqual(expectedSalt);
    //       expect(appInstance.dependencyNonce.nonceValue).toEqual(0);
    //     });
    //   });
  });
});
