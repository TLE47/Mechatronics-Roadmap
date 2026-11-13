import React from 'react';
import { toast } from 'sonner';

/**
 * The toast rules (`app/src/toastPolicy.ts`).
 *
 * sonner owns the stack, the live region and the dismissal; what is the app's is *policy* — how long
 * a kind of card stays, and where it sits. Before this file each caller passed its own duration and
 * position, so a pass and an award could land in the same corner with different beats. Two surfaces
 * now share one table.
 *
 * The card's markup stays the app's (`toast.custom(…, { unstyled: true })`): a toast here is a
 * certificate with words a learner reads, not a library notification.
 */
export type ToastKind = 'award' | 'pass' | 'undo' | 'error';

interface ToastRule {
  duration: number;
  position: 'bottom-right' | 'bottom-center';
}

export const TOAST_RULES: Record<ToastKind, ToastRule> = {
  /** The certificate for a new award: corner, six seconds, out of the reading column. */
  award: { duration: 6000, position: 'bottom-right' },
  /** A verified lesson: centre-bottom, where the editor's run bar was. */
  pass: { duration: 6000, position: 'bottom-center' },
  /** An action that can be taken back: long enough to read the sentence and reach it. */
  undo: { duration: 8000, position: 'bottom-center' },
  /** Something failed: the longest hold, because it is the one that asks to be re-read. */
  error: { duration: 9000, position: 'bottom-center' },
};

/** The app's own card in the library's stack, under that kind's rule. Returns the id to dismiss it. */
export function showCard(
  kind: ToastKind,
  render: (id: string | number) => React.ReactElement
): string | number {
  const rule = TOAST_RULES[kind];
  return toast.custom(render, { duration: rule.duration, position: rule.position, unstyled: true });
}

export function dismissCard(id: string | number): void {
  toast.dismiss(id);
}

/**
 * An undo row: sonner's own card (it is a sentence and a button, not a certificate), the app's words.
 *
 * `duration` is the undo rule's, because an action nobody can reach in time is not an undo.
 */
export function showUndo(message: string, onUndo: () => void): void {
  toast(message, {
    duration: TOAST_RULES.undo.duration,
    action: { label: 'Undo', onClick: onUndo },
  });
}
