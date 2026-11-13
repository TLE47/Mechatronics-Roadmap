import { useEffect, useRef } from 'react';
import { lessonPassed } from '../../../audio/facade';
import type { PassStatus } from './useRunnerExecution';

/**
 * The pass cue and the once-per-lesson shuffle (`runner/usePassToast.ts`).
 *
 * A pass earns a toast once, and the music manager hears one lesson-pass event per verified lesson.
 * Both live here because they share the same once-only record: a pass already on screen still opens
 * the toast, but returning to that entry must not shuffle the tape again.
 *
 * The toast itself — how long it stays, where it stacks, which live region owns it — is sonner's
 * (`components/tabs/TabPyodideRunner.tsx` passes a `toast.custom` call in). This hook only decides
 * *when* a pass is news, so the six-second timer and the boolean that used to follow it are gone.
 */
export function usePassToast(
  passStatus: PassStatus,
  selectedId: string,
  announce: () => void
): void {
  const randomizedPassRef = useRef<string | null>(null);
  // The callback is read through a ref so a caller that re-creates it each render cannot re-fire
  // the effect: the event is the verdict, not the function identity.
  const announceRef = useRef(announce);
  announceRef.current = announce;

  useEffect(() => {
    if (passStatus !== 'passed') return;
    // Once per verified lesson, not once per render.
    if (randomizedPassRef.current !== selectedId) {
      randomizedPassRef.current = selectedId;
      lessonPassed();
    }
    announceRef.current();
  }, [passStatus, selectedId]);
}
