const cf = require("@counterfactual/cf.js");
import { StateChannel } from '../../../../ethmo/vendor/cf-test/client/state-channel-client';
const fs = require("fs");
const path = require("path");
const { FirebaseServiceFactory, Node } = require("@counterfactual/node");
const { ethers } = require("ethers");
const { AddressZero } = require("ethers/constants");
const { v4 } = require("uuid");
const bn = ethers.utils.bigNumberify;
const ZERO = bn(0);

function checkDraw(board) {
  return board.every(row => row.every(square => !bn(square).eq(ZERO)));
}

function checkVictory(board, player) {
  return (
    checkHorizontalVictory(board, player) ||
    checkVerticalVictory(board, player) ||
    checkDiagonalVictory(board, player) ||
    checkCrossDiagonalVictory(board, player)
  );
}

function checkHorizontalVictory(board, player) {
  let idx;
  const victory = board.some((row, index) => {
    idx = index;
    return row.every(square => bn(square).eq(bn(player)));
  });

  if (victory) {
    return {
      winClaimType: 0,
      idx
    };
  }
}

function checkVerticalVictory(board, player) {
  let idx;
  const victory = board[0].some((columnStart, index) => {
    idx = index;
    return (
      bn(columnStart).eq(bn(player)) &&
      bn(board[1][index]).eq(bn(player)) &&
      bn(board[2][index]).eq(bn(player))
    );
  });

  if (victory) {
    return {
      winClaimType: 1,
      idx
    };
  }
}

function checkDiagonalVictory(board, player) {
  const victory =
    bn(board[0][0]).eq(bn(player)) &&
    bn(board[1][1]).eq(bn(player)) &&
    bn(board[2][2]).eq(bn(player));

  if (victory) {
    return {
      winClaimType: 2,
      idx: 0
    };
  }
}

function checkCrossDiagonalVictory(board, player) {
  const victory =
    bn(board[0][2]).eq(bn(player)) &&
    bn(board[1][1]).eq(bn(player)) &&
    bn(board[2][0]).eq(bn(player));

  if (victory) {
    return {
      winClaimType: 3,
      idx: 0
    };
  }
}

const STATE_ENCODING = "tuple(address[2] players, uint256 turnName, uint256 winner, uint256[3][3] board)";
const ACTION_ENCODING = "tuple(ActionType actionType, uint256 playX, uint256 playY, WinClaim winClaim)";

const BOT_USER = {
  attributes: {
    email: "TTTBot@counterfactual.com",
    ethAddress: "0x1BdF54355A98b43951dB6f5369Dd1bAe31bF2FB0",
    // multisig from an account created by the playground; not valid here; use one created below
    multisigAddress: "0x329CbbBDe9278eE3C446344793e92AE8684DFfb2",
    nodeAddress:
      "xpub6FCuHMxAHGeGpJGXrFi5arY1jwaDwYQaQ9JzzAWf8iHq1v9HLoTpaZJp6WEH3wBEHaaoFPS4ZPtJCvPGM7Rvw2yPADadr3enDHCxGJqBaWG",
    username: "TTTBot"
  },
  id: "83ecc9fd-f594-47c0-81cf-2c502fe6f826",
  relationships: {},
  type: "user"
};

 // const APP = {
//   web3Provider: ethers.getDefaultProvider("ropsten"),
//   contracts: {}
// };

 class NodeProvider {
  constructor(node) {
    this.node = node;
  }

   onMessage(callback) {
    this.node.on("message", callback);
  }

   sendMessage(message) {
    this.node.emit("message", message);
  }

   async connect() {
    return Promise.resolve(this);
  }
}

const storePath = path.resolve(__dirname, 'store.json');

