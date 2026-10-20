import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import {
  START_HERE_HEADING,
  START_HERE_LESSON_URL,
  START_HERE_LINK_LABEL,
  START_HERE_NOTE,
} from '../startHere';

interface StartHereCardProps {
  /** Lesson 1 has been executed and passed; the block then closes to a single line. */
  lessonOneVerified?: boolean;
}

/**
 * The README's first block, on the landing screen. Same heading, same Lesson 1 path, same promise;
 * the link opens a new tab so the runner and the guide below stay where the learner left them.
 *
 * A newcomer sees all three lines. Once Lesson 1 is verified the block is no longer news, so it
 * collapses to one line that still names the lesson and keeps the link - nothing is lost, and a
 * returning learner is not made to scroll past a first-timer's banner.
 */
export const StartHereCard: React.FC<StartHereCardProps> = ({ lessonOneVerified = false }) => {
  if (lessonOneVerified) {
    return (
      <section
        data-testid="start-here"
        data-collapsed="true"
        className="bg-[#06281f]/60 border border-[#34d399]/30 rounded-lg px-4 py-2 flex flex-wrap items-center gap-x-3 gap-y-1"
      >
        <span className="flex items-center gap-1.5 text-xs font-semibold text-[#34d399]">
          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
          Lesson 1 verified
        </span>
        <span aria-hidden="true" className="text-[#475569]">
          ·
        </span>
        <h2 className="text-xs font-normal text-[#94a3b8]">{START_HERE_HEADING}</h2>
        <a
          data-testid="start-here-lesson-link"
          href={START_HERE_LESSON_URL}
          target="_blank"
          rel="noreferrer"
          className="ml-auto text-xs font-semibold text-[#34d399] hover:text-[#6ee7b7] underline underline-offset-4 break-words"
        >
          {START_HERE_LINK_LABEL}
        </a>
      </section>
    );
  }

  return (
    <section
      data-testid="start-here"
      className="bg-[#06281f] border border-[#34d399]/50 rounded-xl px-5 py-4"
    >
      <h2 className="text-base font-bold text-[#f1f5f9]">{START_HERE_HEADING}</h2>
      <a
        data-testid="start-here-lesson-link"
        href={START_HERE_LESSON_URL}
        target="_blank"
        rel="noreferrer"
        className="inline-block mt-1 text-sm font-semibold text-[#34d399] hover:text-[#6ee7b7] underline underline-offset-4 break-words"
      >
        {START_HERE_LINK_LABEL}
      </a>
      <p className="text-xs text-[#cbd5e1] mt-1">{START_HERE_NOTE}</p>
    </section>
  );
};
