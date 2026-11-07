import { useEffect, useRef } from 'react';
import { lessonPassed } from '../../../audio/facade';
import type { PassStatus } from './useRunnerExecution';

/**
 * The pass toast and the once-per-lesson shuffle (`runner/usePassToast.ts`).
 *
 * A pass earns a toast once, and the music manager hears one lesson-pass event per verified lesson.
 * Both live here because they share the same once-only record: a pass already on screen still opens
 * the toast, but returning to that entry must not shuffle the tape again.
 */
export function usePassToast(
  passStatus: PassStatus,
  selectedId: string,
  setShowPassToast: (show: boolean) => void
): void {
  const randomizedPassRef = useRef<string | null>(null);

  useEffect(() => {
    if (passStatus !== 'passed') {
      setShowPassToast(false);
      return;
    }
    setShowPassToast(true);
    // Once per verified lesson, not once per render.
    if (randomizedPassRef.current !== selectedId) {
      randomizedPassRef.current = selectedId;
      lessonPassed();
    }
    const timer = window.setTimeout(() => setShowPassToast(false), 6000);
    return () => window.clearTimeout(timer);
  }, [passStatus, selectedId, setShowPassToast]);
}
