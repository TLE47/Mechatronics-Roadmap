import React, { useEffect, useState } from 'react';
import { MICRO_CONCEPTS } from './catalog.ts';
import { microProgress } from './progress.ts';
import type { MicroStore } from './types.ts';

/**
 * The self-study readout (`VITE_MICRO_DEBUG=1`).
 *
 * It is a dynamic import behind a build-time check. A production build replaces the check with
 * `undefined` and this module/chunk is not referenced; `scripts/check_micro_debug_absent.mjs` is the
 * gate that proves that from `dist/`. It reads only the local store, so it cannot change evidence.
 */
export const MicroDebugReadout: React.FC = () => {
  const [store, setStore] = useState<MicroStore>(() => microProgress.read());

  useEffect(() => {
    const unsubscribe = microProgress.subscribe(() => setStore(microProgress.read()));
    return unsubscribe;
  }, []);

  const rows = MICRO_CONCEPTS.map((concept) => {
    const learn = store.events.filter(
      (event) => event.conceptId === concept.id && event.activity === 'learn'
    );
    const byPath = new Map<string, { n: number; elapsed: number; visible: number }>();
    for (const event of learn) {
      const key = `${event.diagnosticCorrect ?? 0}/2${event.practiceCorrect === null ? ' · no practice' : event.practiceCorrect ? ' · practice ✓' : ' · practice ✗'}`;
      const current = byPath.get(key) ?? { n: 0, elapsed: 0, visible: 0 };
      current.n += 1;
      current.elapsed += event.elapsedSeconds;
      current.visible += event.visibleSeconds;
      byPath.set(key, current);
    }
    return { concept, byPath };
  });

  return (
    <section
      data-testid="micro-debug"
      className="rounded-xl border border-dashed border-amber-500/50 bg-amber-500/5 p-3 font-mono text-[11px] text-amber-100"
    >
      <p className="uppercase tracking-[0.12em] text-amber-300">VITE_MICRO_DEBUG · local timing evidence</p>
      <p className="mt-1 text-amber-200/80">
        Adjusted seconds cap each inactivity gap at 90 s; visible seconds are wall-clock while on screen.
      </p>
      <div className="mt-2 space-y-1.5">
        {rows.map(({ concept, byPath }) => (
          <div key={concept.id}>
            <p className="font-bold text-amber-200">{concept.id}</p>
            {byPath.size === 0 ? (
              <p className="text-amber-200/60">no Learn evidence yet</p>
            ) : (
              [...byPath.entries()].map(([path, value]) => (
                <p key={path} className={path.startsWith('0/2') ? 'text-rose-200' : 'text-amber-100/80'}>
                  {path} · n={value.n} · adjusted {Math.round(value.elapsed / value.n)}s avg · visible{' '}
                  {Math.round(value.visible / value.n)}s avg
                </p>
              ))
            )}
          </div>
        ))}
      </div>
    </section>
  );
};
