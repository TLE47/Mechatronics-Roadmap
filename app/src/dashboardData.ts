/**
 * The learner dashboard's contents, computed rather than read off a live component.
 *
 * Keeping this pure means the dashboard can be tested with plain objects and cannot drift from the
 * counts the workbench already shows: the same maps feed both. It also makes "the dashboard is a home
 * base, not a gate" checkable — nothing here writes, requires a session, or hides the workbench.
 */

export interface DashboardLessonRef {
  id: string;
  title: string;
}

export interface DashboardStudyLesson {
  note: string;
  highlights: { quote: string }[];
  /** Last write, when the caller has it (`studyNotes.ts` does): Home orders the notebook by it. */
  updatedAt?: number;
}

export type DashboardStudy = Record<string, DashboardStudyLesson>;

export interface DashboardEvent {
  t: number;
  kind: string;
  lesson?: string;
}

export interface DashboardInput {
  lessons: readonly DashboardLessonRef[];
  verified: Record<string, boolean>;
  completed: Record<string, boolean>;
  milestones: Record<string, boolean>;
  /** From `lessonOffer`: the lesson to resume or the first gap, never a re-do. */
  continueLesson: { id: string; reason: 'resume' | 'next' } | null;
  drafts: Record<string, string>;
  study: DashboardStudy;
  events: readonly DashboardEvent[];
  dueCards: number;
  account: {
    email: string | null;
    workspaceSync: boolean;
    syncNote: string;
    conflicts: number;
  };
}

export interface DashboardDraftRow {
  id: string;
  title: string;
  chars: number;
}

export interface DashboardModel {
  continueLesson:
    | (DashboardLessonRef & { reason: 'resume' | 'next'; hasDraft: boolean; chars: number })
    | null;
  progress: {
    verified: number;
    completed: number;
    milestones: number;
    totalLessons: number;
  };
  recent: { id: string; title: string; at: number; kind: string }[];
  saved: DashboardDraftRow[];
  study: { notes: number; highlights: number };
  review: { due: number };
  account: DashboardInput['account'];
}

const RECENT_LIMIT = 5;

export function buildDashboard(input: DashboardInput): DashboardModel {
  const title = new Map(input.lessons.map((lesson) => [lesson.id, lesson.title]));
  const continueRef = input.continueLesson;
  const draft = continueRef ? input.drafts[continueRef.id] ?? '' : '';

  const recent: DashboardModel['recent'] = [];
  const seen = new Set<string>();
  for (let i = input.events.length - 1; i >= 0 && recent.length < RECENT_LIMIT; i -= 1) {
    const event = input.events[i];
    if (!event.lesson) continue;
    const known = title.get(event.lesson);
    if (!known) continue;
    // A run, a hint and a verification on one lesson is one recent lesson, not three rows.
    if (seen.has(event.lesson)) continue;
    seen.add(event.lesson);
    recent.push({ id: event.lesson, title: known, at: event.t, kind: event.kind });
  }

  const saved: DashboardDraftRow[] = Object.entries(input.drafts)
    .filter(([, text]) => text.trim().length > 0)
    .map(([id, text]) => ({ id, title: title.get(id) ?? id, chars: text.length }))
    .sort((a, b) => b.chars - a.chars);

  const studyLessons = Object.values(input.study);
  return {
    continueLesson: continueRef
      ? {
          id: continueRef.id,
          title: title.get(continueRef.id) ?? continueRef.id,
          reason: continueRef.reason,
          hasDraft: draft.trim().length > 0,
          chars: draft.length,
        }
      : null,
    progress: {
      verified: countTrue(input.verified),
      completed: countTrue(input.completed),
      milestones: countTrue(input.milestones),
      totalLessons: input.lessons.length,
    },
    recent,
    saved,
    study: {
      notes: studyLessons.filter((lesson) => lesson.note.trim().length > 0).length,
      highlights: studyLessons.reduce((total, lesson) => total + lesson.highlights.length, 0),
    },
    review: { due: Math.max(0, Math.floor(input.dueCards)) },
    account: input.account,
  };
}

function countTrue(map: Record<string, boolean>): number {
  return Object.values(map).filter(Boolean).length;
}
