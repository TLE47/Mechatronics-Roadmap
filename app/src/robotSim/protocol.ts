/**
 * The page half of the robot bridge (`app/src/robotSim/protocol.ts`).
 *
 * The worker posts one command, then blocks on a shared `[state, length, bytes]` word until this
 * side answers. Two rules keep that safe:
 *
 * - a reply is written only while the word is still `0` (waiting); after a stop wrote `-1`, a late
 *   animation reply is dropped instead of reviving a run that is already unwinding;
 * - the reply is one JSON object, so a sensor's answer and an error travel the same way.
 */
import type { RobotReply } from './model';

export const ROBOT_SLOT = 8;

/** Write one reply and wake the worker. Returns false when the run was already stopped. */
export function writeRobotReply(buffer: SharedArrayBuffer | null, reply: RobotReply): boolean {
  if (!buffer) return false;
  const view = new Int32Array(buffer, 0, 2);
  if (Atomics.load(view, 0) === -1) return false;
  const bytes = new TextEncoder().encode(JSON.stringify(reply));
  const length = Math.min(bytes.length, buffer.byteLength - ROBOT_SLOT);
  new Uint8Array(buffer, ROBOT_SLOT, length).set(bytes.subarray(0, length));
  Atomics.store(view, 1, length);
  Atomics.store(view, 0, 1);
  Atomics.notify(view, 0);
  return true;
}

/** Stop a worker blocked on a robot command: `stop` makes the Python helper raise KeyboardInterrupt. */
export function cancelRobotWait(buffer: SharedArrayBuffer | null): void {
  if (!buffer) return;
  const view = new Int32Array(buffer, 0, 2);
  Atomics.store(view, 0, -1);
  Atomics.notify(view, 0);
}

/** The command word a fresh run needs: `0`, waiting for a reply rather than a stop. */
export function armRobotWait(buffer: SharedArrayBuffer | null): void {
  if (!buffer) return;
  const view = new Int32Array(buffer, 0, 2);
  Atomics.store(view, 1, 0);
  Atomics.store(view, 0, 0);
}
