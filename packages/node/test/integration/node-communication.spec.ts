import dotenv from "dotenv";
import firebase from "firebase";
import FirebaseServer from "firebase-server";

import { Node } from "../../src";

import { A_PRIVATE_KEY, B_PRIVATE_KEY } from "../env";

import FirebaseMessagingService from "./services/firebase-messaging-service";

dotenv.config();

describe("Two nodes can communicate with each other", () => {
  let firebaseServer: FirebaseServer;
  let messagingService: FirebaseMessagingService;
  let nodeA: Node;
  let nodeB: Node;

  beforeAll(() => {
    const firebaseServerPort = process.env.FIREBASE_DEV_SERVER_PORT!;
    const firebaseServerHost = "localhost";
    firebaseServer = new FirebaseServer(firebaseServerPort, firebaseServerHost);

    const app = firebase.initializeApp({
      databaseURL: `ws://${firebaseServerHost}:${firebaseServerPort}`,
      projectId: "projectId"
    });
    messagingService = new FirebaseMessagingService(app.database());
  });

  beforeEach(() => {
    nodeA = new Node(A_PRIVATE_KEY, messagingService);
    nodeB = new Node(B_PRIVATE_KEY, messagingService);
  });

  afterAll(() => {
    firebaseServer.close();
  });

  it("Node A can send messages to Node B", done => {
    const installMsg = { method: "INSTALL" };

    nodeB.on(Node.PEER_MESSAGE, msg => {
      expect(msg.from).toEqual(nodeA.address);
      expect(msg.method).toEqual(installMsg.method);
      done();
    });
    nodeA.send(nodeB.address, installMsg);
  });

  it("Node A can syn-ack with Node B", done => {
    const synMsg = { phase: "SYN" };
    const ackMsg = { phase: "ACK" };

    nodeA.on(Node.PEER_MESSAGE, msg => {
      expect(msg.from).toEqual(nodeB.address);
      expect(msg.phase).toEqual(ackMsg.phase);
      done();
    });

    nodeB.on(Node.PEER_MESSAGE, msg => {
      expect(msg.from).toEqual(nodeA.address);
      expect(msg.phase).toEqual(synMsg.phase);
      nodeB.send(nodeA.address, ackMsg);
    });

    nodeA.send(nodeB.address, synMsg);
  });
});
