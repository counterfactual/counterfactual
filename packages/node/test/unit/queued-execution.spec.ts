import Queue from "p-queue";

import { executeFunctionWithinQueues } from "../../src/methods/queued-execution";

describe("executeFunctionWithinQueues", () => {
  it("should work with one queue", async () => {
    const ret = await executeFunctionWithinQueues(
      [new Queue({ concurrency: 1 })],
      () => new Promise(r => setTimeout(() => r("abc"), 1))
    );
    expect(ret).toBe("abc");
  });

  it("should work with two queues", async () => {
    let noTimesExecutionFunctionRan = 0;
    let noTimesQueueBecameActive = 0;
    const queue1 = new Queue({ concurrency: 1 });
    const queue2 = new Queue({ concurrency: 1 });
    queue1.on("active", () => (noTimesQueueBecameActive += 1));
    queue2.on("active", () => (noTimesQueueBecameActive += 1));
    const ret = await executeFunctionWithinQueues(
      [queue1, queue2],
      () =>
        new Promise(r => {
          noTimesExecutionFunctionRan += 1;
          r("abc");
        })
    );
    expect(ret).toBe("abc");
    expect(noTimesExecutionFunctionRan).toBe(1);
    expect(noTimesQueueBecameActive).toBe(2);
  });

  it("should work with 10 queues", async () => {
    let noTimesExecutionFunctionRan = 0;
    let noTimesQueueBecameActive = 0;
    const queues: Queue[] = [];
    for (const i of Array(10)) {
      queues.push(new Queue({ concurrency: 1 }));
    }
    queues.forEach(q => q.on("active", () => (noTimesQueueBecameActive += 1)));
    const ret = await executeFunctionWithinQueues(
      queues,
      () =>
        new Promise(r => {
          noTimesExecutionFunctionRan += 1;
          r("abc");
        })
    );
    expect(ret).toBe("abc");
    expect(noTimesExecutionFunctionRan).toBe(1);
    expect(noTimesQueueBecameActive).toBe(10);
  });

  it.only("should work when called concurrently with one queue", async () => {
    const sharedQueue = new Queue({ concurrency: 1 });
    const logSizeAndPending = (queue: Queue) => {
      return `size: ${queue.size}, pending: ${queue.pending}`;
    };

    let i = 0;
    let hasExecutionStartedOnFirstOne = false;
    let hasExecutionFinishedOnFirstOne = false;
    let hasExecutionStartedOnSecondOne = false;
    let hasExecutionFinishedOnSecondOne = false;

    sharedQueue.on("active", () => {
      i += 1;
      console.log(
        `Working on item #${i}, queue1. Size: ${sharedQueue.size} Pending: ${sharedQueue.pending}`
      );
      if (i === 1) {
        expect(hasExecutionStartedOnFirstOne).toBe(false);
        expect(hasExecutionFinishedOnFirstOne).toBe(false);
        expect(hasExecutionStartedOnSecondOne).toBe(false);
        expect(hasExecutionFinishedOnSecondOne).toBe(false);
      } else if (i === 2) {
        expect(hasExecutionStartedOnFirstOne).toBe(true);
        expect(hasExecutionFinishedOnFirstOne).toBe(true);
        expect(hasExecutionStartedOnSecondOne).toBe(false);
        expect(hasExecutionFinishedOnSecondOne).toBe(false);
      }
    });

    executeFunctionWithinQueues(
      [sharedQueue],
      () =>
        new Promise(async r => {
          console.log("first one code starts", logSizeAndPending(sharedQueue));
          expect(sharedQueue.pending).toBe(1);
          hasExecutionStartedOnFirstOne = true;
          console.log("first one code waits", logSizeAndPending(sharedQueue));
          await new Promise(r => setTimeout(r, 250));
          console.log(
            "first one code continues",
            logSizeAndPending(sharedQueue)
          );
          expect(hasExecutionStartedOnSecondOne).toBe(false);
          console.log(
            "correctly has not started on second",
            logSizeAndPending(sharedQueue)
          );
          // ensure second promise is added to queue, but not acted on
          // pending promises are those that are already triggered
          // size of queue doesnt necessarily include pending promises
          expect(sharedQueue.pending + sharedQueue.size).toEqual(2);
          hasExecutionFinishedOnFirstOne = true;
          r();
        })
    );

    executeFunctionWithinQueues(
      [sharedQueue],
      () =>
        new Promise(r => {
          console.log("second one code runs", logSizeAndPending(sharedQueue));
          hasExecutionStartedOnSecondOne = true;
          hasExecutionFinishedOnSecondOne = true;
          r();
        })
    );

    await sharedQueue.onEmpty();

    expect(hasExecutionStartedOnFirstOne).toBe(true);
    expect(hasExecutionStartedOnSecondOne).toBe(true);
    expect(hasExecutionFinishedOnFirstOne).toBe(true);
    expect(hasExecutionFinishedOnSecondOne).toBe(true);
    expect(sharedQueue.size).toBe(0);
    expect(sharedQueue.pending).toBe(0);
  });
});
