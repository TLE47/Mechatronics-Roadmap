import type { WorkspaceLayout } from '../../../workspaceLayout';

/**
 * Where the lesson page goes next, and the way back (`components/tabs/runner/readerContinue.ts`).
 *
 * The reader ends with a quiet pill on the right, and what it says is a decision about the preset
 * rather than about the page: Study has finished the reading half, so it continues into Read; Read
 * has finished the page, so it continues into Write. Reading the page is preparation for writing the
 * code, not a doorway into the next lesson's text.
 *
 * **Read also has a way back.** Read hides the editor and the chooser, so a learner who followed
 * "Continue to Write" but only wanted to re-read the start of the page had no route to Study short of
 * the layout chips in the header. The left-hand pill is the mirror of the right one, and Study —
 * which never left the page — has no left-hand pill at all: a control that returns to where you are
 * is not a control.
 *
 * Pure and separate from the tab because the tab has a line budget and this is a decision, not
 * chrome: the same strings are what a test can pin without a browser.
 */
export interface ReaderContinue {
  label: string;
  title: string;
  onClick: () => void;
}

export interface ReaderNavigation {
  /** The quiet pill at the right: the next scope of this page. */
  next: ReaderContinue;
  /** The quiet pill at the left: back to the scope this one came from, when there is one. */
  back: ReaderContinue | null;
}

/**
 * The two props the reader takes, ready to spread.
 *
 * `TabPyodideRunner` is at its line budget, and the back pill is not a reason to raise it: spreading
 * one object keeps the call site the single line it was.
 */
export function readerNavigation(
  layout: WorkspaceLayout,
  chooseLayout: (layout: WorkspaceLayout) => void
): {
  continueAction: ReaderContinue;
  backAction: ReaderContinue | null;
} {
  const navigation = readerContinue(layout, chooseLayout);
  return { continueAction: navigation.next, backAction: navigation.back };
}

export function readerContinue(
  layout: WorkspaceLayout,
  chooseLayout: (layout: WorkspaceLayout) => void
): ReaderNavigation {
  if (layout === 'read') {
    return {
      next: {
        label: 'Continue to Write',
        title: 'Open Write: the draft, its prediction and its checks, with the page put away',
        onClick: () => chooseLayout('write'),
      },
      back: {
        label: 'Back to Study',
        title: 'Return to Study: the reading half of this page beside the code',
        onClick: () => chooseLayout('study'),
      },
    };
  }
  return {
    next: {
      label: 'Continue to Read',
      title:
        'Open Read: the whole page, with the editor bar folded above it so Run and the code stay one press away',
      onClick: () => chooseLayout('read'),
    },
    back: null,
  };
}
