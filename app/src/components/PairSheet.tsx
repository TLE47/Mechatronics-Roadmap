import React, { useEffect, useRef, useState } from 'react';
import { ClipboardCopy, Link2, Send, Users, X } from 'lucide-react';
import { attemptLines, lessonLabel, pairSummary } from '../pairing';
import type { PairSession } from '../usePairSession';

interface PairSheetProps {
  session: PairSession;
  /** The lesson on screen, so an attempt sent from here says which one it is. */
  lesson: string;
  /** The editor's text, sent only when the learner presses Send. */
  code: string;
  /** The live document, when the two of you are editing one file (`app/src/collab.ts`). */
  coEdit: { lesson: string; role: 'host' | 'guest'; remote: number } | null;
  /** Their offer to co-edit, waiting on this learner's decision. */
  collabInvite: { lesson: string; text: string } | null;
  /** Why co-editing is not running any more, when it was. */
  collabNotice: string | null;
  onStartCoEdit: () => void;
  onAcceptCoEdit: () => void;
  onDeclineCoEdit: () => void;
  onStopCoEdit: () => void;
  onClose: () => void;
  /** Called after a send, so the runner's status line can say it too. */
  onSent?: (lines: number) => void;
}

/**
 * Pair study (`app/src/components/PairSheet.tsx`).
 *
 * Two people, one lesson, no server. The transport is a direct WebRTC data channel and the signalling
 * is **by hand**: the host copies an invitation, the guest sends a reply, the host pastes it back, and
 * from then on the two workbenches talk to each other and to nobody else
 * ([`usePairSession.ts`](../usePairSession.ts), [`pairing.ts`](../pairing.ts)).
 *
 * Three things this sheet is careful about:
 *
 * 1. **It says what it is.** "Nothing goes through a server. The two code lines are the connection."
 *    A learner who thinks they joined a room would be wrong about who can see their work; the sheet
 *    does not let them be.
 * 2. **An attempt is offered, never applied.** Sending is a button here; receiving lands in the
 *    runner as a card that names the line count and waits for **Load their code** — the same rule the
 *    share link already follows, because it is the same thing: someone else's draft arriving in
 *    yours.
 * 3. **A failure is a sentence, not a spinner.** No ICE servers means a session across some networks
 *    cannot connect; the status line says so instead of waiting quietly.
 */
