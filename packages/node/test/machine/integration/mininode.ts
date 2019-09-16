import { NetworkContext } from "@counterfactual/types";
import { JsonRpcProvider } from "ethers/providers";
import { SigningKey } from "ethers/utils";
import { HDNode } from "ethers/utils/hdnode";

import { EthereumCommitment } from "../../../src/ethereum/types";
import { Opcode, ProtocolRunner } from "../../../src/machine";
import { StateChannel } from "../../../src/models";

import { getRandomHDNodes } from "./random-signing-keys";

/// Returns a function that can be registered with IO_SEND{_AND_WAIT}
const makeSigner = (hdNode: HDNode) => {
  return async (args: [EthereumCommitment] | [EthereumCommitment, number]) => {
    if (args.length !== 1 && args.length !== 2) {
      throw Error("OP_SIGN middleware received wrong number of arguments.");
    }

    const [commitment, overrideKeyIndex] = args;
    const keyIndex = overrideKeyIndex || 0;

    const signingKey = new SigningKey(
      hdNode.derivePath(`${keyIndex}`).privateKey
    );

    return signingKey.signDigest(commitment.hashToSign());
  };
};

export class MiniNode {
  private readonly hdNode: HDNode;
  public readonly protocolRunner: ProtocolRunner;
  public scm: Map<string, StateChannel>;
  public readonly xpub: string;

  constructor(
    readonly networkContext: NetworkContext,
    readonly provider: JsonRpcProvider
  ) {
    [this.hdNode] = getRandomHDNodes(1);
    this.xpub = this.hdNode.neuter().extendedKey;
    this.scm = new Map<string, StateChannel>();
    this.protocolRunner = new ProtocolRunner(networkContext, provider);
    this.protocolRunner.register(Opcode.OP_SIGN, makeSigner(this.hdNode));
    this.protocolRunner.register(Opcode.WRITE_COMMITMENT, () => {});
    this.protocolRunner.register(Opcode.PERSIST_STATE_CHANNEL, () => {});
    this.protocolRunner.register(Opcode.IO_SEND_FIN, () => {});
    this.protocolRunner.register(Opcode.IO_WAIT, () => {});
  }

  public async dispatchMessage(message: any) {
    this.scm = await this.protocolRunner.runProtocolWithMessage(
      message,
      this.scm
    );
  }
}
