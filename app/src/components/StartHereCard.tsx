import React from 'react';
import { ArrowRight, CheckCircle2, ExternalLink, Play, X } from 'lucide-react';
import { HeroArm } from './HeroArm';
import {
  START_HERE_HEADING,
  START_HERE_DEFINITION,
  START_HERE_LESSON_URL,
  START_HERE_LINK_LABEL,
  START_HERE_NOTE,
  START_HERE_RUN_LABEL,
} from '../startHere';

interface StartHereCardProps {
  /** Lesson 1 has been executed and passed; the block then closes to a single line. */
  lessonOneVerified?: boolean;
  /**
   * Dismisses the collapsed line for good. Only the collapsed state offers this: a newcomer still
   * needs the full block, and the roadmap tab carries the control that brings it back.
   */
  onDismiss?: () => void;
  /** Selects Lesson 1 in the editor below and scrolls to it; the reading link stays on GitHub. */
  onStartLesson?: () => void;
}

/**
 * The README's first block, on the landing screen - and the only screen a stranger sees first.
 *
 * It carries the same heading, Lesson 1 path and promise as README.md, because a generated copy
 * that drifted from the front page was the bug this block exists to prevent. What it adds is the
 * argument the text cannot make by itself: the arm, running. The canvas is the course's own
 * figure-8 capstone, so the picture is a demonstration rather than an illustration.
 *
 * Two doors, because they do different jobs: the GitHub page is the reading copy, and the workbench
 * below is where the code is typed, run and verified. The run door is the only primary button; the
 * reading link is a quiet second line, so a first-timer has one obvious move.
 *
 * A newcomer sees the whole hero. Once Lesson 1 is verified the block is no longer news, so it
 * collapses to one line that still names the lesson and keeps the link - nothing is lost, and a
 * returning learner is not made to scroll past a first-timer's banner.
 */
export const StartHereCard: React.FC<StartHereCardProps> = ({
  lessonOneVerified = false,
  onDismiss,
  onStartLesson,
}) => {
  if (lessonOneVerified) {
    return (
      <section
        data-testid="start-here"
        data-collapsed="true"
        className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--r-md)] border px-4 py-2"
        style={{
          borderColor: 'color-mix(in srgb, var(--emerald) 40%, transparent)',
          backgroundColor: 'color-mix(in srgb, var(--emerald) 8%, transparent)',
        }}
      >
        <span
          className="flex items-center gap-1.5 text-[12px] font-semibold"
          style={{ color: 'var(--emerald)' }}
        >
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          Lesson 1 verified
        </span>
        <span aria-hidden="true" style={{ color: 'var(--dim)' }}>
          ·
        </span>
        <h2 className="text-[12px] font-normal" style={{ color: 'var(--muted)' }}>
          {START_HERE_HEADING}
        </h2>
        <div className="ml-auto flex items-center gap-2.5">
          <a
            data-testid="start-here-lesson-link"
            href={START_HERE_LESSON_URL}
            target="_blank"
            rel="noreferrer"
            className="break-words text-[12px] font-semibold underline underline-offset-4"
            style={{ color: 'var(--emerald)' }}
          >
            {START_HERE_LINK_LABEL}
          </a>
          {onDismiss && (
            <button
              onClick={onDismiss}
              data-testid="btn-dismiss-start-here"
              title="Hide this line. The roadmap tab can bring it back."
              aria-label="Dismiss the Start here line"
              className="cursor-pointer rounded-[var(--r-sm)] border border-transparent p-1 transition-colors hover:border-[var(--border)]"
              style={{ color: 'var(--dim)' }}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      </section>
    );
  }

  return (
    <section
      data-testid="start-here"
      className="relative overflow-hidden rounded-[var(--r-xl)] border"
      style={{
        borderColor: 'var(--border)',
        background:
          'radial-gradient(900px 420px at 8% -20%, rgba(56,189,248,0.16), transparent 62%), linear-gradient(160deg, var(--panel) 0%, var(--bg) 78%)',
        boxShadow: 'var(--shadow-md)',
      }}
    >
      <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_minmax(280px,420px)] lg:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="chip" style={{ color: 'var(--emerald)', borderColor: 'var(--border-strong)' }}>
              $0 hardware
            </span>
            <span className="chip" style={{ borderColor: 'var(--border-strong)' }}>
              runs in this browser
            </span>
            <span className="chip" style={{ borderColor: 'var(--border-strong)' }}>
              no account
            </span>
          </div>

          <h1
            className="mt-4 font-bold tracking-tight"
            style={{ fontSize: 'var(--step-3)', lineHeight: 'var(--lh-tight)', color: 'var(--text)' }}
          >
            {START_HERE_HEADING}
          </h1>

          <p
            data-testid="start-here-definition"
            className="mt-3"
            style={{ fontSize: 'var(--step-0)', lineHeight: 1.6, color: 'var(--muted)', maxWidth: 'var(--measure)' }}
          >
            {START_HERE_DEFINITION}
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
            {onStartLesson && (
              <button
                onClick={onStartLesson}
                data-testid="btn-start-here-run"
                title="Selects Lesson 1 in the editor below. This is where the code runs; the GitHub page is for reading."
                className="btn btn-primary animate-fade-up px-4 py-2.5 text-[14px]"
                style={{ boxShadow: '0 10px 30px rgba(56,189,248,0.28)' }}
              >
                <Play className="h-4 w-4 fill-current" aria-hidden="true" />
                {START_HERE_RUN_LABEL}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
            <a
              data-testid="start-here-lesson-link"
              href={START_HERE_LESSON_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold underline decoration-dotted underline-offset-4"
              style={{ color: 'var(--emerald)' }}
            >
              {START_HERE_LINK_LABEL}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>

          <p
            data-testid="start-here-note"
            className="mt-3 border-l-2 pl-3 text-[12px] leading-relaxed"
            style={{ color: 'var(--dim)', borderColor: 'var(--border-strong)' }}
          >
            {START_HERE_NOTE}
          </p>
        </div>

        {/* The proof: the capstone's figure-8, drawn live. Hidden on the narrowest screens, where
            the copy and the one button matter more than the animation. */}
        <div className="relative hidden min-w-0 lg:block">
          <div
            className="overflow-hidden rounded-[var(--r-lg)] border"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--panel-2)' }}
          >
            <HeroArm className="block h-[240px] w-full" />
          </div>
          <p
            className="mt-2 flex items-center justify-between gap-2 text-[11px]"
            style={{ color: 'var(--dim)' }}
          >
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: 'var(--emerald)' }}
                aria-hidden="true"
              />
              live simulation · no install
            </span>
            <span style={{ color: 'var(--muted)' }}>the Step 10 capstone</span>
          </p>
        </div>
      </div>
    </section>
  );
};
