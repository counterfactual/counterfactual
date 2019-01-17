import { Node as NodeTypes } from "@counterfactual/types";
import FirebaseServer from "firebase-server";
import { v4 as generateUUID } from "uuid";

import { IMessagingService, IStoreService, Node, NodeConfig } from "../../src";
import { ERRORS } from "../../src/methods/errors";
import { InstallMessage, NODE_EVENTS, ProposeMessage } from "../../src/types";

import TestFirebaseServiceFactory from "./services/firebase-service";
import {
  confirmProposedAppInstanceOnNode,
  EMPTY_NETWORK,
  generateTakeActionRequest,
  getInstalledAppInstanceInfo,
  getInstalledAppInstances,
  getNewMultisig,
  getProposedAppInstanceInfo,
  makeInstallProposalRequest
} from "./utils";

describe("Node method follows spec - proposeInstall", () => {
  let firebaseServiceFactory: TestFirebaseServiceFactory;
  let firebaseServer: FirebaseServer;
  let messagingService: IMessagingService;
  let nodeA: Node;
  let storeServiceA: IStoreService;
  let nodeB: Node;
  let storeServiceB: IStoreService;
  let nodeConfig: NodeConfig;

  beforeAll(async () => {
    firebaseServiceFactory = new TestFirebaseServiceFactory(
      process.env.FIREBASE_DEV_SERVER_HOST!,
      process.env.FIREBASE_DEV_SERVER_PORT!
    );
    firebaseServer = firebaseServiceFactory.createServer();
    messagingService = firebaseServiceFactory.createMessagingService(
      process.env.FIREBASE_MESSAGING_SERVER_KEY!
    );
    nodeConfig = {
      STORE_KEY_PREFIX: process.env.FIREBASE_STORE_PREFIX_KEY!
    };
  });

  beforeEach(async () => {
    storeServiceA = firebaseServiceFactory.createStoreService(
      process.env.FIREBASE_STORE_SERVER_KEY! + generateUUID()
    );
    nodeA = await Node.create(
      messagingService,
      storeServiceA,
      EMPTY_NETWORK,
      nodeConfig
    );

    storeServiceB = firebaseServiceFactory.createStoreService(
      process.env.FIREBASE_STORE_SERVER_KEY! + generateUUID()
    );
    nodeB = await Node.create(
      messagingService,
      storeServiceB,
      EMPTY_NETWORK,
      nodeConfig
    );
  });

  afterAll(() => {
    firebaseServer.close();
  });

  describe(
    "Node A and B install an AppInstance, Node A takes action, " +
      "Node B confirms receipt of state update",
    () => {
      it("sends takeAction with invalid appInstanceId", async () => {
        const takeActionReq = generateTakeActionRequest("", {
          foo: "bar"
        });

        expect(nodeA.call(takeActionReq.type, takeActionReq)).rejects.toEqual(
          ERRORS.NO_APP_INSTANCE_FOR_TAKE_ACTION
        );
      });

      it.skip("sends with non-null initial state", async done => {
        const multisigAddress = await getNewMultisig(nodeA, [
          nodeA.address,
          nodeB.address
        ]);
        expect(multisigAddress).toBeDefined();
        expect(await getInstalledAppInstances(nodeA)).toEqual([]);
        expect(await getInstalledAppInstances(nodeB)).toEqual([]);

        let appInstanceId;

        // second, an app instance must be proposed to be installed into that channel
        const appInstanceInstallationProposalRequest = makeInstallProposalRequest(
          nodeA.address,
          nodeB.address
        );

        // node B then decides to approve the proposal
        nodeB.on(NODE_EVENTS.PROPOSE_INSTALL, async (msg: ProposeMessage) => {
          confirmProposedAppInstanceOnNode(
            appInstanceInstallationProposalRequest.params,
            await getProposedAppInstanceInfo(nodeA, appInstanceId)
          );

          // some approval logic happens in this callback, we proceed
          // to approve the proposal, and install the app instance
          const installRequest: NodeTypes.MethodRequest = {
            requestId: generateUUID(),
            type: NodeTypes.MethodName.INSTALL,
            params: {
              appInstanceId: msg.data.appInstanceId
            } as NodeTypes.InstallParams
          };

          nodeB.emit(installRequest.type, installRequest);
        });

        nodeA.on(NODE_EVENTS.INSTALL, async (msg: InstallMessage) => {
          const appInstanceNodeA = await getInstalledAppInstanceInfo(
            nodeA,
            appInstanceId
          );
          const appInstanceNodeB = await getInstalledAppInstanceInfo(
            nodeB,
            appInstanceId
          );
          expect(appInstanceNodeA).toEqual(appInstanceNodeB);
          done();
        });

        const response = await nodeA.call(
          appInstanceInstallationProposalRequest.type,
          appInstanceInstallationProposalRequest
        );
        appInstanceId = (response.result as NodeTypes.ProposeInstallResult)
          .appInstanceId;
      });

      it("sends proposal with null initial state", async () => {
        const appInstanceInstallationProposalRequest = makeInstallProposalRequest(
          nodeA.address,
          nodeB.address,
          true
        );

        expect(
          nodeA.call(
            appInstanceInstallationProposalRequest.type,
            appInstanceInstallationProposalRequest
          )
        ).rejects.toEqual(ERRORS.NULL_INITIAL_STATE_FOR_PROPOSAL);
      });
    }
  );
});
