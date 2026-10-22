/**
 * The portfolio export (`app/src/portfolio.ts`).
 *
 * What this file is for: the workbench can hand a learner one Markdown file they can put in a
 * repository, a CV or a course submission. Until now that file was progress only — the ticks and
 * verifies — which described the *schedule* and not the learning. Notes, the passages they kept, the
 * cards they can answer and the time they actually spent are the part nobody can regenerate, so they
 * belong in the same document.
 *
 * Three rules the export keeps:
 *
 * 1. **Proportional.** A section is written only when it has content. A learner with no notes should
 *    not hand over three empty headings that read as "did nothing"; nor should a 500-card deck be
 *    pasted in whole (the first twenty are listed, with the count of the rest).
 * 2. **Plain Markdown.** No HTML, no template syntax, and every free-text block a blockquote, so a
 *    note that starts with `#` cannot turn into a heading or swallow the section after it.
 * 3. **Measured, not claimed.** The time section says where the numbers come from (sittings measured
 *    on this device) because a pilot reading the file must know what it is looking at.
 *
 * The builder is pure — it takes the stores as arguments (the caller reads them) and `now` — so
 * `scripts/test_portfolio.mjs` can pin the document without a browser.
 */

// Explicit extensions: this module is loaded by Node's type stripping in the unit suite, which does not
// resolve an extensionless relative import the way Vite does.
import { PYTHON_LESSONS } from './data/pythonLessonsData.ts';
import {
  LEVEL_0_STEPS,
  TIER_1_LINEAR_PASS,
  TIER_2_LINEAR_PASS,
  TIER_3_LINEAR_PASS,
} from './curriculumData.ts';
import { SPINE_STEP_COUNT, stepForMilestone } from './spine.ts';
import type { StudyStore } from './studyNotes.ts';
import { cardStatus } from './fsrs.ts';
import type { StudyCard } from './studyCards.ts';
import { formatDuration, sittingTotals, type Sitting } from './sittingClock.ts';

/** How many cards and sittings the document lists before it starts summarising. */
export const MAX_LISTED_CARDS = 20;
export const MAX_LISTED_SITTINGS = 8;

export interface PortfolioExtras {
  /** Per-lesson notes and highlights, as the notes store holds them. */
  study?: StudyStore;
  /** The review deck, as the card store derives it. */
  cards?: StudyCard[];
  /** Measured sittings, oldest first. */
  sittings?: Sitting[];
  /**
   * The Python tab's own name, supplied by the caller: the registry that owns it imports JSON, which
   * Node's type stripping cannot load, and this module has to stay loadable by the unit suite. The
   * app passes `PYTHON_TAB_NAME`, so the document still says the one name (`check_tab_names.py`).
   */
  pythonTabName?: string;
  now?: number;
}

/** A quote on one line, so a stored passage cannot break the list it sits in. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** A note as a blockquote: no heading can escape from it, and its own line breaks survive. */
function quoted(text: string): string[] {
  return text
    .split('\n')
    .map((line) => `> ${line}`.trimEnd());
}

function lessonTitle(id: string): string {
  return PYTHON_LESSONS.find((lesson) => lesson.id === id)?.title ?? id;
}

/** Study notes and highlights, one `###` per lesson, in registry order. */
function notesSection(study: StudyStore): string[] | null {
  const entries = Object.entries(study).filter(
    ([, entry]) => entry.note.trim() || entry.highlights.length > 0
  );
  if (entries.length === 0) return null;
  const order = (id: string) => {
    const index = PYTHON_LESSONS.findIndex((lesson) => lesson.id === id);
    return index === -1 ? PYTHON_LESSONS.length : index;
  };
  entries.sort(([left], [right]) => order(left) - order(right) || left.localeCompare(right));

  const lines: string[] = [];
  for (const [id, entry] of entries) {
    lines.push(`### Lesson ${id} — ${oneLine(lessonTitle(id))}`, '');
    if (entry.note.trim()) {
      lines.push('**Note**', '', ...quoted(entry.note.trim()), '');
    }
    if (entry.highlights.length) {
      lines.push('**Kept passages**', '');
      for (const highlight of entry.highlights) {
        const comment = oneLine(highlight.comment);
        lines.push(`- “${oneLine(highlight.quote)}”${comment ? ` — ${comment}` : ''}`);
      }
      lines.push('');
    }
  }
  return lines;
}

