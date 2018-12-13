import { AppIdentity, AppInterface, Terms } from "@counterfactual/types";
import { defaultAbiCoder, keccak256 } from "ethers/utils";
import { Memoize } from "typescript-memoize";

import { appIdentityToHash } from "../ethereum/utils/app-identity";
import { APP_INTERFACE, TERMS } from "../ethereum/utils/encodings";

/**
 * Represenation of the values a dependency nonce can take on.
 */
export enum DependencyValue {
  NOT_UNINSTALLED = 0,
  UNINSTALLED = 1
}

export type AppInstanceJson = {
  multisigAddress: string;
  signingKeys: string[];
  defaultTimeout: number;
  interface: AppInterface;
  terms: Terms;
  isMetachannelApp: boolean;
  dependencyReferenceNonce: number;
  latestState: object;
  latestNonce: number;
  latestTimeout: number;
  dependencyValue: DependencyValue;
};

/**
 * Representation of an AppInstance.
 *
 * @property owner The address of the multisignature wallet on-chain for the
 *           state channel that hold the state this AppInstance controls.

 * @property signingKeys The sorted array of public keys used by the users of
 *           this AppInstance for which n-of-n consensus is needed on updates.

 * @property defaultTimeout The default timeout used when a new update is made.

 * @property interface An AppInterface object representing the logic this
 *           AppInstance relies on for verifying and proposing state updates.

 * @property isMetachannelApp A flag indicating whether this AppInstance's state
 *           deposits are within a metachannel or in a single on-chain deposit.

 * @property terms The terms for which this AppInstance is based on.

 * @property latestState The unencoded representation of the latest state.

 * @property latestNonce The nonce of the latest signed state update.

 * @property latestTimeout The timeout used in the latest signed state update.
 */
// TODO: dont forget dependnecy nonce docstring
export class AppInstance {
  public dependencyValue: DependencyValue;

  constructor(
    public readonly multisigAddress: string,
    public readonly signingKeys: string[],
    public readonly defaultTimeout: number,
    // @ts-ignore
    public readonly interface: AppInterface,
    public readonly terms: Terms,
    public readonly isMetachannelApp: boolean,
    public readonly dependencyReferenceNonce: number,
    public latestState: object,
    public latestNonce: number,
    public latestTimeout: number
  ) {
    // Set the value of the uninstall key to 0 on construction
    this.dependencyValue = DependencyValue.NOT_UNINSTALLED;
  }

  public static fromJson(json: AppInstanceJson) {
    const ret = new AppInstance(
      json.multisigAddress,
      json.signingKeys,
      json.defaultTimeout,
      json.interface,
      json.terms,
      json.isMetachannelApp,
      json.dependencyReferenceNonce,
      json.latestState,
      json.latestNonce,
      json.latestTimeout
    );
    ret.dependencyValue = json.dependencyValue;
    return ret;
  }

  @Memoize()
  public get id(): string {
    return appIdentityToHash(this.identity);
  }

  @Memoize()
  public get identity(): AppIdentity {
    const iface = defaultAbiCoder.encode([APP_INTERFACE], [this.interface]);
    const terms = defaultAbiCoder.encode([TERMS], [this.terms]);
    return {
      owner: this.multisigAddress,
      signingKeys: this.signingKeys,
      appInterfaceHash: keccak256(iface),
      termsHash: keccak256(terms),
      defaultTimeout: this.defaultTimeout
    };
  }

  @Memoize()
  public get hashOfLatestState(): string {
    return keccak256(
      defaultAbiCoder.encode([this.interface.stateEncoding], [this.latestState])
    );
  }

  public set state(newState: object) {
    // TODO: I think this code could be written cleaner by checking for
    //       ethers.errors.INVALID_ARGUMENT specifically in catch {}
    try {
      defaultAbiCoder.encode([this.interface.stateEncoding], [newState]);
    } catch (e) {
      console.error(
        "Attempted to setState on an app with an invalid state object"
      );
      throw e;
    }

    this.latestState = newState;
    this.latestNonce += 1;
  }
}
