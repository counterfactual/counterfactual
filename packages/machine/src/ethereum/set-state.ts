import { Interface, keccak256, Signature, solidityPack } from "ethers/utils";

import AppRegistry from "@counterfactual/contracts/build/contracts/AppRegistry.json";
import {
  AppIdentity,
  NetworkContext,
  SignedStateHashUpdate
} from "@counterfactual/types";

import { appIdentityToHash } from "./utils/app-identity";
import { signaturesToSortedBytes } from "./utils/signature";
import { EthereumCommitment, Transaction } from "./utils/types";

const iface = new Interface(AppRegistry.abi);

export class SetStateCommitment extends EthereumCommitment {
  constructor(
    public readonly networkContext: NetworkContext,
    public readonly appIdentity: AppIdentity,
    public readonly appState: string,
    public readonly appLocalNonce: number,
    public readonly timeout: number
  ) {
    super();
  }

  public hashToSign(): string {
    return keccak256(
      solidityPack(
        ["bytes1", "bytes32", "uint256", "uint256", "bytes32"],
        [
          "0x19",
          appIdentityToHash(this.appIdentity),
          this.appLocalNonce,
          this.timeout,
          keccak256(this.appState)
        ]
      )
    );
  }

  public transaction(sigs: Signature[]): Transaction {
    return {
      to: this.networkContext.AppRegistry,
      value: 0,
      data: iface.functions.setState.encode([
        this.appIdentity,
        this.getSignedStateHashUpdate(sigs)
      ])
    };
  }

  private getSignedStateHashUpdate(
    signatures: Signature[]
  ): SignedStateHashUpdate {
    return {
      stateHash: keccak256(this.appState),
      nonce: this.appLocalNonce,
      timeout: this.timeout,
      signatures: signaturesToSortedBytes(this.hashToSign(), ...signatures)
    };
  }
}
