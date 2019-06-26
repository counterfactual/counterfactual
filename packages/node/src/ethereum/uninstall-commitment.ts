import UninstallKeyRegistry from "@counterfactual/contracts/build/UninstallKeyRegistry.json";
import {
  AppIdentity,
  NetworkContext,
  SolidityABIEncoderV2Type
} from "@counterfactual/types";
import { defaultAbiCoder, Interface, keccak256 } from "ethers/utils";

import { MultiSendCommitment } from "./multisend-commitment";
import { MultisigOperation, MultisigTransaction } from "./types";
import { encodeFreeBalanceAppState } from "./utils/funds-bucket";
const uninstallKeyRegistryIface = new Interface(UninstallKeyRegistry.abi);

export class UninstallCommitment extends MultiSendCommitment {
  constructor(
    public readonly networkContext: NetworkContext,
    public readonly multisig: string,
    public readonly multisigOwners: string[],
    public readonly freeBalanceAppIdentity: AppIdentity,
    public readonly freeBalanceState: SolidityABIEncoderV2Type,
    public readonly freeBalanceversionNumber: number,
    public readonly freeBalanceTimeout: number,
    public readonly dependencyNonce: number
  ) {
    super(
      networkContext,
      multisig,
      multisigOwners,
      freeBalanceAppIdentity,
      // FIXME:
      // @ts-ignore
      keccak256(encodeFreeBalanceAppState(freeBalanceState)),
      freeBalanceversionNumber,
      freeBalanceTimeout
    );
  }

  public dependencyNonceInput(): MultisigTransaction {
    return {
      to: this.networkContext.UninstallKeyRegistry,
      value: 0,
      data: uninstallKeyRegistryIface.functions.setKeyAsUninstalled.encode([
        keccak256(defaultAbiCoder.encode(["uint256"], [this.dependencyNonce]))
      ]),
      operation: MultisigOperation.Call
    };
  }

  public eachMultisigInput() {
    return [this.freeBalanceInput(), this.dependencyNonceInput()];
  }
}