/** The deck: how much is due, when the next card comes back, and the first twenty cards. */
function deckSection(cards: StudyCard[], now: number): string[] | null {
  if (cards.length === 0) return null;
  const due = cards.filter((card) => card.schedule.due <= now);
  const next = cards.reduce(
    (soonest, card) => Math.min(soonest, card.schedule.due),
    Number.POSITIVE_INFINITY
  );
  const lines = [
    `- **Cards:** ${cards.length} · **Due now:** ${due.length} · **Next card:** ${
      due.length ? 'due now' : formatWait(next - now)
    }`,
    '',
  ];
  for (const card of cards.slice(0, MAX_LISTED_CARDS)) {
    const status = cardStatus(card.schedule, now);
    lines.push(
      `- “${oneLine(card.quote)}” — lesson ${card.lesson} · ${
        status.reviewed ? `seen ${card.schedule.reps}×` : 'not answered yet'
      } · ${status.dueInDays === 0 ? 'due now' : `in ${status.dueInDays} day${status.dueInDays === 1 ? '' : 's'}`}`
    );
  }
  if (cards.length > MAX_LISTED_CARDS) {
    lines.push('', `_…and ${cards.length - MAX_LISTED_CARDS} more cards, not listed._`);
  }
  return lines;
}

/** "in 4 days" / "due now" for a card that is scheduled ahead. */
function formatWait(ms: number): string {
  const days = Math.round(ms / 86_400_000);
  if (days <= 0) return 'due now';
  return `in ${days} day${days === 1 ? '' : 's'}`;
}

/** Measured time: the totals the pilot quotes, then the most recent sittings as a table. */
function timeSection(sittings: Sitting[], now: number): string[] | null {
  if (sittings.length === 0) return null;
  const totals = sittingTotals(sittings, now);
  const lines = [
    `- **Sittings:** ${totals.count} · **Total:** ${formatDuration(totals.totalMs)} · **Median:** ${formatDuration(
      totals.medianMs
    )} · **Longest:** ${formatDuration(totals.longestMs)}`,
    '',
    '_Measured on this device: a sitting ends after five minutes without a run or an answer, and is capped at three hours._',
    '',
    '| Date | Minutes | Runs | Reviews | Lessons |',
    '| :--- | ---: | ---: | ---: | :--- |',
  ];
  for (const sitting of sittings.slice(-MAX_LISTED_SITTINGS)) {
    const date = new Date(sitting.start).toISOString().slice(0, 10);
    const minutes = Math.max(0, Math.round((sitting.end - sitting.start) / 60_000));
    const lessons = sitting.lessons.length
      ? `${sitting.lessons.slice(0, 3).join(', ')}${sitting.lessons.length > 3 ? ` +${sitting.lessons.length - 3}` : ''}`
      : '—';
    lines.push(`| ${date} | ${minutes} | ${sitting.runs} | ${sitting.reviews} | ${lessons} |`);
  }
  return lines;
}

/**
 * The whole document.
 *
 * The first three sections are the progress record, unchanged: verified lessons, self-marked lessons
 * and roadmap milestones. The next three are added only when the caller passes the stores and they
 * have something in them, which is what keeps a fresh browser's export to one page.
 */
