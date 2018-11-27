import * as cf from "@counterfactual/cf.js";
import { ethers } from "ethers";
 import {
  UNUSED_FUNDED_ACCOUNT
} from "../../utils/environment";

import { TestResponseSink } from "../test-response-sink";

export class TicTacToeSimulator {
  public static async simulatePlayingGame(
    peerA: TestResponseSink,
    peerB: TestResponseSink
  ) {
    const cfAddr = await TicTacToeSimulator.installTtt(peerA, peerB);
    await TicTacToeSimulator.makeMoves(peerA, peerB, cfAddr);
    await TicTacToeSimulator.uninstall(peerA, peerB, cfAddr);
    return cfAddr;
  }

  public static async installTtt(
    peerA: TestResponseSink,
    peerB: TestResponseSink
  ) {
    const msg = TicTacToeSimulator.installMsg(
      peerA.signingKey.address!,
      peerB.signingKey.address!
    );
    const response = await peerA.runProtocol(msg);
    expect(response.status).toEqual(cf.legacy.node.ResponseStatus.COMPLETED);
    return TicTacToeSimulator.validateInstall(peerA, peerB);
  }

  public static installMsg(
    to: string,
    from: string
  ): cf.legacy.node.ClientActionMessage {
    let peerA = from;
    let peerB = to;
    if (peerB.localeCompare(peerA) < 0) {
      const tmp = peerA;
      peerA = peerB;
      peerB = tmp;
    }
    const terms = new cf.legacy.app.Terms(
      0,
      new ethers.utils.BigNumber(10),
      ethers.constants.AddressZero
    ); // TODO:
    const app = new cf.legacy.app.AppInterface(
      "0x0",
      "0x11111111",
      "0x11111111",
      "0x11111111",
      "0x11111111",
      ""
    ); // TODO:
    const timeout = 100;
    const installData: cf.legacy.app.InstallData = {
      terms,
      app,
      timeout,
      peerA: new cf.legacy.utils.PeerBalance(peerA, 2),
      peerB: new cf.legacy.utils.PeerBalance(peerB, 2),
      keyA: peerA,
      keyB: peerB,
      encodedAppState: "0x1234"
    };
    return {
      requestId: "5",
      appId: "",
      action: cf.legacy.node.ActionName.INSTALL,
      data: installData,
      multisigAddress: UNUSED_FUNDED_ACCOUNT,
      toAddress: to,
      fromAddress: from,
      seq: 0
    };
  }

  public static async validateInstall(
    peerA: TestResponseSink,
    peerB: TestResponseSink
  ): Promise<string> {
    await cf.legacy.utils.sleep(50);
    const stateChannel =
      peerA.instructionExecutor.node.channelStates[UNUSED_FUNDED_ACCOUNT];
    const appInstances = stateChannel.appInstances;
    const cfAddrs = Object.keys(appInstances);
    expect(cfAddrs.length).toEqual(1);

    // first validate the app
    const cfAddr = cfAddrs[0];
    expect(appInstances[cfAddr].peerA.balance.toNumber()).toEqual(2);
    expect(appInstances[cfAddr].peerB.balance.toNumber()).toEqual(2);

    TicTacToeSimulator.validateInstallFreeBalance(
      peerA.instructionExecutor.node.channelStates[UNUSED_FUNDED_ACCOUNT].freeBalance,
      peerA,
      peerB
    );
    TicTacToeSimulator.validateInstallFreeBalance(
      peerB.instructionExecutor.node.channelStates[UNUSED_FUNDED_ACCOUNT].freeBalance,
      peerA,
      peerB
    )

    return cfAddr;
  }

  public static validateInstallFreeBalance(
    freeBalance: cf.legacy.utils.FreeBalance,
    peerA: TestResponseSink,
    peerB: TestResponseSink
  ) {
    // start with 10, 5 and both parties deposit 2 into TicTacToeSimulator.
    expect(
      freeBalance.balanceOfAddress(peerA.signingKey.address).toNumber()
    ).toEqual(8);
    expect(
      freeBalance.balanceOfAddress(peerB.signingKey.address).toNumber()
    ).toEqual(3);
  }

  /**
   * Game is over at the end of this functon call and is ready to be uninstalled.
   */
  public static async makeMoves(
    peerA: TestResponseSink,
    peerB: TestResponseSink,
    cfAddr: string
  ) {
    const state = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    const X = 1;
    const O = 2;

    await TicTacToeSimulator.makeMove(peerA, peerB, cfAddr, state, 0, X, 1);
    await TicTacToeSimulator.makeMove(peerB, peerA, cfAddr, state, 4, O, 2);
    await TicTacToeSimulator.makeMove(peerA, peerB, cfAddr, state, 1, X, 3);
    await TicTacToeSimulator.makeMove(peerB, peerA, cfAddr, state, 5, O, 4);
    await TicTacToeSimulator.makeMove(peerA, peerB, cfAddr, state, 2, X, 5);
  }

