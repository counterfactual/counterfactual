import { ethers } from "ethers";

const { defaultAbiCoder, hexDataLength, hexDataSlice } = ethers.utils;

/**
 * A decoder for decoding the arguments passed to a MultiSend::multiSend.
 *
 * Note that this code was adapted to mimic the following Solidity code:
 *
 * ```solidity
 * function multiSend(bytes transactions) public
 * {
 *   assembly {
 *     let length := mload(transactions)
 *     let i := 0x20
 *     for { } lt(i, length) { } {
 *       let operation := mload(add(transactions, i))
 *       let to := mload(add(transactions, add(i, 0x20)))
 *       let value := mload(add(transactions, add(i, 0x40)))
 *       let dataLength := mload(add(transactions, add(i, 0x80)))
 *       let data := add(transactions, add(i, 0xa0))
 *       i := add(i, add(0xa0, mul(div(add(dataLength, 0x1f), 0x20), 0x20)))
 *     }
 *   }
 * }
 * ```
 *
 * @param txs A string representing the bytes array of encoded tuples like
 *            tuple(uint, address, uint, bytes); each representing a transaction
 *            for a Multisignature Wallet to execute. Equivalent to the `transactions`
 *            argument to the `multiSend` function in the Solidity code.
 *
 * @returns An array of [op, to, val, data] javascript arrays.
 */
export function decodeMultisendCalldata(txs: string) {
  const ret: [number, string, number, string][] = [];

  let i = 0;

  while (i < hexDataLength(txs)) {
    // We expect 0x80 to be a hard-coded pointer to the `data` location. Refer to
    // https://solidity.readthedocs.io/en/v0.5.0/abi-spec.html for ABI specification
    const ptr = hexDataSlice(txs, i + 0x60, i + 0x80);
    if (parseInt(ptr, 16) !== 0x80) {
      throw Error(
        `Incorrectly encoded transactions. Expected ${ptr} to be hard-coded as 0x80`
      );
    }

    // let operation := mload(add(transactions, i))
    const op = hexDataSlice(txs, i, i + 0x20);

    // let to := mload(add(transactions, add(i, 0x20)))
    const to = hexDataSlice(txs, i + 0x20, i + 0x40);

    // let value := mload(add(transactions, add(i, 0x40)))
    const value = hexDataSlice(txs, i + 0x40, i + 0x60);

    // let dataLength := mload(add(transactions, add(i, 0x80)))
    const dataLength = parseInt(hexDataSlice(txs, i + 0x80, i + 0xa0), 16);

    // let data := add(transactions, add(i, 0xa0))
    const data = hexDataSlice(txs, i + 0xa0, i + 0xa0 + dataLength);

    ret.push([
      defaultAbiCoder.decode(["uint8"], op)[0],
      defaultAbiCoder.decode(["address"], to)[0],
      defaultAbiCoder.decode(["uint256"], value)[0],
      data
    ]);

    // i := add(i, add(0xa0, mul(div(add(dataLength, 0x1f), 0x20), 0x20)))
    i += 0xa0 + Math.ceil(dataLength / 0x20) * 0x20;
  }

  return ret;
}
