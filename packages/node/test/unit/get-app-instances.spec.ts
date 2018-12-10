import {
  AppInstanceInfo,
  AssetType,
  Node as NodeTypes
} from "@counterfactual/common-types";
import dotenv from "dotenv";
import { ethers } from "ethers";
import FirebaseServer from "firebase-server";

import { IStoreService, Node, NodeConfig } from "../../src";

import { A_PRIVATE_KEY, B_PRIVATE_KEY } from "../env";

import FirebaseServiceFactory from "../integration/services/firebase-service";
import { MOCK_MESSAGING_SERVICE } from "../mock-services/mock-messaging-service";

dotenv.config();

describe("Node method follows spec - getAppInstances", () => {
  let firebaseServer: FirebaseServer;
  let storeService: IStoreService;
  let node: Node;
  let nodeConfig: NodeConfig;

  beforeAll(() => {
    const firebaseServiceFactory = new FirebaseServiceFactory(
      process.env.FIREBASE_DEV_SERVER_HOST!,
      process.env.FIREBASE_DEV_SERVER_PORT!
    );
    firebaseServer = firebaseServiceFactory.createServer();
    storeService = firebaseServiceFactory.createStoreService(
      process.env.FIREBASE_STORE_SERVER_KEY!
    );
    nodeConfig = {
      MULTISIG_KEY_PREFIX: process.env.FIREBASE_STORE_MULTISIG_PREFIX_KEY!
    };
    node = new Node(
      A_PRIVATE_KEY,
      MOCK_MESSAGING_SERVICE,
      storeService,
      nodeConfig
    );
    nodeConfig = {
      MULTISIG_KEY_PREFIX: process.env.FIREBASE_STORE_MULTISIG_PREFIX_KEY!
    };
  });

  afterAll(() => {
    firebaseServer.close();
  });

  it("can accept a valid call to get empty list of app instances", async done => {
    const requestId = "1";
    const req: NodeTypes.MethodRequest = {
      requestId,
      type: NodeTypes.MethodName.GET_APP_INSTANCES,
      params: {} as NodeTypes.GetAppInstancesParams
    };

    // Set up listener for the method response
    node.on(req.type, (res: NodeTypes.MethodResponse) => {
      expect(req.type).toEqual(res.type);
      expect(res.requestId).toEqual(requestId);
      expect(res.result).toEqual({
        appInstances: [] as AppInstanceInfo[]
      });
      done();
    });

    // Make the method call
    node.emit(req.type, req);
  });

  it.only("can accept a valid call to get non-empty list of app instances", async done => {
    const peerAddress = new ethers.Wallet(B_PRIVATE_KEY).address;

    // first, a channel must be opened for it to have an app instance
    const multisigCreationRequstId = "1";
    const multisigCreationReq: NodeTypes.MethodRequest = {
      requestId: multisigCreationRequstId,
      type: NodeTypes.MethodName.CREATE_MULTISIG,
      params: {
        owners: [node.address, peerAddress]
      } as NodeTypes.CreateMultisigParams
    };

    // second, an app instance must be proposed to be installed into that channel
    const appInstanceProposalParams: NodeTypes.ProposeInstallParams = {
      peerAddress,
      appId: "1",
      abiEncodings: {
        stateEncoding: "stateEncoding",
        actionEncoding: "actionEncoding"
      },
      asset: {
        assetType: AssetType.ETH
      },
      myDeposit: ethers.utils.bigNumberify("1"),
      peerDeposit: ethers.utils.bigNumberify("1"),
      timeout: ethers.utils.bigNumberify("1"),
      initialState: {
        propertyA: "A",
        propertyB: "B"
      }
    };
    const appInstanceInstallationProposalRequestId = "2";
    const appInstanceInstallationProposalRequest: NodeTypes.MethodRequest = {
      requestId: appInstanceInstallationProposalRequestId,
      type: NodeTypes.MethodName.PROPOSE_INSTALL,
      params: appInstanceProposalParams
    };

    // third, the pending app instance needs to be installed
    // its installation request will be the callback to the proposal response
    const installAppInstanceRequestId = "3";
    let installedAppInstance: AppInstanceInfo;

    // fourth, a call to get app instances can be made
    const getAppInstancesRequestId = "4";
    const getAppInstancesRequest: NodeTypes.MethodRequest = {
      requestId: getAppInstancesRequestId,
      type: NodeTypes.MethodName.GET_APP_INSTANCES,
      params: {} as NodeTypes.GetAppInstancesParams
    };

    // The listeners are setup in reverse order such that their callbacks are
    // defined as the calls unwind
    // create multisig -> install proposal -> install -> get app instances

    // Set up listener for getting all apps
    node.on(getAppInstancesRequest.type, (res: NodeTypes.MethodResponse) => {
      console.log("got app instances: ", res);
      expect(getAppInstancesRequest.type).toEqual(res.type);
      expect(res.requestId).toEqual(getAppInstancesRequestId);
      expect(res.result).toEqual({
        appInstances: [] as AppInstanceInfo[]
      });
      done();
    });

    node.on(NodeTypes.MethodName.INSTALL, res => {
      console.log("installed: ", res);
      const installResult: NodeTypes.InstallResult = res.result;
      installedAppInstance = installResult.appInstance;
      console.log("got installed app: ", installedAppInstance);
      node.emit(getAppInstancesRequest.type, getAppInstancesRequest);
    });

    node.on(appInstanceInstallationProposalRequest.type, res => {
      console.log("created proposal: ", res);
      const installProposalResult: NodeTypes.ProposeInstallResult = res.result;
      const appInstanceId = installProposalResult.appInstanceId;
      const installAppInstanceRequest: NodeTypes.MethodRequest = {
        requestId: installAppInstanceRequestId,
        type: NodeTypes.MethodName.INSTALL,
        params: {
          appInstanceId
        } as NodeTypes.InstallParams
      };

      node.emit(installAppInstanceRequest.type, installAppInstanceRequest);
    });

    node.on(multisigCreationReq.type, res => {
      console.log("created multisig: ", res);
      const createMultisigResult: NodeTypes.CreateMultisigResult = res.result;
      expect(createMultisigResult.multisigAddress).toBeDefined();

      // Make the call to get all apps
      node.emit(
        appInstanceInstallationProposalRequest.type,
        appInstanceInstallationProposalRequest
      );
    });

    node.emit(multisigCreationReq.type, multisigCreationReq);
  });
});
