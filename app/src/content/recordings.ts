/**
 * The Black Box recordings (`app/src/content/recordings.ts`).
 *
 * Split from `loader.ts` on purpose: `contentRecordings.ts` is ~9 kB of prose that only the
 * dashboard's Black Box page reads, and keeping it out of the loader keeps it out of the entry
 * chunk the first screen pays for. The lookup rules are the same either way — a recording belongs to
 * one mission, by number, and `content/` is where both sides come from.
 */
import { RECORDINGS, type BlackBoxRecording } from '../data/contentRecordings.ts';
import { missionAt } from './loader.ts';

export { RECORDINGS };
export type { BlackBoxRecording };

const BY_ID = new Map(RECORDINGS.map((recording) => [recording.id, recording]));
const BY_NUMBER = new Map(RECORDINGS.map((recording) => [recording.number, recording]));

/** Every recording in mission order: the Black Box page's own list. */
export function allRecordings(): BlackBoxRecording[] {
  return [...RECORDINGS].sort((a, b) => a.number - b.number);
}

export function recordingAt(number: number): BlackBoxRecording | null {
  return BY_NUMBER.get(number) ?? null;
}

export function recordingForMission(number: number): BlackBoxRecording | null {
  const mission = missionAt(number);
  if (!mission) return null;
  return BY_ID.get(mission.recording) ?? null;
}
