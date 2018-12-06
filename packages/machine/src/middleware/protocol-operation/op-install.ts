import StateChannelTransaction from "@counterfactual/contracts/build/contracts/StateChannelTransaction.json";
import { AppIdentity, Terms } from "@counterfactual/types";
import { ethers } from "ethers";

import { APP_IDENTITY } from "../../encodings";

import { MultiSendOp } from "./multi-send-op";
import { MultisigInput, Operation } from "./types";

const { keccak256, solidityPack, defaultAbiCoder } = ethers.utils;

export class OpInstall extends MultiSendOp {
  constructor(
    readonly networkContext: any,
    readonly multisig: string,
    readonly multisigOwners: string[],
    readonly appIdentity: AppIdentity,
    readonly terms: Terms,
    readonly freeBalanceAppIdentity: AppIdentity,
    readonly freeBalanceTerms: Terms,
    readonly freeBalanceStateHash: string,
    readonly freeBalanceNonce: number,
    readonly freeBalanceTimeout: number,
    readonly dependencyNonceSalt: string,
    readonly dependencyNonceValue: number
  ) {
    super(
      networkContext,
      multisig,
      multisigOwners,
      freeBalanceAppIdentity,
      freeBalanceTerms,
      freeBalanceStateHash,
      freeBalanceNonce,
      freeBalanceTimeout,
      dependencyNonceSalt,
      dependencyNonceValue
    );
  }

  public eachMultisigInput(): MultisigInput[] {
    return [this.freeBalanceInput(), this.conditionalTransactionInput()];
  }

  private conditionalTransactionInput(): MultisigInput {
    const to = this.networkContext.StateChannelTransaction;

    const val = 0;

    const uninstallKey = keccak256(
      solidityPack(
        ["address", "uint256", "uint256"],
        [this.multisig, 0, this.dependencyNonceSalt]
      )
    );

    const data = new ethers.utils.Interface(
      StateChannelTransaction.abi
    ).functions.executeAppConditionalTransaction.encode([
      this.networkContext.AppRegistry,
      this.networkContext.NonceRegistry,
      uninstallKey,
      this.appCfAddress,
      this.terms
    ]);

    const op = Operation.Delegatecall;

    return new MultisigInput(to, val, data, op);
  }

  get appCfAddress(): string {
    return keccak256(
      defaultAbiCoder.encode([APP_IDENTITY], [this.appIdentity])
    );
  }
}
