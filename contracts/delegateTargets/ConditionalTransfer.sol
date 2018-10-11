pragma solidity 0.4.24;
pragma experimental "ABIEncoderV2";

import "../lib/Transfer.sol";
import "../Conditional.sol";
import "../Registry.sol";
import "../NonceRegistry.sol";
import "../AppInstance.sol";


/// @title ConditionalTransfer - A conditional transfer contract
/// @author Liam Horne - <liam@l4v.io>
/// @author Mitchell Van Der Hoeff - <mitchell@l4v.io>
/// @notice Supports a complex transfer of funds contingent on some condition.
contract ConditionalTransfer is Conditional {

  using Transfer for Transfer.Transaction;

  function executeSimpleConditionalTransfer(
    Condition condition,
    Transfer.Transaction memory txn
  )
    public
  {
    require(Conditional.isSatisfied(condition));
    txn.execute();
  }

  /// @notice Execute a fund transfer for a state channel app in a finalized state
  /// @param uninstallKey The key of the uninstallation lock dependency nonce in the nonce registry
  /// @param expectedNonce The expected nonce in the nonce registry
  /// @param appCfAddress Counterfactual address of the app contract
  /// @param terms The pre-agreed upon terms of the funds transfer
  function executeAppConditionalTransfer(
    address registry,
    address nonceRegistry,
    bytes32 uninstallKey,
    bytes32 rootNonceKey,
    uint256 rootNonceExpectedValue,
    bytes32 appCfAddress,
    Transfer.Terms terms
  )
    public
  {
    require(
      !NonceRegistry(nonceRegistry).isFinalized(uninstallKey, 1),
      "App has been uninstalled"
    );

    require(
      NonceRegistry(nonceRegistry).isFinalized(rootNonceKey, rootNonceExpectedValue),
      "Root nonce not finalized or finalized at an incorrect value"
    );

    address appAddr = Registry(registry).resolver(appCfAddress);
    AppInstance app = AppInstance(appAddr);
    Transfer.Transaction memory txn = app.getResolution();

    require(
      Transfer.meetsTerms(txn, terms),
      "Transfer details do not meet terms"
    );

    txn.execute();
  }

}