  public static async makeMove(
    peerA: TestResponseSink,
    peerB: TestResponseSink,
    cfAddr: string,
    appState: number[],
    cell: number,
    side: number,
    moveNumber: number
  ) {
    appState[cell] = side;
    const state = appState.toString();
    const msg = TicTacToeSimulator.updateMsg(
      state,
      cell,
      peerA.signingKey.address!,
      peerB.signingKey.address!,
      cfAddr
    );
    const response = await peerA.runProtocol(msg);
    expect(response.status).toEqual(cf.legacy.node.ResponseStatus.COMPLETED);
    TicTacToeSimulator.validateMakeMove(
      peerA,
      peerB,
      cfAddr,
      state,
      moveNumber
    );
    await cf.legacy.utils.sleep(50);
    TicTacToeSimulator.validateMakeMove(
      peerB,
      peerA,
      cfAddr,
      state,
      moveNumber
    );
  }

  public static updateMsg(
    state: string,
    cell: number,
    to: string,
    from: string,
    cfAddr: string
  ): cf.legacy.node.ClientActionMessage {
    const updateData: cf.legacy.app.UpdateData = {
      encodedAppState: state,
      appStateHash: ethers.constants.HashZero // TODO:
    };
    return {
      requestId: "1",
      appId: cfAddr,
      action: cf.legacy.node.ActionName.UPDATE,
      data: updateData,
      multisigAddress: UNUSED_FUNDED_ACCOUNT,
      toAddress: to,
      fromAddress: from,
      seq: 0
    };
  }

  public static validateMakeMove(
    peerA: TestResponseSink,
    peerB: TestResponseSink,
    cfAddr,
    appState: string,
    moveNumber: number
  ) {
    const appA =
      peerA.instructionExecutor.node.channelStates[UNUSED_FUNDED_ACCOUNT]
        .appInstances[cfAddr];
    const appB =
      peerB.instructionExecutor.node.channelStates[UNUSED_FUNDED_ACCOUNT]
        .appInstances[cfAddr];

    expect(appA.encodedState).toEqual(appState);
    expect(appA.localNonce).toEqual(moveNumber + 1);
    expect(appB.encodedState).toEqual(appState);
    expect(appB.localNonce).toEqual(moveNumber + 1);
  }

  public static async uninstall(
    peerA: TestResponseSink,
    peerB: TestResponseSink,
    cfAddr: string
  ) {
    const msg = TicTacToeSimulator.uninstallStartMsg(
      cfAddr,
      peerA.signingKey.address!,
      ethers.utils.bigNumberify(4),
      peerB.signingKey.address!,
      ethers.utils.bigNumberify(0)
    );
    const response = await peerA.runProtocol(msg);
    expect(response.status).toEqual(cf.legacy.node.ResponseStatus.COMPLETED);
    // A wins so give him 2 and subtract 2 from B
    await cf.legacy.utils.sleep(50);
    TicTacToeSimulator.validateUninstall(
      cfAddr,
      peerA,
      ethers.utils.bigNumberify(12),
      peerB,
      ethers.utils.bigNumberify(3)
    );
  }

  public static uninstallStartMsg(
    cfAddr: string,
    addressA: string,
    amountA: ethers.utils.BigNumber,
    addressB: string,
    amountB: ethers.utils.BigNumber
  ): cf.legacy.node.ClientActionMessage {
    const uninstallData = {
      peerAmounts: [
        new cf.legacy.utils.PeerBalance(addressA, amountA),
        new cf.legacy.utils.PeerBalance(addressB, amountB)
      ]
    };
    return {
      requestId: "2",
      appId: cfAddr,
      action: cf.legacy.node.ActionName.UNINSTALL,
      data: uninstallData,
      multisigAddress: UNUSED_FUNDED_ACCOUNT,
      fromAddress: addressA,
      toAddress: addressB,
      seq: 0
    };
  }

  public static validateUninstall(
    cfAddr: string,
    walletA: TestResponseSink,
    amountA: ethers.utils.BigNumber,
    walletB: TestResponseSink,
    amountB: ethers.utils.BigNumber
  ) {
    TicTacToeSimulator.validateUninstallChannelInfo(
      walletA.instructionExecutor.node.channelStates[UNUSED_FUNDED_ACCOUNT],
      cfAddr,
      walletA,
      amountA,
      walletB,
      amountB
    );
  }

  public static validateUninstallChannelInfo(
    channel: cf.legacy.channel.StateChannelInfo,
    cfAddr: string,
    walletA: TestResponseSink,
    amountA: ethers.utils.BigNumber,
    walletB: TestResponseSink,
    amountB: ethers.utils.BigNumber
  ) {
    const app = channel.appInstances[cfAddr];
    expect(channel.freeBalance.balanceOfAddress(walletA.signingKey.address)).toEqual(amountA);
    expect(channel.freeBalance.balanceOfAddress(walletB.signingKey.address)).toEqual(amountB);
    expect(channel.freeBalance.uniqueId).toEqual(0);
    expect(app.dependencyNonce.nonceValue).toEqual(1);
  }
}
