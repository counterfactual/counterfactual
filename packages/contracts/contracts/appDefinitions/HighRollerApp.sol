pragma solidity 0.4.25;
pragma experimental "ABIEncoderV2";

import "../lib/Transfer.sol";


contract HighRollerApp {

  enum ActionType {
    COMMIT_TO_HASH,
    COMMIT_TO_NUM,
    REVEAL
  }

  enum Stage {
    COMMITING_HASH, COMMITTING_NUM, REVEALING, DONE
  }

  enum Player {
    FIRST,
    SECOND,
    TIE // TODO How should we handle this? Doesn't make sense that it is a "Player"
  }

  struct AppState {
    address[2] playerAddrs;
    Stage stage;
    bytes32 commitHash;
    uint256 commitNum;
    uint256[2] playerFirstRoll; // TODO Does it make sense to store these in AppState?
    uint256[2] playerSecondRoll;
    Player winner;
  }

  struct Action {
    ActionType actionType;
    uint256 number;
    bytes32 actionHash;
  }

  function isStateTerminal(AppState state)
    public
    pure
    returns (bool)
  {
    return state.stage == Stage.DONE;
  }

  function getTurnTaker(AppState state)
    public
    pure
    returns (Player)
  {
    if (state.stage == Stage.COMMITTING_NUM) {
      return Player.SECOND;
    }
    return Player.FIRST;
  }

  function applyAction(AppState state, Action action)
    public
    pure
    returns (bytes)
  {
    AppState memory nextState = state;
    if (action.actionType == ActionType.COMMIT_TO_HASH) {
      require(state.stage == Stage.COMMITING_HASH, "Cannot apply COMMIT_TO_HASH on COMMITING_HASH");
      nextState.stage = Stage.COMMITTING_NUM;

      nextState.commitHash = action.actionHash;
    } else if (action.actionType == ActionType.COMMIT_TO_NUM) {
      require(state.stage == Stage.COMMITTING_NUM, "Cannot apply COMMITTING_NUM on COMMITTING_NUM");
      nextState.stage = Stage.REVEALING;

      nextState.commitNum = action.number;
    } else if (action.actionType == ActionType.REVEAL) {
      require(state.stage == Stage.REVEALING, "Cannot apply REVEAL on REVEALING");
      nextState.stage = Stage.DONE;

      bytes32 salt = action.actionHash;
      uint256 playerFirstNumber = action.number;
      uint256 playerSecondNumber = state.commitNum;


      if (keccak256(abi.encodePacked(salt, playerFirstNumber)) == state.commitHash) {
        bytes32 finalHash = calculateFinalHash(playerFirstNumber, playerSecondNumber);
        bytes8[4] dice = split32Hashto8(finalHash);
        /* 
          TODO Need to calculate keccak(firstNum * secondNum) and split that into 16 bytes for each player
          Then we need to split those 16 bytes for each player into 2 dice rolls for each player
          After this we need to check who the winner is according to the rolls and return that
          Along with the dice rolls for the UI
         */
        if (playerFirstNumber > playerSecondNumber) {
          nextState.winner = Player.FIRST;
        }
        else if(playerFirstNumber < playerSecondNumber) {
          nextState.winner = Player.SECOND;
        }
        else {
          nextState.winner = Player.TIE;
        }
      } 
      else {
        nextState.winner = Player.SECOND;
      }
    } else {
      revert("Invalid action type");
    }
    return abi.encode(nextState);
  }

  function resolve(AppState state, Transfer.Terms terms)
    public
    pure
    returns (Transfer.Transaction)
  {
    uint256[] memory amounts = new uint256[](1);
    amounts[0] = terms.limit;

    address[] memory to = new address[](1);
    uint256 player;

    // TODO Need to handle TIE winner state
    if (state.stage == Stage.DONE) {
      player = uint256(state.winner);
    } else {
      // The player who is not the turn taker
      player = 1 - uint256(getTurnTaker(state));
    }
    to[0] = state.playerAddrs[player];

    bytes[] memory data = new bytes[](2);

    return Transfer.Transaction(
      terms.assetType,
      terms.token,
      to,
      amounts,
      data
    );
  }

  function calculateFinalHash(uint256 num1, uint256 num2) 
    public
    pure
    returns (bytes32)
  {
    uint256 mult = num1 * num2;
    return keccak256(abi.encodePacked(mult));
  }

  function split32Hashto8(bytes32 finalHash) 
    public
    pure
    returns (bytes8 dice1, bytes8 dice2, bytes8 dice3, bytes8 dice4)
  {
    bytes32 mask1 = 0xffffffffffffffff000000000000000000000000000000000000000000000000;
    bytes32 mask2 = 0x0000000000000000ffffffffffffffff00000000000000000000000000000000;
    bytes32 mask3 = 0x00000000000000000000000000000000ffffffffffffffff0000000000000000;
    bytes32 mask4 = 0x000000000000000000000000000000000000000000000000ffffffffffffffff;
    bytes32 shifted2 = bytes32(uint256(finalHash & mask2) * 2 ** (4*16));
    bytes32 shifted3 = bytes32(uint256(finalHash & mask3) * 2 ** (4*32));
    bytes32 shifted4 = bytes32(uint256(finalHash & mask4) * 2 ** (4*48));
    dice1 = bytes8(finalHash & mask1);
    dice2 = bytes8(shifted2);
    dice3 = bytes8(shifted3);
    dice4 = bytes8(shifted4);
  }

  function bytes8toDiceRoll(bytes8 dice)
    public
    pure
    returns (uint)
  {
    return uint64(dice) % 6;
  }
}
