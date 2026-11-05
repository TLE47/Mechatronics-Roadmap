import React, { useEffect, useState } from 'react';
import { ArrowRight, Brain, Clock3, Sparkles } from 'lucide-react';
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
    <section className="space-y-3 rounded-2xl border border-accent/30 bg-gradient-to-br from-panel via-panel to-accent/5 p-5 shadow-sm" data-testid="home-micro">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-accent/15 text-accent">
            <Brain className="h-5 w-5" aria-hidden="true" />
          </span>
          Micro-learning
          <span className="rounded-full border border-accent/40 bg-accent-soft px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.1em] text-accent">
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
      <p className="text-[14px] leading-relaxed text-muted">
        Seven P.1 ideas in about two minutes each. Follow one curious question, test it twice, then
        let a review bring it back tomorrow. Progress stays in this browser.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-md border border-line-soft bg-canvas px-2 py-1 font-mono text-[11px] text-muted">
          <Clock3 className="h-3 w-3" aria-hidden="true" />
          {due} due now
        </span>
        <span className="inline-flex items-center gap-1 rounded-md border border-emerald/30 bg-emerald/5 px-2 py-1 font-mono text-[11px] text-emerald">
          <Sparkles className="h-3 w-3" aria-hidden="true" /> small steps count
        </span>
        {enabled ? (
          <button
            type="button"
            onClick={() => onOpenTab('tab-micro')}
            className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-3.5 py-2 text-[13px] font-bold text-inverse shadow-sm hover:bg-accent/80"
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
