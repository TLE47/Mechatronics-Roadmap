import React from 'react';
import { CircleAlert, Factory } from 'lucide-react';
import { STORY_SEEN_KEY } from '../../story.ts';

// Re-exported for the suites that already import it from the card; the key itself lives in a plain
// module so a Node test never has to load a TSX file.
export { STORY_SEEN_KEY };

export interface StoryCardProps {
  onStartLesson: () => void;
  onDismiss: () => void;
}

const BEATS: { where: string; line: string }[] = [
  {
    where: '09:02',
    line: 'Your badge beeps red. “Your role has been optimized. Thank you for your contribution.”',
  },
  {
    where: 'The rain',
    line: 'Behind a recycling station: a robot slumped against a wall, its right arm cut clean at the shoulder.',
  },
  {
    where: 'The trail',
    line: 'A thin dark thread of oil crosses the wet street, under the rail arch, to a steel door.',
  },
  {
    where: 'The bench',
    line: 'Painted on the door: THE LAST HANDS · WE CHECK THE MACHINE. Inside, a dead board and a blinking recorder.',
  },
];

/**
 * The prologue, as a card (`app/src/components/game/StoryCard.tsx`).
 *
 * The plan's most valuable job is done here, before anything else: a first-timer is told, in
 * writing, that the starter code is designed to fail, so the red result on their first Run reads as
 * “the lesson is working” rather than “I broke it”.
 *
 * It is a card and not a cutscene on purpose. A first visit already has the tour; a second overlay
 * would be two things asking for the same attention, and the tour is the one that teaches the
 * interface. This one is skippable, remembered, and never stands between the learner and P.1.
 */
export const StoryCard: React.FC<StoryCardProps> = ({ onStartLesson, onDismiss }) => {
  return (
    <section
      data-testid="prologue"
      aria-labelledby="prologue-heading"
      className="rounded-[var(--r-md)] border p-4"
      style={{
        borderColor: 'color-mix(in srgb, var(--accent) 35%, transparent)',
        backgroundColor: 'var(--panel)',
      }}
    >
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h2
          id="prologue-heading"
          className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide"
          style={{ color: 'var(--accent)' }}
        >
          <Factory className="h-3.5 w-3.5" aria-hidden="true" />
          The Last Hands
        </h2>
        <span className="text-[11px]" style={{ color: 'var(--dim)' }}>
          the story in four lines
        </span>
      </div>

      <ol className="mt-2 space-y-1.5">
        {BEATS.map((beat) => (
          <li key={beat.where} className="flex gap-2">
            <span
              className="w-16 shrink-0 text-[11px] uppercase tracking-wide"
              style={{ color: 'var(--dim)' }}
            >
              {beat.where}
            </span>
            <span className="text-[12.5px] leading-snug" style={{ color: 'var(--body)' }}>
              {beat.line}
            </span>
          </li>
        ))}
      </ol>

      <div
        className="mt-3 flex items-start gap-2 rounded-[var(--r-sm)] border px-2.5 py-2"
        style={{
          borderColor: 'color-mix(in srgb, var(--amber) 45%, transparent)',
          backgroundColor: 'color-mix(in srgb, var(--amber) 10%, transparent)',
        }}
        data-testid="prologue-red-warning"
      >
        <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" style={{ color: 'var(--amber)' }} />
        <p className="text-[12px] leading-snug" style={{ color: 'var(--body)' }}>
          <strong style={{ color: 'var(--text)' }}>Your first Run will fail. That is the starter, not you.</strong>{' '}
          The code ships with the work deliberately unfinished, and the checks are supposed to be red until
          you finish it.
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onStartLesson}
          data-testid="btn-prologue-start"
          className="cursor-pointer rounded-[var(--r-sm)] px-3 py-1.5 text-[12px] font-bold"
          style={{ backgroundColor: 'var(--accent)', color: 'var(--inverse)' }}
        >
          Start Mission 1
        </button>
        <button
          type="button"
          onClick={onDismiss}
          data-testid="btn-prologue-dismiss"
          className="cursor-pointer text-[12px] underline underline-offset-4"
          style={{ color: 'var(--muted)' }}
        >
          Not now
        </button>
      </div>
    </section>
  );
};
