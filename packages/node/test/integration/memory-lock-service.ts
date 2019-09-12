import { Node } from "@counterfactual/types";

import { Lock } from "./lock";

export class MemoryLockService implements Node.ILockService {
  public readonly locks: Map<string, Lock> = new Map<string, Lock>();

  async acquireLock(
    lockName: string,
    callback: (...args: any[]) => any,
    timeout: number
  ): Promise<any> {
    const lock = this.getOrCreateLock(lockName);

    let retval = null;
    let rejectReason = null;
    let unlockKey = "";

    try {
      unlockKey = await lock.acquireLock(timeout);
      retval = await callback();
    } catch (e) {
      // TODO: check exception... if the lock failed
      rejectReason = e;
    } finally {
      await lock.releaseLock(unlockKey);
    }

    if (rejectReason) throw rejectReason;

    return retval;
  }

  private getOrCreateLock(lockName: string) {
    if (!this.locks.has(lockName)) {
      this.locks.set(lockName, new Lock(lockName));
    }
    return this.locks.get(lockName)!;
  }
}

export default MemoryLockService;
