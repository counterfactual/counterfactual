declare var ethers;

import { Component, Prop, State } from "@stencil/core";
import { RouterHistory } from "@stencil/router";

import CounterfactualTunnel from "../../data/counterfactual";

interface Player {
  address: string;
  name: string;
}

function matchmake(timeout: number) {
  return new Promise<Player>((resolve, reject) => {
    const opponent: Player = {
      address: "0x0101010101010101010101010101010101010101",
      name: "Alice"
    };
    return setTimeout(() => {
      return resolve(opponent);
    }, timeout);
  });
}

/**
 * User Story
 * Bob(Proposing) waits for Alice(Accepting) to install the game
 */
@Component({
  tag: "app-waiting",
  styleUrl: "app-waiting.scss",
  shadow: true
})
export class AppWaiting {
  @Prop() history: RouterHistory;

  @Prop({ mutable: true }) myName: string = "";
  @Prop({ mutable: true }) betAmount: string = "";
  @Prop({ mutable: true }) opponentName: string = "";
  @Prop() shouldMatchmake: boolean = false;
  @State() seconds: number = 5;

  /**
   * Bob(Proposing) enters waiting room.
   * Bob(Proposing) makes a call to Playground for matchmaking and waits to get an Accepting player.
   * Bob(Proposing) makes a call to CF.js proposeInstall.
   * Bob(Proposing) waits for Alice(Accepting) to approve -- Add Waiting Room (Waiting for Alice) --
   */
  componentWillLoad() {
    this.myName =
      this.history.location.state && this.history.location.state.myName
        ? this.history.location.state.myName
        : this.history.location.query && this.history.location.query.myName
        ? this.history.location.query.myName
        : this.myName;
    this.betAmount =
      this.history.location.state && this.history.location.state.betAmount
        ? this.history.location.state.betAmount
        : this.history.location.query && this.history.location.query.betAmount
        ? this.history.location.query.betAmount
        : this.betAmount;
    this.opponentName =
      this.history.location.state && this.history.location.state.opponentName
        ? this.history.location.state.opponentName
        : this.history.location.query &&
          this.history.location.query.opponentName
        ? this.history.location.query.opponentName
        : this.opponentName;
    if (
      this.history.location.state &&
      this.history.location.state.shouldMatchmake
    ) {
      this.countDown();
      matchmake(this.seconds * 1000).then(async (opponent: Player) => {
        this.installAndGoToGame(opponent);
      });
    } else {
      this.countDown();
      setTimeout(() => {
        this.goToGame(this.opponentName);
      }, this.seconds * 1000);
    }
  }

  countDown() {
    if (this.seconds === 1) {
      return;
    }
    setTimeout(() => {
      this.seconds = this.seconds - 1;
      this.countDown();
    }, 1000);
  }

  /**
   * Alice(Accepting) receives a notification that Bob(Proposing) has invited them to play High Roller
   * Alice(Accepting) approves the initiation. Playground calls CF.js install
   * Bob(Proposing) moves out of the waiting room and into the game
   */
  async installAndGoToGame(opponent: Player) {
    // const appFactory = new cf.AppFactory(
    //   // TODO: This probably should be in a configuration, somewhere.
    //   "0x1515151515151515151515151515151515151515",
    //   { actionEncoding: "uint256", stateEncoding: "uint256" },
    //   cfjs
    // );

    // await appFactory.proposeInstall({
    //   // TODO: This should be provided by the Playground.
    //   peerAddress: opponent.address,
    //   asset: {
    //     assetType: 0 /* AssetType.ETH */
    //   },
    //   // TODO: Do we assume the same bet for both parties?
    //   peerDeposit: ethers.utils.parseEther(this.betAmount),
    //   myDeposit: ethers.utils.parseEther(this.betAmount),
    //   // TODO: Check the timeout.
    //   timeout: 100,
    //   initialState: null
    // });
    this.goToGame(opponent.name);
  }

  goToGame(opponentName: string) {
    this.history.push({
      pathname: "/game",
      state: {
        opponentName,
        betAmount: this.betAmount,
        myName: this.myName
      },
      query: {},
      key: ""
    });
  }

  render() {
    return (
      <CounterfactualTunnel.Consumer>
        {({ nodeProvider, cfjs }) => (
          <div class="wrapper">
            <div class="waiting">
              <div class="message">
                <img
                  class="message__icon"
                  src="/assets/images/logo.svg"
                  alt="High Roller"
                />
                <h1 class="message__title">Waiting Room</h1>
                <p class="message__body">
                  Waiting for another player to join the game in
                </p>
                <p class="countdown">{this.seconds}</p>
                <p>
                  Player: {this.myName} <br />
                  Bet Amount: {this.betAmount} ETH
                </p>
              </div>
            </div>
          </div>
        )}
      </CounterfactualTunnel.Consumer>
    );
  }
}
