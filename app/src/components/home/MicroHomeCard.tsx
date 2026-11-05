import React, { useEffect, useState } from 'react';
import { ArrowRight, Brain, Clock3 } from 'lucide-react';
import type { TabId } from '../../types';
import { readMicroStore } from '../../micro/store';
import { readMicroEnabled, writeMicroEnabled, MICRO_SETTINGS_EVENT } from '../../micro/settings';

export interface MicroHomeCardProps {
  onOpenTab: (id: TabId) => void;
}

/**
 * Home's micro-learning door (`components/home/MicroHomeCard.tsx`).
 *
 * The beta switch lives here as well as inside the tab, because a switch that hides its own tab
 * needs one permanent door back. Reading the store is a tiny localStorage parse; the catalogue and
 * the engine stay in the lazy tab.
 */
export const MicroHomeCard: React.FC<MicroHomeCardProps> = ({ onOpenTab }) => {
  const [enabled, setEnabled] = useState<boolean>(() => readMicroEnabled());
  const [due, setDue] = useState<number>(() => {
    const result = readMicroStore();
    const now = Date.now();
    return Object.values(result.store.concepts).filter((state) => state.dueAt !== null && state.dueAt <= now).length;
  });

  useEffect(() => {
    const sync = () => setEnabled(readMicroEnabled());
    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key.startsWith('mechalab_micro_')) {
        sync();
        const result = readMicroStore();
        const now = Date.now();
        setDue(Object.values(result.store.concepts).filter((state) => state.dueAt !== null && state.dueAt <= now).length);
      }
    };
    window.addEventListener(MICRO_SETTINGS_EVENT, sync);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(MICRO_SETTINGS_EVENT, sync);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const toggle = () => {
    const next = !enabled;
    writeMicroEnabled(next);
    setEnabled(next);
  };

  return (
    <section className="rounded-xl border border-line bg-panel p-4 space-y-2.5" data-testid="home-micro">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-ink">
          <Brain className="h-4 w-4 text-accent" aria-hidden="true" />
          Micro-learning
          <span className="rounded-full border border-accent/40 bg-accent-soft px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-[0.1em] text-accent">
            beta
          </span>
        </h2>
        <button
          type="button"
          onClick={toggle}
          data-testid="home-micro-toggle"
          aria-pressed={enabled}
          className="rounded-md border border-line bg-canvas px-2 py-1 text-[12px] font-semibold text-muted hover:text-ink"
        >
          {enabled ? 'Hide from tabs' : 'Show in tabs'}
        </button>
      </div>
      <p className="text-xs text-muted">
        Seven P.1 concepts in about two minutes each. One idea, two diagnostics, then a review that
        actually schedules itself. Progress stays in this browser.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-md border border-line-soft bg-canvas px-2 py-1 font-mono text-[11px] text-muted">
          <Clock3 className="h-3 w-3" aria-hidden="true" />
          {due} due now
        </span>
        {enabled ? (
          <button
            type="button"
            onClick={() => onOpenTab('tab-micro')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-bold text-inverse hover:bg-accent/80"
            data-testid="home-micro-open"
          >
            Open micro-learning
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : (
          <span className="text-[11px] text-faint">Hidden from the rail. Your stored progress is untouched.</span>
        )}
      </div>
    </section>
  );
};
