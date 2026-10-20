import React from 'react';
import {
  START_HERE_HEADING,
  START_HERE_LESSON_URL,
  START_HERE_LINK_LABEL,
  START_HERE_NOTE,
} from '../startHere';

/**
 * The README's first block, on the landing screen. Same heading, same Lesson 1 path, same promise;
 * the link opens a new tab so the runner and the guide below stay where the learner left them.
 */
export const StartHereCard: React.FC = () => (
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
