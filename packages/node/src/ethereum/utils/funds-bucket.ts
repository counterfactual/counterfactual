import { AppInterface } from "@counterfactual/types";
import { Zero } from "ethers/constants";
import { BigNumber, defaultAbiCoder } from "ethers/utils";

import {
  CoinBucketBalance,
  CoinBucketBalanceMap,
  convertCoinBucketFromMap,
  convertCoinBucketToMap,
  FreeBalanceState
} from "../../models/free-balance";

const coinBucketsStateEncoding = `
  tuple(
    address[] tokens,
    tuple(
      address to,
      uint256 amount
    )[][] balances
  )
`;

export function getCoinBucketAppInterface(addr: string): AppInterface {
  return {
    addr,
    stateEncoding: coinBucketsStateEncoding,
    actionEncoding: undefined // because no actions exist for CoinBucket
  };
}

export function encodeFreeBalanceAppState(state: FreeBalanceState) {
  return defaultAbiCoder.encode([coinBucketsStateEncoding], [state]);
}

/**
 * Returns a mapping with all values negated
 */
export function flip(a: { [s: string]: BigNumber }) {
  const ret = {};
  for (const key of Object.keys(a)) {
    ret[key] = Zero.sub(a[key]);
  }
  return ret;
}

/**
 * Returns the first base mapping, but incremented by values specified in the
 * second increment
 * Passing increments whose keys are not present in the base is an error.
 * Keys in the base mapping which are not explicitly incremented are returned
 * unchanged.
 */
export function merge(
  base: CoinBucketBalance[],
  increments: CoinBucketBalanceMap
): CoinBucketBalance[] {
  const baseMap = convertCoinBucketToMap(base);
  const ret = {} as CoinBucketBalanceMap;
  for (const key of Object.keys(baseMap)) {
    if (increments[key]) {
      ret[key] = baseMap[key].add(increments[key]);
      if (ret[key].lt(Zero)) {
        throw new Error("Underflow in merge");
      }
    } else {
      ret[key] = baseMap[key];
    }
  }
  for (const key of Object.keys(increments)) {
    if (!baseMap[key]) {
      throw Error(`mismatch ${Object.keys(base)} ${Object.keys(increments)}`);
    }
  }
  return convertCoinBucketFromMap(ret);
}