export function buildPortfolioMarkdown(
  verifiedLessons: Record<string, boolean>,
  completedLessons: Record<string, boolean>,
  completedMilestones: Record<string, boolean>,
  extras: PortfolioExtras = {}
): string {
  const now = extras.now ?? Date.now();
  const allSteps = [
    ...LEVEL_0_STEPS,
    ...TIER_1_LINEAR_PASS,
    ...TIER_2_LINEAR_PASS,
    ...TIER_3_LINEAR_PASS,
  ];
  const verifiedPy = PYTHON_LESSONS.filter((l) => verifiedLessons[l.id]);
  const selfMarkedPy = PYTHON_LESSONS.filter((l) => completedLessons[l.id] && !verifiedLessons[l.id]);
  const totalSelfMarkedPy = PYTHON_LESSONS.filter((l) => completedLessons[l.id]).length;
  const passedMilestones = allSteps.filter((s) => completedMilestones[s.milestoneId]);

  const study = extras.study ?? {};
  const noteLessons = Object.values(study).filter(
    (entry) => entry.note.trim() || entry.highlights.length > 0
  ).length;
  const highlightCount = Object.values(study).reduce(
    (total, entry) => total + entry.highlights.length,
    0
  );
  const cards = extras.cards ?? [];
  const sittings = extras.sittings ?? [];
  // The extra sections are proportional: no notes, no cards and no sittings means the learner gets the
  // progress record alone, not three empty headings that read as "did nothing".
  const measured = noteLessons + highlightCount + cards.length + sittings.length > 0;

  const lines: string[] = [
    '# MechaLab — Learner Progress & Portfolio Summary',
    '',
    `- **Generated:** ${new Date(now).toISOString().slice(0, 10)}`,
    `- **Execution-Verified In-Browser Python Lessons (Executed & Passed in Pyodide WASM):** ${verifiedPy.length} / ${PYTHON_LESSONS.length}`,
    `- **Self-Marked Completed Python Lessons (Manual Checklist):** ${totalSelfMarkedPy} / ${PYTHON_LESSONS.length}`,
    `- **Self-Reported Roadmap Track Milestones:** ${passedMilestones.length} / ${allSteps.length}`,
  ];
  if (measured) {
    lines.push(
      `- **Study notes:** ${noteLessons} lesson${noteLessons === 1 ? '' : 's'} · **Kept passages:** ${highlightCount} · **Review cards:** ${cards.length}`,
      `- **Measured study time:** ${formatDuration(sittingTotals(sittings, now).totalMs)} across ${sittings.length} sitting${sittings.length === 1 ? '' : 's'}`
    );
  }
  lines.push('', '## 1. Execution-Verified Python Exercises (Executed & Passed in Pyodide WASM)', '');

  if (verifiedPy.length === 0) {
    lines.push(`_No Python lessons have been executed and passed in Pyodide WASM yet. Open ${extras.pythonTabName ?? 'Python'} and click "Run & Verify Output" to execute your first entry._`);
  } else {
    for (const l of verifiedPy) {
      lines.push(`- [x] **Lesson ${l.id} (${l.title})** — \`${l.path}\` *(Executed & Passed in Pyodide WASM)*`);
    }
  }

  lines.push('', '## 2. Self-Marked Completed Python Lessons (Manual Checklist, Not Yet Executed in WASM)', '');
  if (selfMarkedPy.length === 0) {
    lines.push('_No additional lessons self-marked complete without Pyodide execution._');
  } else {
    for (const l of selfMarkedPy) {
      lines.push(`- [x] **Lesson ${l.id} (${l.title})** — \`${l.path}\` *(Self-Marked Complete)*`);
    }
  }

  lines.push('', '## 3. Self-Reported Ten-Step Track Milestones', '');
  if (passedMilestones.length === 0) {
    lines.push('_No track milestones checked off yet. Use the Roadmap & Progress tab to track your pass completion._');
  } else {
    for (const s of passedMilestones) {
      // The spine's number and title, so the export names a step the pages also name.
      const at = stepForMilestone(s.milestoneId);
      lines.push(
        `- [x] **Step ${at?.number ?? '?'} of ${SPINE_STEP_COUNT} · ${at?.title ?? s.trackTitle}** — ${s.deliverableGate}`
      );
    }
  }

  const notes = notesSection(study);
  if (notes) lines.push('', '## 4. Study Notes and Kept Passages', '', ...notes);

  const deck = deckSection(cards, now);
  if (deck) lines.push('', '## 5. Review Deck (FSRS-5)', '', ...deck);

  const time = timeSection(sittings, now);
  if (time) lines.push('', '## 6. Measured Study Time', '', ...time);

  lines.push(
    '',
    '---',
    '*Exported from [MechaLab Beginner-First Mechatronics & Robotics Workbench](https://tle47.github.io/Mechatronics-Roadmap/)*'
  );
  return lines.join('\n');
}
