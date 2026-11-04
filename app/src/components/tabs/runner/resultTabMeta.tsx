import type { ReactNode } from 'react';
import { Activity, CheckSquare, GitBranch, ListChecks, Sparkles, Terminal } from 'lucide-react';
import type { EditorView } from '../../../editorPanes';

/**
 * What each result tab says (`components/tabs/runner/resultTabMeta.tsx`).
 *
 * The tab strip is a table: a view, a label, a tooltip and a glyph. It lived inline in
 * `RunnerEditorCard.tsx`, where six nested ternaries made the card read as a lookup table with a
 * body attached and cost it its size rule. The table is the whole module, and the card asks it one
 * question per tab.
 *
 * The glyphs are hidden below `sm` because a 390 px strip has room for the words, not the pictures;
 * Predict itself is hidden below `md` because the phone bar already owns that button.
 */
export interface ResultTabMeta {
  label: string;
  title: string;
  icon: ReactNode;
}

export function resultTabMeta(view: EditorView): ResultTabMeta {
  switch (view) {
    case 'predict':
      return {
        label: 'Predict',
        title:
          'The prediction gate: commit to what this will print before the run — tab here, or split it beside the code',
        icon: <Sparkles className="hidden h-3 w-3 sm:block" aria-hidden="true" />,
      };
    case 'actual':
      return {
        label: 'Run output',
        title: 'The last run’s stdout and verdict — tab here, or split it beside the code',
        icon: <Terminal className="hidden h-3 w-3 sm:block" aria-hidden="true" />,
      };
    case 'expected':
      return {
        label: 'Expected',
        title: 'The lesson’s Expected Output — tab here, or split it beside the code',
        icon: <CheckSquare className="hidden h-3 w-3 sm:block" aria-hidden="true" />,
      };
    case 'cases':
      return {
        label: 'Cases',
        title:
          'The behavioural checks, one row per substituted input, with what the last run proved',
        icon: <ListChecks className="hidden h-3 w-3 sm:block" aria-hidden="true" />,
      };
    case 'workflow':
      return {
        label: 'Workflow',
        title: 'How this problem gets solved — given, model, compute, check, with a live checklist',
        icon: <GitBranch className="hidden h-3 w-3 sm:block" aria-hidden="true" />,
      };
    case 'trace':
      return {
        label: 'Trace',
        title: 'The last run replayed line by line, with the values each frame held',
        icon: <Activity className="hidden h-3 w-3 sm:block" aria-hidden="true" />,
      };
    default:
      return { label: 'main.py', title: 'The lesson’s Python file', icon: null };
  }
}
