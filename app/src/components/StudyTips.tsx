import { useCallback, useEffect, useRef, useState } from 'react';
import { Lightbulb, X } from 'lucide-react';

/**
 * Small, dismissible study reminders (`components/StudyTips.tsx`).
 *
 * These are deliberately not a modal, a tour, or a focus target: one card in the lower-left corner,
 * after the learner has been still for a while, and gone on its own. The point is a useful nudge
 * while reading, not an interruption to click through.
 */

export interface StudyTip {
  id: string;
  text: string;
}

export const STUDY_TIPS: readonly StudyTip[] = [
  {
    id: 'not-first-time',
    text: 'It’s ok to not understand the first time. Keep reading and use alternative resources until you get it, AI should be the last resort.',
  },
  {
    id: 'explain-back',
    text: 'Close the tab and explain the idea out loud in one sentence. If a word goes missing, that is the part to revisit.',
  },
  {
    id: 'tiny-experiment',
    text: 'Change one value in the example and predict the output before you run it. A surprising result is a free lesson.',
  },
  {
    id: 'sleep-on-it',
    text: 'Stuck for ten minutes? Write the exact question down, then take a short break. Your brain keeps sorting it in the background.',
  },
  {
    id: 'name-the-unknown',
    text: 'Before reading the answer, name what you already know and what you still need. Curiosity works better with a target.',
  },
  {
    id: 'errors-are-clues',
    text: 'An error message is not a verdict on you. Read the last line first; it usually names the exact thing Python could not do.',
  },
  {
    id: 'one-more-minute',
    text: 'You do not need a two-hour block. One more small idea today is how a hard subject becomes ordinary.',
  },
  {
    id: 'use-your-words',
    text: 'If the lesson uses a word you could not define, stop and define it in your own words. Jargon hides the missing step.',
  },
];

const FIRST_DELAY_MS = 35_000;
const REPEAT_MS = 150_000;
const IDLE_BEFORE_TIP_MS = 20_000;
const VISIBLE_MS = 18_000;
const MAX_TIPS_PER_SESSION = 3;

/** Pick a different tip from the one just shown, deterministic when a random function is passed. */
export function pickStudyTip(previousId: string | null, random: () => number = Math.random): StudyTip {
  const pool = previousId ? STUDY_TIPS.filter((tip) => tip.id !== previousId) : STUDY_TIPS;
  const index = Math.min(pool.length - 1, Math.max(0, Math.floor(random() * pool.length)));
  return pool[index];
}

function isTyping(): boolean {
  const active = document.activeElement;
  if (!active) return false;
  const tag = active.tagName.toLowerCase();
  return (
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    (active as HTMLElement).isContentEditable
  );
}

export function StudyTips() {
  const [tip, setTip] = useState<StudyTip | null>(null);
  const lastTip = useRef<string | null>(null);
  const lastActivity = useRef(Date.now());
  const shown = useRef(0);
  const hideTimer = useRef<number | null>(null);

  const dismiss = useCallback(() => {
    setTip(null);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = null;
  }, []);

  useEffect(() => {
    const noteActivity = () => {
      lastActivity.current = Date.now();
    };
    window.addEventListener('pointerdown', noteActivity, true);
    window.addEventListener('keydown', noteActivity, true);
    window.addEventListener('scroll', noteActivity, true);

    const show = () => {
      if (document.visibilityState !== 'visible' || isTyping()) return;
      if (Date.now() - lastActivity.current < IDLE_BEFORE_TIP_MS) return;
      if (shown.current >= MAX_TIPS_PER_SESSION) return;
      const next = pickStudyTip(lastTip.current);
      lastTip.current = next.id;
      shown.current += 1;
      setTip(next);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      hideTimer.current = window.setTimeout(() => setTip(null), VISIBLE_MS);
    };

    const first = window.setTimeout(show, FIRST_DELAY_MS);
    const repeat = window.setInterval(show, REPEAT_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(repeat);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      window.removeEventListener('pointerdown', noteActivity, true);
      window.removeEventListener('keydown', noteActivity, true);
      window.removeEventListener('scroll', noteActivity, true);
    };
  }, []);

  if (!tip) return null;

  return (
    <aside
      role="status"
      aria-live="polite"
      data-testid="study-tip"
      data-tip-id={tip.id}
      className="fixed bottom-20 left-4 z-40 max-w-[min(21rem,calc(100vw-2rem))] rounded-[var(--r-lg)] border border-line bg-panel p-3 shadow-lg sm:bottom-4"
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-[var(--r-sm)] border border-line bg-panel-2 text-accent">
          <Lightbulb className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            Study note
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-body">{tip.text}</p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss study tip"
          className="grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded text-faint hover:bg-raise hover:text-ink"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
