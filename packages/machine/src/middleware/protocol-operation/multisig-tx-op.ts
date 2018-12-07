import { utils } from "@counterfactual/cf.js";
import { ethers } from "ethers";

import MinimumViableMultisig from "@counterfactual/contracts/build/contracts/MinimumViableMultisig.json";

import { MultisigInput, ProtocolOperation, Transaction } from "./types";

const { keccak256, defaultAbiCoder, Interface } = ethers.utils;

export abstract class MultisigTxOp extends ProtocolOperation {
  abstract multisigInput(): MultisigInput;

  constructor(readonly multisig: string, readonly multisigOwners: string[]) {
    super();
  }

  public transaction(sigs: ethers.utils.Signature[]): Transaction {
    const multisigInput = this.multisigInput();

    const signatureBytes = utils.signaturesToSortedBytes(
      this.hashToSign(),
      ...sigs
    );

    const txData = new Interface(
      MinimumViableMultisig.abi
    ).functions.execTransaction.encode([
      multisigInput.to,
      multisigInput.val,
      multisigInput.data,
      multisigInput.op,
      signatureBytes
    ]);

    // TODO: Deterministically compute `to` address
    return new Transaction(this.multisig, 0, txData);
  }

  public hashToSign(): string {
    const multisigInput = this.multisigInput();
    return keccak256(
      defaultAbiCoder.encode(
        ["bytes1", "address[]", "address", "uint256", "bytes", "uint8"],
        [
          "0x19",
          this.multisigOwners,
          multisigInput.to,
          multisigInput.val,
          multisigInput.data,
          multisigInput.op
        ]
      )
    );
  }
}
