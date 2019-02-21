import { Node as NodeTypes } from "@counterfactual/types";
import { BaseProvider, JsonRpcProvider } from "ethers/providers";
import { v4 as generateUUID } from "uuid";

import {
  IMessagingService,
  IStoreService,
  Node,
  NODE_EVENTS,
  NodeConfig
} from "../../src";
import { MNEMONIC_PATH } from "../../src/signer";

import TestFirebaseServiceFactory from "./services/firebase-service";
import {
  getChannelAddresses,
  getMultisigCreationTransactionHash,
  TEST_NETWORK
} from "./utils";

describe("Node can create multisig, other owners get notified", () => {
  jest.setTimeout(30000);
  let firebaseServiceFactory: TestFirebaseServiceFactory;
  let messagingService: IMessagingService;
  let nodeA: Node;
  let storeServiceA: IStoreService;
  let nodeB: Node;
  let storeServiceB: IStoreService;
  let nodeC: Node;
  let storeServiceC: IStoreService;
  let nodeConfig: NodeConfig;
  let provider: BaseProvider;

  beforeAll(async () => {
    firebaseServiceFactory = new TestFirebaseServiceFactory(
      process.env.FIREBASE_DEV_SERVER_HOST!,
      process.env.FIREBASE_DEV_SERVER_PORT!
    );
    messagingService = firebaseServiceFactory.createMessagingService(
      process.env.FIREBASE_MESSAGING_SERVER_KEY!
    );
    nodeConfig = {
      STORE_KEY_PREFIX: process.env.FIREBASE_STORE_MULTISIG_PREFIX_KEY!
    };

    provider = new JsonRpcProvider(global["ganacheURL"]);

    storeServiceA = firebaseServiceFactory.createStoreService(
      process.env.FIREBASE_STORE_SERVER_KEY! + generateUUID()
    );
    storeServiceA.set([{ key: MNEMONIC_PATH, value: process.env.A_MNEMONIC }]);
    nodeA = await Node.create(
      messagingService,
      storeServiceA,
      nodeConfig,
      provider,
      TEST_NETWORK,
      global["networkContext"]
    );

    storeServiceB = firebaseServiceFactory.createStoreService(
      process.env.FIREBASE_STORE_SERVER_KEY! + generateUUID()
    );
    nodeB = await Node.create(
      messagingService,
      storeServiceB,
      nodeConfig,
      provider,
      TEST_NETWORK,
      global["networkContext"]
    );
    storeServiceC = firebaseServiceFactory.createStoreService(
      process.env.FIREBASE_STORE_SERVER_KEY! + generateUUID()
    );
    nodeC = await Node.create(
      messagingService,
      storeServiceC,
      nodeConfig,
      provider,
      TEST_NETWORK,
      global["networkContext"]
    );
  });

  afterAll(() => {
    firebaseServiceFactory.closeServiceConnections();
  });

  describe("Queued channel creation", () => {
    it("Node A can create multiple back-to-back channels with Node B and Node C", async done => {
      const ownersABPublicIdentifiers = [
        nodeA.publicIdentifier,
        nodeB.publicIdentifier
      ];
      const ownersACPublicIdentifiers = [
        nodeA.publicIdentifier,
        nodeC.publicIdentifier
      ];

      nodeA.on(
        NODE_EVENTS.CREATE_CHANNEL,
        async (data: NodeTypes.CreateChannelResult) => {
          if (data.owners === ownersABPublicIdentifiers) {
            const openChannelsNodeA = await getChannelAddresses(nodeA);
            const openChannelsNodeB = await getChannelAddresses(nodeB);
            expect(openChannelsNodeA.size).toEqual(1);
            expect(openChannelsNodeB.size).toEqual(1);

            await confirmChannelCreation(
              nodeA,
              nodeB,
              ownersABPublicIdentifiers,
              data
            );
            console.log("confirmed first multisig creation");
          } else {
            const openChannelsNodeA = await getChannelAddresses(nodeA);
            const openChannelsNodeC = await getChannelAddresses(nodeC);
            console.log(openChannelsNodeA);
            expect(openChannelsNodeA.size).toEqual(2);
            expect(openChannelsNodeC.size).toEqual(1);
            await confirmChannelCreation(
              nodeA,
              nodeC,
              ownersACPublicIdentifiers,
              data
            );
            console.log("confirmed second multisig creation");
            done();
          }
        }
      );

      const txHash1 = await getMultisigCreationTransactionHash(
        nodeA,
        ownersABPublicIdentifiers
      );
      const txHash2 = await getMultisigCreationTransactionHash(
        nodeA,
        ownersACPublicIdentifiers
      );
      expect(txHash1).toBeDefined();
      expect(txHash2).toBeDefined();
      console.log(txHash1);
      console.log(txHash2);
    });
  });
});

async function confirmChannelCreation(
  nodeA: Node,
  nodeB: Node,
  ownersPublicIdentifiers: string[],
  data: NodeTypes.CreateChannelResult
) {
  const openChannelsNodeA = await getChannelAddresses(nodeA);
  const openChannelsNodeB = await getChannelAddresses(nodeB);

  expect(openChannelsNodeA.has(data.multisigAddress)).toBeTruthy();
  expect(openChannelsNodeB.has(data.multisigAddress)).toBeTruthy();
  expect(data.owners).toEqual(ownersPublicIdentifiers);
}