class JsonFileStoreService {
  get(key) {
    return Promise.resolve(JSON.parse(fs.readFileSync(storePath))[key]);
  }
  set(pairs) {
    const store = JSON.parse(fs.readFileSync(storePath));

    pairs.forEach((pair) => {
      store[pair.key] = pair.value;
    });

    fs.writeFileSync(storePath, JSON.stringify(store));

    return Promise.resolve(store);
  }
}

 (async () => {
  console.log("Creating serviceFactory");
  const serviceFactory = new FirebaseServiceFactory({
    apiKey: "AIzaSyA5fy_WIAw9mqm59mdN61CiaCSKg8yd4uw",
    authDomain: "foobar-91a31.firebaseapp.com",
    databaseURL: "https://foobar-91a31.firebaseio.com",
    projectId: "foobar-91a31",
    storageBucket: "foobar-91a31.appspot.com",
    messagingSenderId: "432199632441"
  });

   console.log("Creating store");
  const store = new JsonFileStoreService();
  console.log("Creating Node");
  const node = await Node.create(
    serviceFactory.createMessagingService("messaging"),
    store,
    {
      STORE_KEY_PREFIX: "store"
    },
    ethers.getDefaultProvider("ropsten"),
    "ropsten",
    // {
    //   AppRegistry: "0x6296F3ACf03b6D787BD1068B4DB8093c54d5d915",
    //   ETHBalanceRefund: "0x6a2DF880908eC363Bc386917353e5b2693B97096",
    //   ETHBucket: "0x5C505AA5498607224FbE95263c13BD686223aBe9",
    //   MultiSend: "0x3E7e57fd79F4d43607667538879C513577974bD6",
    //   NonceRegistry: "0x5ecb2be3E5b0e4836C4fDb18fDd381861dF0D537",
    //   StateChannelTransaction: "0x9F8fc6D23DC4882284C44bcf6fb7F96290705d3D",
    //   ETHVirtualAppAgreement: "0xdb2Ed0d73d0E6b8f431c999EC97D1AcFf5A0Ee2E"
    // }
  );
  console.log("public identifier", node.publicIdentifier)

  console.log("Creating channel with server")
  const playgroundAddress = "xpub6EDEcQcke2q2q5gUnhHBf3CvdE9woerHtHDxSih49EbsHEFbTxqRXEAFGmBfQHRJT57sHLnEyY1R1jPW8pycYWLbBt5mTprj8NPBeRG1C5e";
  const stateChannelResponse = await node.call(
    "createChannel",
    {
      params: {
        owners: [node.publicIdentifier, playgroundAddress]
      },
      type: "createChannel",
      requestId: v4()
    }
  );
  console.log("state channel response", stateChannelResponse);

   console.log("Creating NodeProvider");
  const nodeProvider = new NodeProvider(node);
  await nodeProvider.connect();

   console.log("Creating cfProvider");
  const cfProvider = new cf.Provider(nodeProvider);

   console.log("Creating appFactory");
  const appFactory = new cf.AppFactory(
    " 0x6296F3ACf03b6D787BD1068B4DB8093c54d5d915",
    {
      actionEncoding: ACTION_ENCODING,
      stateEncoding: STATE_ENCODING
    },
    cfProvider
  );

   console.log("Create event listener for installVirtual");
   cfProvider.on("installVirtual", appInstance => {
    console.log(`Received appInstance ${appInstance}`);
    appInstance.install();

    console.log("Create event listener for updateState");
    appInstance.on("updateState", newState => {
      console.log(`Received newState ${newState}`);
  
      const possibleMoves = [];
  
      for (let x = 0; x < 3; x++) {
        for (let y = 0; y < 3; y++) {
          if (this.activeState.board[x][y] !== 0) {
            possibleMoves.push({
              x,
              y
            });
          }
        }
      }
  
      if (possibleMoves.length === 0) {
        throw new Error("Yikes! No place left to move.");
      }
  
      const move = possibleMoves[Math.floor(Math.random()*possibleMoves.length)];
      const playX = move.x;
      const playY = move.y;
      const myNumber = 2; // TODO: figure out how to get the actual number
  
      
      const boardCopy = JSON.parse(JSON.stringify(newState.board));
      boardCopy[playX][playY] = window.ethers.utils.bigNumberify(myNumber);
  
      const winClaim = checkVictory(boardCopy, myNumber);
      const draw = checkDraw(boardCopy);
  
      let actionType = 0;
  
      if (winClaim) {
        actionType = 1;
      } else if (draw) {
        actionType = 2;
      }
  
      appInstance.takeAction({
        actionType: actionType,
        winClaim: winClaim || { winClaimType: 0, idx: 0 },
        playX,
        playY
      });
    });
  });
})();