import { AppIdentity } from "@counterfactual/types";
import * as chai from "chai";
import { solidity } from "ethereum-waffle";
import { defaultAbiCoder, keccak256, solidityPack } from "ethers/utils";

export const expect = chai.use(solidity).expect;

// TS version of MChallengeRegistryCore::computeAppChallengeHash
export const computeAppChallengeHash = (
  id: string,
  appStateHash: string,
  versionNumber: number,
  timeout: number
) =>
  keccak256(
    solidityPack(
      ["bytes1", "bytes32", "uint256", "uint256", "bytes32"],
      ["0x19", id, versionNumber, timeout, appStateHash]
    )
  );

// TS version of MChallengeRegistryCore::computeActionHash
export const computeActionHash = (
  turnTaker: string,
  previousState: string,
  action: string,
  versionNumber: number
) =>
  keccak256(
    solidityPack(
      ["bytes1", "address", "bytes", "bytes", "uint256"],
      ["0x19", turnTaker, previousState, action, versionNumber]
    )
  );

export class AppInstance {
  get identityHash(): string {
    return this.hashOfEncoding();
  }

  get appIdentity(): AppIdentity {
    return {
      owner: this.owner,
      participants: this.participants,
      appDefinition: this.appDefinition,
      defaultTimeout: this.defaultTimeout
    };
  }

  constructor(
    readonly owner: string,
    readonly participants: string[],
    readonly appDefinition: string,
    readonly defaultTimeout: number
  ) {}

  // appIdentity
  public hashOfEncoding(): string {
    return keccak256(
      defaultAbiCoder.encode(
        [
          `tuple(
            address owner,
            address[] participants,
            address appDefinition,
            uint256 defaultTimeout
          )`
        ],
        [this.appIdentity]
      )
    );
  }
}
