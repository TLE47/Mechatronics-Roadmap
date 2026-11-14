import React, { useEffect, useState } from 'react';
import { CheckCircle2, ChevronDown, Square } from 'lucide-react';

/**
 * The self-done checklist beside the pass mark (`runner/SelfDoneChecklist.tsx`).
 *
 * A pass proves the code behaves; it does not say whether the learner got there themselves. That is
 * the difference this project keeps insisting on — `verifiedLessons` is what the harness proved, and
 * `completedLessons` is the learner's own word — so the one place the learner is looking when a
 * lesson finishes is where they should be able to say it: the mark that reads PASS carries the
 * checklist that turns it into "PASS, and I did it unaided".
 *
 * Three questions, because they are the three ways a pass stops being the learner's own work: reading
 * the solution, spending a hint, and being told the answer. Ticking all three sets the lesson's
 * self-marked flag through `toggleLessonSelfMarked`, which is the store the roadmap, the counts and the
 * account sync already use; unticking one clears it again. The ticks themselves are kept per lesson in
 * `localStorage` so the checklist survives a reload mid-answer, while the outcome travels the same way
 * every other flag does.
 */

export const SELF_DONE_KEY = 'mechalab_self_done_ticks_v1';

export const SELF_DONE_ITEMS = [
  { id: 'solo', label: 'I wrote this without opening the solution' },
  { id: 'hints', label: 'I did not spend a hint on this lesson' },
  { id: 'alone', label: 'Nobody and nothing else told me the answer' },
] as const;

export type SelfDoneTicks = Record<string, boolean[]>;

function blank(): boolean[] {
  return SELF_DONE_ITEMS.map(() => false);
}

export function readSelfDoneTicks(): SelfDoneTicks {
  try {
    const raw = localStorage.getItem(SELF_DONE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object') return {};
    const store: SelfDoneTicks = {};
    for (const [lesson, ticks] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(ticks) && ticks.length === SELF_DONE_ITEMS.length) {
        store[lesson] = ticks.map((tick) => Boolean(tick));
      }
    }
    return store;
  } catch {
    return {};
  }
}

export function writeSelfDoneTicks(next: SelfDoneTicks): void {
  try {
    localStorage.setItem(SELF_DONE_KEY, JSON.stringify(next));
  } catch {
    // Blocked storage leaves the checklist for the visit; the flag itself still travels.
  }
}

export function SelfDoneChecklist({
  lessonId,
  marked,
  onChange,
}: {
  lessonId: string;
  /** The lesson's self-marked flag, from the store the parent owns. */
  marked: boolean;
  /** Flip that flag. Called with the checklist's verdict, so the store and the ticks agree. */
  onChange: (next: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [ticks, setTicks] = useState<boolean[]>(() => readSelfDoneTicks()[lessonId] ?? blank());

  // A new lesson is a new answer: the panel shows that lesson's own ticks, never the last one's.
  useEffect(() => {
    setTicks(readSelfDoneTicks()[lessonId] ?? blank());
    setOpen(false);
  }, [lessonId]);

  const done = ticks.filter(Boolean).length;

  const toggle = (index: number) => {
    const next = ticks.map((tick, at) => (at === index ? !tick : tick));
    setTicks(next);
    const store = readSelfDoneTicks();
    store[lessonId] = next;
    writeSelfDoneTicks(store);
    // The last tick is the answer; the first untick takes the claim back.
    const all = next.every(Boolean);
    if (all !== marked) onChange(all);
  };

  return (
    <div className="flex min-w-0 items-center gap-1">
      <button
        type="button"
        data-testid="btn-self-done"
        data-self-done={marked ? 'yes' : 'no'}
        aria-expanded={open}
        title={
          marked
            ? 'You marked this lesson done without help — open to change it'
            : 'Finished it yourself? Say what you did not use'
        }
        onClick={() => setOpen((shown) => !shown)}
        className={`flex min-h-8 shrink-0 items-center gap-1 rounded border px-2 py-1 font-mono text-[12px] font-bold cursor-pointer ${
          marked
            ? 'border-emerald/50 bg-emerald/10 text-emerald hover:bg-emerald/20'
            : 'border-line bg-canvas text-muted hover:text-body'
        }`}
      >
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
        Self-done {done}/{SELF_DONE_ITEMS.length}
        <ChevronDown
          className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div
          data-testid="self-done-checklist"
          className="absolute z-30 mt-1 w-[290px] translate-y-full rounded-lg border border-line bg-panel p-2.5 shadow-xl"
          style={{ transform: 'translateY(0)' }}
        >
          <p className="text-[11.5px] font-semibold text-body">Done without help?</p>
          <p className="mt-0.5 text-[11px] text-muted">
            A pass says the code works. These say the work was yours.
          </p>
          <ul className="mt-1.5 space-y-1">
            {SELF_DONE_ITEMS.map((item, index) => (
              <li key={item.id}>
                <button
                  type="button"
                  data-testid={`self-done-item-${item.id}`}
                  aria-pressed={ticks[index]}
                  onClick={() => toggle(index)}
                  className="flex w-full cursor-pointer items-start gap-1.5 rounded px-1 py-0.5 text-left text-[11.5px] text-body hover:bg-raise"
                >
                  {ticks[index] ? (
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald" aria-hidden="true" />
                  ) : (
                    <Square className="mt-0.5 h-3.5 w-3.5 shrink-0 text-faint" aria-hidden="true" />
                  )}
                  <span>{item.label}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <span data-testid="self-done-state" className="font-mono text-[11px] text-muted">
              {marked ? 'Marked self-done' : done === SELF_DONE_ITEMS.length ? 'Ready to mark' : `${done} of ${SELF_DONE_ITEMS.length}`}
            </span>
            <button
              type="button"
              data-testid="btn-self-done-mark"
              onClick={() => onChange(!marked)}
              className="rounded border border-line bg-canvas px-2 py-0.5 font-mono text-[11px] font-semibold text-body cursor-pointer hover:bg-raise"
            >
              {marked ? 'Clear the mark' : 'Mark self-done'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
