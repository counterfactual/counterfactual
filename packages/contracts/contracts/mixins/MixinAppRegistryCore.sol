pragma solidity ^0.4.25;
pragma experimental "ABIEncoderV2";

import "../libs/LibStateChannelApp.sol";
import "../libs/Transfer.sol";

import "./MAppRegistryCore.sol";


/// @title MixinAppRegistryCore
/// @author Liam Horne - <liam@l4v.io>
/// @notice Core functionality and utilities for the AppRegistry
contract MixinAppRegistryCore is MAppRegistryCore {

  /// @notice A getter function for the current AppChallenge state
  /// @param _id The unique hash of an `AppIdentity`
  /// @return A `AppChallenge` object representing the state of the on-chain challenge
  function getAppChallenge(bytes32 _id)
    external
    view
    returns (LibStateChannelApp.AppChallenge)
  {
    return appStates[_id];
  }

  // TODO:
  function isStateFinalized(bytes32 _id)
    external
    view
    returns (bool)
  {
    return (
      appStates[_id].status == LibStateChannelApp.AppStatus.OFF ||
      (
        appStates[_id].status == LibStateChannelApp.AppStatus.DISPUTE &&
        appStates[_id].finalizesAt <= block.number
      )
    );
  }

  /// @notice A getter function for the resolution if one is set
  /// @param _id The unique hash of an `AppIdentity`
  /// @return A `Transfer.Transaction` object representing the resolution of the channel
  function getResolution(bytes32 _id)
    external
    view
    returns (Transfer.Transaction)
  {
    return appResolutions[_id];
  }

}