export const PairSheet: React.FC<PairSheetProps> = ({
  session,
  lesson,
  code,
  coEdit,
  collabInvite,
  collabNotice,
  onStartCoEdit,
  onAcceptCoEdit,
  onDeclineCoEdit,
  onStopCoEdit,
  onClose,
  onSent,
}) => {
  const [stage, setStage] = useState<'idle' | 'join'>('idle');
  const [invitationDraft, setInvitationDraft] = useState('');
  const [replyDraft, setReplyDraft] = useState('');
  const [copied, setCopied] = useState<'invitation' | 'reply' | null>(null);
  const [sent, setSent] = useState<number | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const { state } = session;

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const copy = async (text: string, which: 'invitation' | 'reply') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
    } catch {
      setCopied(null);
    }
  };

  const send = () => {
    const result = session.sendAttempt(lesson, code);
    if (result === 'sent') {
      const lines = attemptLines(code);
      setSent(lines);
      onSent?.(lines);
    } else {
      setSent(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/65 p-4 pt-[8vh] max-sm:items-end max-sm:p-0 max-sm:pt-0"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pair-title"
        data-testid="pair-sheet"
        className="flex max-h-[84vh] w-full max-w-xl flex-col overflow-hidden rounded-[var(--r-lg)] border shadow-2xl max-sm:max-h-[92dvh] max-sm:rounded-b-none max-sm:rounded-t-2xl max-sm:border-x-0 max-sm:border-b-0 max-sm:pb-[env(safe-area-inset-bottom)]"
        style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border-strong)' }}
      >
        <div
          className="flex items-center justify-between gap-3 border-b px-4 py-3"
          style={{ borderColor: 'var(--border)' }}
        >
          <h2
            id="pair-title"
            className="flex items-center gap-2 text-[13.5px] font-semibold"
            style={{ color: 'var(--text)' }}
          >
            <Users className="h-4 w-4 shrink-0" style={{ color: 'var(--accent)' }} aria-hidden="true" />
            Pair study
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            data-testid="btn-close-pair"
            aria-label="Close the pair session"
            className="btn"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Close</span>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <p className="text-[11.5px]" style={{ color: 'var(--dim)' }}>
            Two workbenches, directly — nothing goes through a server. You carry one code each way: the
            invitation, then the reply. After that the two pages talk to each other and to nobody else.
            This app has no relay, so a session across a restrictive network may not connect.
            Co-editing is the same channel with the editors joined up: one document, both screens.
          </p>

          {collabInvite && (
            <div
              data-testid="coedit-invite"
              className="mt-3 rounded border px-3 py-2"
              style={{ borderColor: 'var(--accent)', backgroundColor: 'var(--bg)' }}
            >
              <p className="text-[12px] font-semibold" style={{ color: 'var(--text)' }}>
                They want to co-edit {lessonLabel(collabInvite.lesson)} with you.
              </p>
              <p className="mt-1 text-[11px]" style={{ color: 'var(--dim)' }}>
                Accepting replaces what is in your editor with theirs ({attemptLines(collabInvite.text)}{' '}
                lines). After that every keystroke of yours is on their screen and every one of theirs
                is on yours — and ⌘Z still only undoes what you typed.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  data-testid="btn-coedit-accept"
                  onClick={onAcceptCoEdit}
                  className="btn btn-primary px-3 py-1.5 text-[12px]"
                >
                  Accept and co-edit
                </button>
                <button
                  type="button"
                  data-testid="btn-coedit-decline"
                  onClick={onDeclineCoEdit}
                  className="btn px-3 py-1.5 text-[12px]"
                >
                  Not now
                </button>
              </div>
            </div>
          )}

          {state === 'idle' && stage === 'idle' && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                data-testid="btn-pair-start"
                onClick={() => {
                  setInvitationDraft('');
                  session.start();
                }}
                className="btn btn-primary px-3 py-1.5 text-[12px]"
              >
                Start a session
              </button>
              <button
                type="button"
                data-testid="btn-pair-join"
                onClick={() => setStage('join')}
                className="btn px-3 py-1.5 text-[12px]"
              >
                Join a session
              </button>
            </div>
          )}

          {(state === 'idle' || state === 'joining') && stage === 'join' && !session.reply && (
            <div className="mt-3 space-y-2">
              <label className="block text-[11px] font-mono" htmlFor="pair-invitation" style={{ color: 'var(--muted)' }}>
                Paste their invitation
              </label>
              <textarea
                id="pair-invitation"
                data-testid="input-pair-invitation"
                value={invitationDraft}
                onChange={(event) => setInvitationDraft(event.target.value)}
                rows={3}
                className="w-full resize-y rounded border px-2 py-1.5 font-mono text-[10.5px]"
                style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }}
              />
              <button
                type="button"
                data-testid="btn-pair-make-reply"
                onClick={() => {
                  setReplyDraft('');
                  session.join(invitationDraft);
                }}
                className="btn px-3 py-1.5 text-[12px]"
              >
                Make the reply
              </button>
            </div>
          )}

          {state === 'offering' && (
            <div className="mt-3 space-y-2">
              <p className="text-[11px] font-mono" style={{ color: 'var(--muted)' }}>
                Send this invitation to the other person — any way you already talk.
              </p>
              <textarea
                readOnly
                data-testid="pair-invitation-text"
                value={session.invitation}
                rows={3}
                className="w-full resize-y rounded border px-2 py-1.5 font-mono text-[10.5px]"
                style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }}
              />
              <button
                type="button"
                data-testid="btn-pair-copy-invitation"
                disabled={!session.invitation}
                onClick={() => void copy(session.invitation, 'invitation')}
                className="flex cursor-pointer items-center gap-1.5 rounded border px-2.5 py-1 font-mono text-[11px]"
                style={{ borderColor: 'var(--border-strong)', color: 'var(--text)' }}
              >
                <ClipboardCopy className="h-3.5 w-3.5" aria-hidden="true" />
                {copied === 'invitation' ? 'Invitation copied' : 'Copy invitation'}
              </button>
              <label className="mt-2 block text-[11px] font-mono" htmlFor="pair-reply" style={{ color: 'var(--muted)' }}>
                Paste their reply
              </label>
              <textarea
                id="pair-reply"
                data-testid="input-pair-reply"
                value={replyDraft}
                onChange={(event) => setReplyDraft(event.target.value)}
                rows={3}
                className="w-full resize-y rounded border px-2 py-1.5 font-mono text-[10.5px]"
                style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }}
              />
              <button
                type="button"
                data-testid="btn-pair-accept"
                onClick={() => session.accept(replyDraft)}
                className="btn px-3 py-1.5 text-[12px]"
              >
                Connect
              </button>
            </div>
          )}

          {state === 'joining' && session.reply && (
            <div className="mt-3 space-y-2">
              <p className="text-[11px] font-mono" style={{ color: 'var(--muted)' }}>
                Send this reply back. The session opens on both sides as soon as they connect.
              </p>
              <textarea
                readOnly
                data-testid="pair-reply-text"
                value={session.reply}
                rows={3}
                className="w-full resize-y rounded border px-2 py-1.5 font-mono text-[10.5px]"
                style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }}
              />
              <button
                type="button"
                data-testid="btn-pair-copy-reply"
                onClick={() => void copy(session.reply, 'reply')}
                className="flex cursor-pointer items-center gap-1.5 rounded border px-2.5 py-1 font-mono text-[11px]"
                style={{ borderColor: 'var(--border-strong)', color: 'var(--text)' }}
              >
                <ClipboardCopy className="h-3.5 w-3.5" aria-hidden="true" />
                {copied === 'reply' ? 'Reply copied' : 'Copy reply'}
              </button>
            </div>
          )}

          {state === 'connected' && (
            <div className="mt-3 space-y-2">
              <p className="text-[12px]" style={{ color: 'var(--text)' }} data-testid="pair-connected">
                Connected{session.peer ? ` to ${session.peer}` : ''}.
                {session.peerLesson ? ` They are on ${session.peerLesson}.` : ''}
              </p>
              <p className="text-[11px]" style={{ color: 'var(--dim)' }}>
                Sending carries this lesson (<strong>{lesson}</strong>) and the editor&rsquo;s text —{' '}
                {attemptLines(code)} lines. It arrives on their screen as a card, not in their editor.
              </p>
              {coEdit ? (
                <div
                  data-testid="pair-coedit-active"
                  className="rounded border px-3 py-2"
                  style={{ borderColor: 'var(--border-strong)', backgroundColor: 'var(--bg)' }}
                >
                  <p className="text-[12px]" style={{ color: 'var(--text)' }}>
                    Co-editing {lessonLabel(coEdit.lesson)}.{' '}
                    {coEdit.remote === 0
                      ? 'Nothing from them yet.'
                      : `${coEdit.remote} edits from them so far.`}
                  </p>
                  <p className="mt-1 text-[11px]" style={{ color: 'var(--dim)' }}>
                    One document, both screens. Undo is yours alone: ⌘Z steps back through what you
                    typed, never through what they did.
                  </p>
                  <button
                    type="button"
                    data-testid="btn-coedit-stop"
                    onClick={onStopCoEdit}
                    className="btn mt-2 px-3 py-1.5 text-[12px]"
                  >
                    Stop co-editing
                  </button>
                </div>
              ) : session.role === 'host' ? (
                <div>
                  <button
                    type="button"
                    data-testid="btn-coedit-start"
                    onClick={onStartCoEdit}
                    className="btn btn-primary px-3 py-1.5 text-[12px]"
                  >
                    Co-edit together
                  </button>
                  <p className="mt-1 text-[11px]" style={{ color: 'var(--dim)' }}>
                    Both editors become this one document, live. What is in your editor is what you
                    both start from, so their editor is replaced — they are asked first, and ⌘Z stays
                    each person&rsquo;s own.
                  </p>
                </div>
              ) : (
                <p className="text-[11px]" data-testid="coedit-waiting" style={{ color: 'var(--dim)' }}>
                  They can offer to co-edit this lesson whenever they like. It is your choice then,
                  and your editor does not change until you accept.
                </p>
              )}
              {!coEdit && collabNotice && (
                <p className="text-[11px]" data-testid="pair-coedit-notice" style={{ color: 'var(--muted)' }}>
                  {collabNotice}
                </p>
              )}
              <button
                type="button"
                data-testid="btn-pair-send-attempt"
                onClick={send}
                className="btn btn-primary flex items-center gap-1.5 px-3 py-1.5 text-[12px]"
              >
                <Send className="h-3.5 w-3.5" aria-hidden="true" />
                Send my attempt
              </button>
              {sent !== null && (
                <p data-testid="pair-sent" className="text-[11px]" style={{ color: 'var(--emerald)' }}>
                  Sent {sent} lines.
                </p>
              )}
              <button
                type="button"
                data-testid="btn-pair-leave"
                onClick={session.leave}
                className="btn px-3 py-1.5 text-[12px]"
              >
                Leave the session
              </button>
            </div>
          )}
        </div>

        <div
          className="flex items-center justify-between gap-2 border-t px-4 py-2"
          style={{ borderColor: 'var(--border)' }}
        >
          <p
            role="status"
            data-testid="pair-status"
            className="text-[11px]"
            style={{
              color:
                state === 'error'
                  ? 'var(--rose)'
                  : state === 'connected'
                    ? 'var(--emerald)'
                    : 'var(--dim)',
            }}
          >
            {session.error ?? pairSummary(state, session.peer)}
          </p>
          <span className="flex items-center gap-1 font-mono text-[10.5px]" style={{ color: 'var(--faint)' }}>
            <Link2 className="h-3 w-3" aria-hidden="true" />
            {session.you}
          </span>
        </div>
      </div>
    </div>
  );
};
