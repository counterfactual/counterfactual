declare global {
  interface Window {
    ethereum: EthereumMock;
  }
}

import { Node } from "@counterfactual/types";

import NodeProviderEthereum from "../../src/node-provider-ethereum";
import EthereumMock from "../utils/ethereum-mock";

describe("NodeProvider", () => {
  beforeAll(() => {
    window.ethereum = new EthereumMock();
  });
  it("should instantiate", () => {
    new NodeProviderEthereum();
  });
  it("should connect", async () => {
    const nodeProvider = new NodeProviderEthereum();
    await nodeProvider.connect();
  });
  it("should emit a warning if you're connecting twice", async () => {
    const originalConsoleWarn = console.warn;
    console.warn = jest.fn();

    const nodeProvider = new NodeProviderEthereum();
    await nodeProvider.connect();
    await nodeProvider.connect();

    expect(console.warn).toBeCalledWith("NodeProvider is already connected.");
    console.warn = originalConsoleWarn;
  });
  it("should fail to send a message if not connected", () => {
    const nodeProvider = new NodeProviderEthereum();

    expect(() => {
      nodeProvider.sendMessage({
        type: Node.MethodName.INSTALL
      } as Node.Message);
    }).toThrow(
      "It's not possible to use postMessage() before the NodeProvider is connected. Call the connect() method first."
    );
  });
  it("should send a message", async () => {
    const nodeProvider = new NodeProviderEthereum();
    await nodeProvider.connect();

    const messageToSend = {
      type: Node.MethodName.INSTALL
    } as Node.Message;

    const spySend = jest.spyOn(window.ethereum, "send");

    nodeProvider.sendMessage(messageToSend);
    expect(spySend).toBeCalledWith("counterfactual:nodeProvider:request", [
      messageToSend
    ]);
  });
});
