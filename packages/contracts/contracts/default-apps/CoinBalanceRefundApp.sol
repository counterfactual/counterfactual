pragma solidity 0.5.9;
pragma experimental "ABIEncoderV2";

import "../libs/LibOutcome.sol";


contract CoinBalanceRefundApp {

  struct AppState {
    address recipient;
    address multisig;
    uint256 threshold;
    address token;
  }

  function computeOutcome(bytes calldata encodedState)
    external
    view
    returns (bytes memory)
  {
    AppState memory appState = abi.decode(encodedState, (AppState));

    LibOutcome.CoinTransfer[] memory ret = new LibOutcome.CoinTransfer[](1);

    if (appState.token == address(0x0)) {
      ret[0].amount = address(appState.multisig).balance - appState.threshold;
    } else {
      // solium-disable-next-line max-len
      ret[0].amount = ERC20(appState.token).balanceOf(appState.multisig) - appState.threshold;
    }
    ret[0].to = appState.recipient;
    ret[0].coinAddress = appState.token;

    return abi.encode(ret);
  }

}
