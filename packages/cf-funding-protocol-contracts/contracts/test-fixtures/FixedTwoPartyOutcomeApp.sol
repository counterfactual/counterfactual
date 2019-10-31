pragma solidity 0.5.12;
pragma experimental "ABIEncoderV2";

import "../libs/LibOutcome.sol";


contract TwoPartyFixedOutcomeApp {

  function computeOutcome(bytes memory)
    public
    pure
    returns (bytes memory)
  {
    return abi.encode(
      LibOutcome.TwoPartyFixedOutcome.SPLIT_AND_SEND_TO_BOTH_ADDRS
    );
  }

}
