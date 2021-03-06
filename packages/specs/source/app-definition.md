# State Channel Applications

When we discuss building off-chain applications in general, we usually reference easy-to-understand examples such as payment channels, turn-based games like Tic-Tac-Toe, or well understood blockchain use cases like mixers. For each of these examples, we attempt to isolate their core functionality inside of a single logical container. We call these containers **Apps**. Apps have the following properties at a minimum:

- The number of participants / users supported
- An encoding type for its state
- An function that returns an outcome from a state

The most basic type of App is a 2-person ETH payment channel. In that case we have:

- Alice and Bob as the users
- An encoding type of `tuple(address aliceAddr, address bobAddr, uint256 aBal, uint256 bBal)`[†](#faq)
- The outcome function sends `aBal` Wei to `aliceAddr` and sends `bBal` Wei to `bobAddr`

A slightly more complicated example would be a Tic-Tac-Toe game:

- Alice and Bob are the users, Alice is X and Bob is O
- An encoding type of `tuple(uint8[9] board, address playerX, address playerO)`
- Sends `playerX` the maximimum amount if X won, or `playerO` if O won, or splits the amount in half if a draw

There is, of course, an important difference in the example of a Tic-Tac-Toe game though. That difference is that in the Tic-Tac-Toe game, the final outcome of the state of the application is not always defined given only the current state of the application. In the payment channel example, if one user were to become unresponsive it is easy to see how the outcome would play out; Alice would receive `aBal` and Bob would receive `bBal`. In Tic-Tac-Toe, however, if the game is not finished yet, there are some moves left to be made to reach a "terminal" state which can then be used to reach an outcome. Terminal states comprise those in which X wins, O wins, or there is a draw.

To express this important difference we introduce some additional functionality that can be implemented for a state channels based application:

- A function which defines how state can "progress" given an action
- A function to define whether an action can be legally taken by a participant
- A function to determine is a state is indeed one that could be considered "terminal"

For Tic-Tac-Toe then these can be expressed as:

- Allowed actions are to place an X on the board or place an O on the board
- `playerX` may place an X if it is X's turn based on the `board` state (and vice versa)
- The state is "terminal" if there are 3 in a row of X's or O's on the board or the board is full

In the next sections, we define how in Counterfactual we define application state, progress it, and use it to arrive at outcomes.

## Defining State

A state channel is fundamentally about progressing a single state object. Therefore, in the Counterfactual framework, we center everything around a single `bytes` object. For the sake of performing computation on this object (e.g., evaluating if there is a row of X's on a Tic-Tac-Toe board) we interpret it as an ABI-encoded value of a specific type using the built-in `ABIEncoderV2` language feature. THIS allows developers to define their state structures using a `struct` definition and encode and decode these objects as needed. For example, in our payment channel from above we might have the following object:

```solidity
struct ETHPaymentChannelState {
  address alice;
  address bob;
  uint256 aBal;
  uint256 bBal;
}
```

## Progressing State

As has been mentioned before, some kinds of applications require a way of progressing some state to a "terminal" state through a series of allowed actions. In these cases, we adopt the model of a state machine that consists of logical states and allowed actions (transitions between states); a "terminal" state is simply one from which there does not exist any outgoing edge (i.e., an "allowed action").

In Counterfactual, if an action wishes to allow its state to be unilaterally progressable, we require the definition of a function that **applies an action to a state to produce a new state** _in addition to_ **a function that determines if an action can be taken by a particular turn taker**. As you will see in the [adjudication layer](./adjudication-layer.md) section of these specifications, these functions are important in handling on-chain challenge scenarios.

The ultimate purpose of these functions is to ensure the following:

- It should always be extremely explicit what the exact rules of the state channel application that all parties are abiding by are
- There should always be a single logical turn taker for any given state ([concurrent state updates](#concurrent-state-updates) are disallowed)
- It should be possible, in the least number of on-chain transactions, use the adjudication layer to fairly arrive at an outcome for a state channel application (without unnecessary gas expenditure)

Here is a helpful diagram for visualizing the nature of such an `applyAction` function:

![](img/applyAction.svg)

## Resolving State

A state channel application defines a outcome. This is a critical concept usually because the outcome can be tied to interesting economic parameters that create the incentives for the behaviour of users in the application to begin with. For example, users will remain online and play a game of Tic-Tac-Toe because they know the rules of the game are deciding who will take home some financial reward. In the Counterfactual framework, this reward is defined in terms of an internal transaction that is executed by the multisignature wallet that is the holder of the state deposits.

## AppDefinition

To address all of the above requirements of state channel applications, we introduce an interface called an `AppDefinition` which **implements the logic of an application in the EVM**. The `AppDefinition` interface is implemented by a developer interested in writing a state channels based application that the Counterfactual project supports in the rest of the framework (e.g., in the [adjudication layer](./adjudication-layer.md)).

### Outcome Function

  There is a single function which _must_ be implemented in the interface. This function provides the outcome functionality discussed above. The function signature is:

```solidity
function computeOutcome(bytes memory) public view returns (bytes);
```

The first argument of type `bytes memory` is an internally-referencable state object for the `AppDefinition`. For example, in the case of a payment channel it must be considered as the ABI-encoded version of a structure encoding the type from above. This means that you will want to use `abi.decode` inside of the `computeOutcome` method to decode the bytes into a usable struct object. In our payment channel example this would look like:

```solidity
function computeOutcome(bytes memory encodedState)
  public
  view
  returns (bytes)
{
  AppState state = abi.decode(encodedState, (ETHPaymentChannelState));
  // state.aBal, state.bBal, state.alice, state.bob
}
```

### Outcome Type

What should be returned from the `computeOutcome` function depends on the **outcome type** of the app definition. A outcome type defines the possible outcomes of the app instance and what effects are compatible with it. For instance, a two-player chess game has "categorical" outcomes of win/loss/draw, whereas a two-player poker game with 2 ETH total pot has "continuous" outcomes where the first player may be allocated any amount from 0 to 2 ETH. The different nature of the applications mean that a state deposit of ERC721 non-fungible tokens can be used with chess but not with poker.

In the framework, the following outcome types are currently defined.

- TwoPlayerOutcome: the app results in an outcome of a win, a loss, or a draw. This is represented as the abi encoding of a `uint256`.
- CoinTransfer: the app arrives in an outcome of a dynamically-sized mapping of address to amount in Wei. This is represenetd as the abi encoding of `tuple(address, uint)[]`.

### Optional Functionality

In addition to the mandatory `computeOutcome` method, the `AppDefinition` interface optionally allows for the definition of the following methods.

### Turn Taking Function

To identify who is uniquely allowed to progress from one state to the next, a turn taking function can be implemented which returns the specific address that is expected to have signed a particular state update. It accepts two arguments: the state of the application and the array of all participants that have been allocated to the application. Therefore, the function must return the key in the array of participants that it expects to sign an update.

```solidity
function getTurnTaker(bytes memory, address[] memory) public pure returns (address);
```

In our Tic-Tac-Toe example, this function would return the 0th-indexed key for player X and the key at index 1 for player O.

### Terminal State Flag Function

As an efficiency gain in cases where the adjudication layer is needed, a function can be defined which declares whether or not a state can no longer be progressed. This function takes a single argument: the state of the application. It is expected to return `true` if the state is terminal or `false` if it is not.

```solidity
function isStateTerminal(bytes memory) public pure returns (bool);
```

In Tic-Tac-Toe, the state is terminal if the game has been won or the board is full.

### Action Application Function

Finally, the most critical function for progressing state is the `applyAction` function which as described above takes some encoded state and an encoded action and returns a new encoded state object. The [encoding and decoding](#abiencoderv2) functionality provided in Solidity are helpful here.

```solidity
function applyAction(bytes memory, bytes memory) public pure returns (bytes memory);
```

In Tic-Tac-Toe, this function would place the X or the O on the board based on the action type if the position on the board is not already filled.

## Footnotes

### ABIEncoderV2

We use [`ABIEncoderV2`](https://medium.com/@dillonsvincent/solidity-enable-experimental-abiencoderv2-to-use-a-struct-as-function-parameter-27979603a879) in the framework to represent arbitrary EVM-compatible state

There are helpful functions that are offered in Solidity which can be used for encoding and decoding.

Encoding:

```solidity
ExampleStruct state = ExampleStruct(...);
bytes encodedState = abi.encode(state);
```

Decoding:

```solidity
bytes encodedState; // 0x.....
ExampleStruct state = abi.decode(encodedState, (ExampleStruct));
```

### Concurrent State Updates

Presently in Conterfactual progressable state machines must be uniquely progressable by a single turn taker and must move one turn at a time. The reason for this requirement is that if two or more users were able to progress the state of an application independently, it is possible that they may enter into a conflicting state.

As an example of this, consider an application where two users can move the the (x, y) co-ordinates of two pieces on a 10x10 grid; each can move one but not the other. In this example, it is possible that if they were able to move their pieces concurrently they could enter into a state where two pieces are in the same (x, y) co-ordinate which may be disallowed in the logic of the application. In that case a race condition occurs where whoever is able to submit their transaction to the blockchain first would be able to consider their state as final and the other would be disallowed. Of course, this is a kind of behaviour we want to avoid when designing state channel applications.

There are scenarios, however, where you _want_ concurrent updates and it is indeed possible to allow them. The general class of data structures that represent these types of data structures are called [conflict-free replicated data types](https://medium.com/@amberovsky/crdt-conflict-free-replicated-data-types-b4bfc8459d26) (CRDTs) and are commonly used in distributed systems.

In a future version of the `AppDefinition` interface, we hope to support a version of these kinds of objects such that concurrent state updates might be possible.
