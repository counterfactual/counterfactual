import { computeAddress, SigningKey } from "ethers/utils";
import { fromExtendedKey } from "ethers/utils/hdnode";

/**
 * Helpful info:
 *
 * BIP-32 specified HD Wallets
 * BIP-39 specifies how to convert mnemonic to/from entropy and mnemonic to seed
 * BIP-43 specifies that the first field should be purpose (i.e. "m / purpose'")
 * BIP-44 specifies that if the purpose is 44, then the format is "m / purpose' / cointype' / account' / change / index"
 */

function sortAddresses(addrs: string[]) {
  return addrs.sort((a, b) => (parseInt(a, 16) < parseInt(b, 16) ? -1 : 1));
}

function sortSigningkeys(addrs: SigningKey[]) {
  return addrs.sort((a, b) =>
    parseInt(a.address, 16) < parseInt(b.address, 16) ? -1 : 1
  );
}

export function xkeyKthAddress(xpub: string, k: number) {
  return computeAddress(xkeyKthHDNode(xpub, k).publicKey);
}

export function xkeyKthHDNode(xpub: string, k: number) {
  return fromExtendedKey(xpub).derivePath(`${k}`);
}

export function xkeysToSortedKthAddresses(xpubs: string[], k: number) {
  return sortAddresses(xpubs.map(xpub => xkeyKthAddress(xpub, k)));
}

export function xkeysToSortedKthSigningKeys(xpubs: string[], k: number) {
  return sortSigningkeys(
    xpubs.map(xpub => new SigningKey(xkeyKthHDNode(xpub, k).privateKey))
  );
}
