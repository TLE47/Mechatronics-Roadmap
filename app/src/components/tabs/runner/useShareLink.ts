/**
 * The Share press, and what the line under the toolbar says about it
 * (`runner/useShareLink.ts`).
 *
 * The codec decides whether a link is possible at all (`app/src/shareLink.ts`): an empty editor has
 * nothing to send, and a program that would make a 2,000+ character URL is refused rather than
 * pasted into a chat that will cut it in half. The status is five outcomes — copied, no code, too
 * long, copied by hand, loaded — and every one of them is a sentence the learner reads, so they live
 * next to the press that produces them instead of in the tab.
 *
 * `readCode` is a function, not a string: a link made from the render's text would name code the
 * learner has already changed.
 */
import { useState } from 'react';
import { shareUrl } from '../../../shareLink';

/** What the Share button last did, so the line under the toolbar can say it. */
export type ShareStatus =
  | { kind: 'idle' }
  | { kind: 'copied'; characters: number }
  | { kind: 'no-code' }
  | { kind: 'too-long'; characters: number }
  | { kind: 'failed'; url: string }
  | { kind: 'loaded' };

interface UseShareLinkInput {
  lessonId: string;
  readCode: () => string;
}

export interface ShareLink {
  status: ShareStatus;
  share: () => Promise<void>;
  /** A lesson change forgets the last press: it described code that is no longer on screen. */
  reset: () => void;
  /** A shared attempt was adopted, which is the one other thing the line reports. */
  loaded: () => void;
}

export function useShareLink({ lessonId, readCode }: UseShareLinkInput): ShareLink {
  const [status, setStatus] = useState<ShareStatus>({ kind: 'idle' });

  const share = async () => {
    const result = shareUrl(window.location.href, { lesson: lessonId, code: readCode() });
    if (!result.ok) {
      setStatus(
        result.reason === 'too-long'
          ? { kind: 'too-long', characters: result.characters }
          : { kind: 'no-code' }
      );
      return;
    }
    try {
      await navigator.clipboard.writeText(result.url);
      setStatus({ kind: 'copied', characters: result.characters });
    } catch {
      // The clipboard refused, but the URL exists: print it so it can still be copied by hand.
      setStatus({ kind: 'failed', url: result.url });
    }
  };

  return {
    status,
    share,
    reset: () => setStatus({ kind: 'idle' }),
    loaded: () => setStatus({ kind: 'loaded' }),
  };
}
