/**
 * What Home says, computed instead of read off a live component (`app/src/homeData.ts`).
 *
 * The dashboard's old model answered "what have I done?"; Home also has to answer "what is the
 * smallest next thing?" and "where am I on the route?". Those are joins — mission → spine step →
 * entry, study note → lesson title — and a join is worth testing with plain objects rather than a
 * browser. Nothing here writes, reads `localStorage`, or imports React, so the same numbers can be
 * asserted in `scripts/test_home.mjs`.
 */

import type { ReadingPosition } from './readingPosition.ts';
import { entriesAtDepth, SPINE } from './spine.ts';
import { missionCheckLabel, nextMission } from './gamification/missions.ts';
import type { DashboardStudy } from './dashboardData.ts';

export interface HomeLessonRef {
  id: string;
  title: string;
}

export interface HomeToday {
  kind: 'mission' | 'complete';
  /** The mission's own name, e.g. "Make the Joint Move". Empty when every mission is verified. */
  missionName: string;
  /** The spine's own number, read from `SPINE` — never a second count of the route. */
  step: number;
  stepTitle: string;
  /** The first entry of that mission still unverified, or null when there is nothing left. */
  entryId: string | null;
  entryTitle: string | null;
  verified: number;
  total: number;
  /** `3 of 4 checks`, or a sentence for the end state. */
  label: string;
}

export interface HomeRouteStep {
  number: number;
  title: string;
  verified: number;
  total: number;
}

export interface HomeNoteRow {
  id: string;
  title: string;
  /** The note, or the first highlight when only a quote was saved: one line to recognise it by. */
  snippet: string;
  hasNote: boolean;
  highlights: number;
  updatedAt: number;
}

export interface HomeReading {
  lessonId: string;
  title: string;
  /** The heading the reader stopped at, as words: `idea 1 law of cosines`. */
  stoppedAt: string | null;
}

export interface HomeInput {
  lessons: readonly HomeLessonRef[];
  verified: Record<string, boolean>;
  study: DashboardStudy;
  continueLesson: { id: string; reason: 'resume' | 'next' } | null;
  reading: Record<string, ReadingPosition>;
}

export interface HomeModel {
  today: HomeToday;
  route: HomeRouteStep[];
  notes: HomeNoteRow[];
  reading: HomeReading | null;
}

/** How much of a note fits on one Home row before the page's own link is the place to read it. */
export const NOTE_SNIPPET_CHARS = 160;
/** Home lists the newest few; the full notebook is one page away. */
export const HOME_NOTES = 3;

function clip(text: string, limit = NOTE_SNIPPET_CHARS): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > limit ? `${flat.slice(0, limit - 1).trimEnd()}…` : flat;
}

/** `idea-1-law-of-cosines` → `idea 1 law of cosines`: a heading, not a URL fragment. */
export function anchorWords(anchor: string): string | null {
  const words = anchor.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return words || null;
}

export function buildHome(input: HomeInput): HomeModel {
  const titles = new Map(input.lessons.map((lesson) => [lesson.id, lesson.title]));

  const mission = nextMission(input.verified);
  let today: HomeToday;
  if (mission) {
    const entry = mission.entries.find((candidate) => !input.verified[candidate.id]) ?? null;
    today = {
      kind: 'mission',
      missionName: mission.mission.name,
      step: mission.step.number,
      stepTitle: mission.step.title,
      entryId: entry?.id ?? null,
      entryTitle: entry?.title ?? null,
      verified: mission.verifiedCount,
      total: mission.total,
      label: missionCheckLabel(mission),
    };
  } else {
    const last = SPINE[SPINE.length - 1];
    today = {
      kind: 'complete',
      missionName: '',
      step: last.number,
      stepTitle: last.title,
      entryId: null,
      entryTitle: null,
      verified: 0,
      total: 0,
      label: 'Every mission is verified — the capstone is the last build.',
    };
  }

  const route = SPINE.map((step) => {
    const entries = entriesAtDepth(step, 'tier1');
    return {
      number: step.number,
      title: step.title,
      verified: entries.filter((entry) => !!input.verified[entry.id]).length,
      total: entries.length,
    };
  });

  const notes: HomeNoteRow[] = Object.entries(input.study)
    .map(([id, lesson]) => {
      const note = (lesson.note ?? '').trim();
      const highlights = lesson.highlights ?? [];
      // A study note written before the stamp existed carries none; it sorts last, never throws.
      const updatedAt =
        typeof lesson.updatedAt === 'number' && Number.isFinite(lesson.updatedAt)
          ? lesson.updatedAt
          : 0;
      return {
        id,
        title: titles.get(id) ?? id,
        snippet: note ? clip(note) : clip(highlights[0]?.quote ?? ''),
        hasNote: note.length > 0,
        highlights: highlights.length,
        updatedAt,
      };
    })
    .filter((row) => row.hasNote || row.highlights > 0)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, HOME_NOTES);

  const continueId = input.continueLesson?.id ?? null;
  const position = continueId ? input.reading[continueId] : undefined;
  const reading: HomeReading | null = continueId
    ? {
        lessonId: continueId,
        title: titles.get(continueId) ?? continueId,
        stoppedAt: position ? anchorWords(position.anchor) : null,
      }
    : null;

  return { today, route, notes, reading };
}
