import { Address } from "@counterfactual/types";
import * as firebase from "firebase/app";
import "firebase/database";

import { NodeMessage } from "./types";

export interface IMessagingService {
  send(respondingAddress: Address, msg: NodeMessage): Promise<void>;
  onReceive(address: Address, callback: (msg: NodeMessage) => void);
}

export interface IStoreService {
  get(key: string): Promise<any>;
  // Multiple pairs could be written simultaneously if an atomic write
  // among multiple records is required
  set(pairs: { key: string; value: any }[]): Promise<boolean>;
}

export interface FirebaseAppConfiguration {
  databaseURL: string;
  projectId: string;
  apiKey: string;
  authDomain: string;
  storageBucket: string;
  messagingSenderId: string;
}

/**
 * This factory exposes default implementations of the service interfaces
 * described above, using Firebase as the implementation backend.
 */
export class FirebaseServiceFactory {
  private app: firebase.app.App;

  constructor(configuration: FirebaseAppConfiguration) {
    this.app = firebase.initializeApp(configuration);
  }

  createMessagingService(messagingServiceKey: string): IMessagingService {
    return new FirebaseMessagingService(
      this.app.database(),
      messagingServiceKey
    );
  }

  createStoreService(storeServiceKey: string): IStoreService {
    return new FirebaseStoreService(this.app.database(), storeServiceKey);
  }
}

class FirebaseMessagingService implements IMessagingService {
  // naive caching - firebase fires observers twice upon initial callback
  // registration and invocation
  private servedMessages = new Map();

  constructor(
    private readonly firebase: firebase.database.Database,
    private readonly messagingServerKey: string
  ) {}

  async send(respondingAddress: Address, msg: object) {
    const sanitizedMsg = JSON.parse(JSON.stringify(msg));
    await this.firebase
      .ref(`${this.messagingServerKey}/${respondingAddress}`)
      .set(sanitizedMsg);
  }

  onReceive(address: Address, callback: (msg: any) => void) {
    if (this.firebase.app) {
      this.firebase
        .ref(`${this.messagingServerKey}/${address}`)
        .on("value", (snapshot: firebase.database.DataSnapshot | null) => {
          if (snapshot === null) {
            console.error(
              `Node with address ${address} received a "null" snapshot`
            );
          } else {
            const msg = snapshot.val();
            // TODO: Figure out why sometimes the message is null?
            // Answer: https://stackoverflow.com/a/37310606/2680092
            if (msg !== null) {
              const stringifiedMsg = JSON.stringify(msg);
              if (stringifiedMsg in this.servedMessages) {
                // TODO: Figure out why we had this
                // delete this.servedMessages[stringifiedMsg];
              } else {
                // this.servedMessages[stringifiedMsg] = true;
                callback(msg);
              }
            }
          }
        });
    } else {
      console.error(
        "Cannot register a connection with an uninitialized firebase handle"
      );
    }
  }
}

class FirebaseStoreService implements IStoreService {
  constructor(
    private readonly firebase: firebase.database.Database,
    private readonly storeServiceKey: string
  ) {}

  async get(key: string): Promise<any> {
    let result: any;
    await this.firebase
      .ref(this.storeServiceKey)
      .child(key)
      .once("value", (snapshot: firebase.database.DataSnapshot | null) => {
        if (snapshot === null) {
          console.debug(
            `Failed to retrieve value at ${key}: received a "null" snapshot`
          );
          return;
        }
        result = snapshot.val();
      });
    return result;
  }

  async set(pairs: { key: string; value: any }[]): Promise<any> {
    const updates = {};

    for (const pair of pairs) {
      updates[pair.key] = pair.value;
    }

    return await this.firebase.ref(this.storeServiceKey).update(updates);
  }
}
