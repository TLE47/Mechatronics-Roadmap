/**
 * Everything `⌘K` can reach, built from the same registries the screens render.
 *
 * The palette does not keep its own copy of the course: lessons come from `pythonLessonsData`
 * (generated from the pages by `scripts/generate_python_lessons_data.py`) and tabs from the tab
 * rail's own metadata. Add a lesson or rename a tab and the palette follows on the next build,
 * which is why there is no per-item maintenance here.
 */

// The `.ts` extensions are for Node's type stripping (`scripts/test_palette.mjs`), the same way
// `spine.ts` imports its data: no bundler, no resolution rules beyond what the files say.
import { PYTHON_LESSONS } from './data/pythonLessonsData.ts';
import type { PythonLessonItem } from './data/pythonLessonsData.ts';
import type { PaletteItem } from './palette.ts';
import type { TabId } from './types.ts';
import { trackLabel } from './trackLabel.ts';

/** The fields the palette needs from a tab; `WORKBENCH_TABS` satisfies this structurally. */
export interface PaletteTabMeta {
  id: TabId;
  beginnerLabel: string;
  beginnerSubtitle: string;
  technicalLabel: string;
  technicalSubtitle: string;
}

/** What a command in the palette is called, and what it is for. The `id` is the contract. */
export const PALETTE_ACTIONS: PaletteItem[] = [
  {
    id: 'action-run-lesson',
    kind: 'action',
    label: 'Run the lesson in the editor',
    detail: '⌘↵',
    keywords: 'execute verify test play start',
  },
  {
    id: 'action-format-file',
    kind: 'action',
    label: 'Format the file with Black',
    detail: 'indent & style',
    keywords: 'tidy pretty reindent spacing pep8 style clean',
  },
  {
    id: 'action-toggle-theme',
    kind: 'action',
    label: 'Toggle light / dark theme',
    keywords: 'appearance colour color night day contrast',
  },
  {
    id: 'action-beginner-view',
    kind: 'action',
    label: 'Switch to Beginner View',
    detail: 'Plain-English labels',
    keywords: 'simple beginner plain mode',
  },
  {
    id: 'action-advanced-view',
    kind: 'action',
    label: 'Switch to All Labs View',
    detail: 'Technical labels',
    keywords: 'advanced technical mode',
  },
  {
    id: 'action-open-cheatsheet',
    kind: 'action',
    label: 'Open the 1-page cheat sheet',
    keywords: 'print reference sheet',
  },
  {
    id: 'action-export-portfolio',
    kind: 'action',
    label: 'Export progress as Markdown',
    detail: '.md portfolio',
    keywords: 'download certificate progress portfolio',
  },
  {
    id: 'action-export-log',
    kind: 'action',
    label: 'Export the learning log',
    detail: '.json',
    keywords: 'download json activity events',
  },
  {
    id: 'action-theme-tokens',
    kind: 'action',
    label: 'Open the theme token reference',
    keywords: 'design colours colors palette css',
  },
  {
    id: 'action-pass-level0',
    kind: 'action',
    label: 'Go to Start here (Stage 0)',
    keywords: 'roadmap level0 stage zero',
  },
  {
    id: 'action-pass-tier1',
    kind: 'action',
    label: 'Go to the Beginner pass',
    keywords: 'roadmap tier1 level one',
  },
  {
    id: 'action-pass-tier2',
    kind: 'action',
    label: 'Go to the Applied pass',
    keywords: 'roadmap tier2 level two',
  },
  {
    id: 'action-pass-tier3',
    kind: 'action',
    label: 'Go to the Advanced pass',
    keywords: 'roadmap tier3 level three',
  },
];


export function lessonPaletteItems(lessons: PythonLessonItem[] = PYTHON_LESSONS): PaletteItem[] {
  return lessons.map((lesson) => ({
    id: `lesson-${lesson.id}`,
    kind: 'lesson',
    label: `${lesson.id} · ${lesson.title}`,
    detail: `Python · ${trackLabel(lesson.track)}`,
    // The lesson's own two ideas are the words a learner half-remembers ("damping ratio"), and
    // being searchable by them is the difference between the palette and scrolling the list.
    keywords: lesson.ideas.join(' · '),
  }));
}

export function tabPaletteItems(tabs: PaletteTabMeta[]): PaletteItem[] {
  return tabs.map((tab) => ({
    id: `tab-${tab.id}`,
    kind: 'tab',
    label: tab.beginnerLabel,
    detail: tab.beginnerSubtitle,
    keywords: `${tab.technicalLabel} ${tab.technicalSubtitle}`,
  }));
}

/** The whole catalogue, in reading order: lessons, tabs, commands. */
export function paletteCatalog(tabs: PaletteTabMeta[], lessons: PythonLessonItem[] = PYTHON_LESSONS): PaletteItem[] {
  return [...lessonPaletteItems(lessons), ...tabPaletteItems(tabs), ...PALETTE_ACTIONS];
}
