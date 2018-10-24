import * as Utils from "@counterfactual/dev-utils";
import * as ethers from "ethers";

import { Conditional } from "../../types/ethers-contracts/Conditional";
import { DelegateProxy } from "../../types/ethers-contracts/DelegateProxy";

import { AbstractContract, expect } from "../../utils";

const web3 = (global as any).web3;
const { provider, unlockedAccount } = Utils.setupTestEnv(web3);

contract("ConditionalTransaction", (accounts: string[]) => {
  let testCondition: Conditional;
  let testDelegateProxy: DelegateProxy;
  let ct: ethers.Contract;

  // @ts-ignore
  before(async () => {
    const exampleCondition = await AbstractContract.loadBuildArtifact(
      "ExampleCondition"
    );
    const delegateProxy = await AbstractContract.loadBuildArtifact(
      "DelegateProxy"
    );
    const conditionalTransaction = await AbstractContract.loadBuildArtifact(
      "ConditionalTransaction"
    );

    testCondition = (await exampleCondition.deploy(
      unlockedAccount
    )) as Conditional;
    testDelegateProxy = (await delegateProxy.deploy(
      unlockedAccount
    )) as DelegateProxy;
    ct = await conditionalTransaction.getDeployed(unlockedAccount);
  });

  describe("Pre-commit to transfer details", () => {
    const makeCondition = (expectedValue, onlyCheckForSuccess) => ({
      onlyCheckForSuccess,
      expectedValueHash: ethers.utils.solidityKeccak256(
        ["bytes"],
        [expectedValue]
      ),
      parameters: ethers.constants.HashZero,
      selector: testCondition.interface.functions.isSatisfiedNoParam.sighash,
      to: testCondition.address
    });

    const makeConditionParam = (expectedValue, parameters) => ({
      parameters,
      expectedValueHash: ethers.utils.solidityKeccak256(
        ["bytes"],
        [expectedValue]
      ),
      onlyCheckForSuccess: false,
      selector: testCondition.interface.functions.isSatisfiedParam.sighash,
      to: testCondition.address
    });

    const trueParam = ethers.utils.defaultAbiCoder.encode(
      ["tuple(bool)"],
      [[true]]
    );

    const falseParam = ethers.utils.defaultAbiCoder.encode(
      ["tuple(bool)"],
      [[false]]
    );

    beforeEach(async () => {
      await unlockedAccount.sendTransaction({
        to: testDelegateProxy.address,
        value: Utils.UNIT_ETH
      });
    });

    it("transfers the funds conditionally if true", async () => {
      const randomTarget = Utils.randomETHAddress();
      const tx = ct.interface.functions.executeSimpleConditionalTransaction.encode(
        [
          makeCondition(ethers.constants.HashZero, true),
          {
            value: [Utils.UNIT_ETH],
            assetType: 0,
            to: [randomTarget],
            token: ethers.constants.AddressZero,
            data: []
          }
        ]
      );

      await testDelegateProxy.functions.delegate(
        ct.address,
        tx,
        Utils.HIGH_GAS_LIMIT
      );

      const balTarget = await provider.getBalance(randomTarget);
      expect(balTarget.toHexString()).to.be.eql(
        ethers.utils.hexStripZeros(Utils.UNIT_ETH.toHexString())
      );

      const emptyBalance = new ethers.utils.BigNumber(0);
      const balDelegate = await provider.getBalance(testDelegateProxy.address);
      expect(balDelegate.toHexString()).to.be.eql(
        ethers.utils.hexStripZeros(emptyBalance.toHexString())
      );
    });

    it("does not transfer the funds conditionally if false", async () => {
      const randomTarget = Utils.randomETHAddress();
      const tx = ct.interface.functions.executeSimpleConditionalTransaction.encode(
        [
          makeConditionParam(trueParam, falseParam),
          {
            value: [Utils.UNIT_ETH],
            assetType: 0,
            to: [randomTarget],
            token: ethers.constants.AddressZero,
            data: []
          }
        ]
      );

      await Utils.assertRejects(
        testDelegateProxy.functions.delegate(ct.address, tx)
      );

      const emptyBalance = new ethers.utils.BigNumber(0);
      const balTarget = await provider.getBalance(randomTarget);
      expect(balTarget.toHexString()).to.be.eql(
        ethers.utils.hexStripZeros(emptyBalance.toHexString())
      );

      const balDelegate = await provider.getBalance(testDelegateProxy.address);
      expect(balDelegate.toHexString()).to.be.eql(
        ethers.utils.hexStripZeros(Utils.UNIT_ETH.toHexString())
      );
    });
  });
});
