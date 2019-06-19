import CounterfactualApp from "@counterfactual/contracts/build/CounterfactualApp.json";
import {
  NetworkContext,
  OutcomeType,
  TwoPartyFixedOutcome
} from "@counterfactual/types";
import { Contract } from "ethers";
import { Zero } from "ethers/constants";
import { BaseProvider } from "ethers/providers";
import { BigNumber, defaultAbiCoder } from "ethers/utils";

import { StateChannel } from "../../models";

function computeCoinTransferIncrement(outcome): [string, BigNumber] {
  const decoded = defaultAbiCoder.decode(["tuple(address,uint256)[]"], outcome);

  if (
    !(
      decoded.length === 1 &&
      decoded[0].length === 1 &&
      decoded[0][0].length === 2
    )
  ) {
    throw new Error("Outcome function returned unexpected shape");
  }
  const [[[address, to]]] = decoded;

  return [address, to];
}

export async function computeFreeBalanceIncrements(
  networkContext: NetworkContext,
  stateChannel: StateChannel,
  appInstanceId: string,
  provider: BaseProvider
): Promise<{ [x: string]: BigNumber }> {
  const appInstance = stateChannel.getAppInstance(appInstanceId);

  const appDefinition = new Contract(
    appInstance.appInterface.addr,
    CounterfactualApp.abi,
    provider
  );

  let outcome = await appDefinition.functions.computeOutcome(
    appInstance.encodedLatestState
  );

  // Temporary, better solution is to add outcomeType to AppInstance model
  let outcomeType: OutcomeType | undefined;
  if (typeof appInstance.coinTransferInterpreterParams !== "undefined") {
    outcomeType = OutcomeType.COIN_TRANSFER;
  } else if (
    typeof appInstance.twoPartyOutcomeInterpreterParams !== "undefined"
  ) {
    outcomeType = OutcomeType.TWO_PARTY_FIXED_OUTCOME;
  }

  switch (outcomeType) {
    case OutcomeType.COIN_TRANSFER: {
      // FIXME:
      // https://github.com/counterfactual/monorepo/issues/1371

      let attempts = 1;

      const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
      while (1) {
        outcome = await appDefinition.functions.computeOutcome(
          appInstance.encodedLatestState
        );

        const [address, to] = computeCoinTransferIncrement(outcome);

        if (to.gt(Zero)) {
          return { [address]: to };
        }

        attempts += 1;

        if (attempts === 10) {
          throw new Error("Failed to get a outcome after 10 attempts");
        }

        await wait(1000 * attempts);
      }
    }
    case OutcomeType.TWO_PARTY_FIXED_OUTCOME: {
      const [decoded] = defaultAbiCoder.decode(["uint256"], outcome);

      const total = appInstance.twoPartyOutcomeInterpreterParams!.amount;

      if (decoded.eq(TwoPartyFixedOutcome.SEND_TO_ADDR_ONE)) {
        return {
          [appInstance.twoPartyOutcomeInterpreterParams!.playerAddrs[0]]: total
        };
      }

      if (decoded.eq(TwoPartyFixedOutcome.SEND_TO_ADDR_TWO)) {
        return {
          [appInstance.twoPartyOutcomeInterpreterParams!.playerAddrs[1]]: total
        };
      }

      const i0 = total.div(2);
      const i1 = total.sub(i0);

      return {
        [appInstance.twoPartyOutcomeInterpreterParams!.playerAddrs[0]]: i0,
        [appInstance.twoPartyOutcomeInterpreterParams!.playerAddrs[1]]: i1
      };
    }
    default: {
      throw Error("unknown interpreter");
    }
  }
}
