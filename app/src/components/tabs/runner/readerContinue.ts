import type { WorkspaceLayout } from '../../../workspaceLayout';

/**
 * Where the lesson page goes next (`components/tabs/runner/readerContinue.ts`).
 *
 * The reader ends with one quiet pill, and what it says is a decision about the preset rather than
 * about the page: Study has finished the reading half, so it continues into Read; Read has finished
 * the page, so it continues into Write. Reading the page is preparation for writing the code, not a
 * doorway into the next lesson's text.
 *
 * Pure and separate from the tab because the tab has a line budget and this is a decision, not
 * chrome: the same three strings are what a test can pin without a browser.
 */
export interface ReaderContinue {
  label: string;
  title: string;
  onClick: () => void;
}

export function readerContinue(
  layout: WorkspaceLayout,
  chooseLayout: (layout: WorkspaceLayout) => void
): ReaderContinue | null {
  if (layout === 'read') {
    return {
      label: 'Continue to Write',
      title: 'Open Write: the draft, its prediction and its checks, with the page put away',
      onClick: () => chooseLayout('write'),
    };
  }
  return {
    label: 'Continue to Read',
    title:
      'Open Read: the whole page, with the editor bar folded above it so Run and the code stay one press away',
    onClick: () => chooseLayout('read'),
  };
}
