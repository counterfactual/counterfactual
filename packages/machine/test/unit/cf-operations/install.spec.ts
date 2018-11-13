import * as cf from "@counterfactual/cf.js";
import { keccak256 } from "ethers/utils";

import { OpInstall } from "../../../src/middleware/protocol-operation";

import {
  ethContractCall,
  ethMultiSendCall,
  ethMultiSendSubCall,
  TEST_APP_INSTANCE,
  TEST_FREE_BALANCE,
  TEST_FREE_BALANCE_APP_INSTANCE,
  TEST_MULTISIG_ADDRESS,
  TEST_NETWORK_CONTEXT,
  TEST_SIGNING_KEYS,
  TEST_TERMS
} from "./fixture";

// const { keccak256 } = ethers.utils;

describe("OpInstall", () => {
  const TEST_NONCE_UNIQUE_ID = 1;
  let operation: OpInstall;

  beforeEach(() => {
    operation = new OpInstall(
      TEST_NETWORK_CONTEXT,
      TEST_MULTISIG_ADDRESS,
      TEST_APP_INSTANCE,
      TEST_FREE_BALANCE,
      new cf.utils.Nonce(true, TEST_NONCE_UNIQUE_ID, 0)
    );
  });

  // https://specs.counterfactual.com/04-setup-protocol#commitments
  it("Should be able to compute the correct tx to submit on-chain", () => {
    const digest = operation.hashToSign();
    const [sig1, sig2] = TEST_SIGNING_KEYS.map(key => key.signDigest(digest));

    const salt = keccak256(
      cf.utils.abi.encodePacked(["uint256"], [TEST_NONCE_UNIQUE_ID])
    );
    const uninstallKey = keccak256(
      cf.utils.abi.encodePacked(
        ["address", "uint256", "uint256"],
        [TEST_MULTISIG_ADDRESS, 0, salt]
      )
    );

    const { alice, bob, aliceBalance, bobBalance, localNonce, timeout } = TEST_FREE_BALANCE;
    const appStateHash = keccak256(
      cf.utils.abi.encode(
        ["address", "address", "uint256", "uint256"],
        [alice, bob, aliceBalance, bobBalance]
      )
    );

    // @ts-ignore
    const freeBalanceInput = ethMultiSendSubCall(
      "delegatecall",
      TEST_NETWORK_CONTEXT.registryAddr,
      0,
      "proxyCall(address,bytes32,bytes)",
      [
        TEST_NETWORK_CONTEXT.registryAddr,
        TEST_FREE_BALANCE_APP_INSTANCE.cfAddress(),
        ethContractCall(
          "setState(bytes32,uint256,uint256,bytes)",
          appStateHash,
          localNonce,
          timeout,
          "0x0"
        )
      ]
    );
    const { assetType, limit, token } = TEST_TERMS;
    // @ts-ignore
    const conditionalTransactionInput = ethMultiSendSubCall(
      "delegatecall",
      TEST_NETWORK_CONTEXT.conditionalTransactionAddr,
      0,
      "executeAppConditionalTransaction(address,address,bytes32,bytes32,tuple(uint8,uint256,address))",
      [
        TEST_NETWORK_CONTEXT.registryAddr,
        TEST_NETWORK_CONTEXT.nonceRegistryAddr,
        uninstallKey,
        TEST_APP_INSTANCE.cfAddress(),
        [assetType, limit, token]
      ]
    );
    const multiSend = ethMultiSendCall([
      freeBalanceInput,
      conditionalTransactionInput
    ]);
    const tx = operation.transaction([sig1, sig2]);
    expect(tx.to).toBe(TEST_MULTISIG_ADDRESS);
    expect(tx.value).toBe(0);
    expect(tx.data).toBe(
      ethContractCall(
        "execTransaction(address, uint256, bytes, uint8, bytes)",
        TEST_NETWORK_CONTEXT.multiSendAddr,
        0,
        multiSend,
        1,
        cf.utils.signaturesToBytes(sig1, sig2)
      )
    );
  });
});
