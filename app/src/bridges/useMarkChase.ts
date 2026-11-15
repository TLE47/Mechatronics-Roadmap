/**
 * The "land on the mark" loop, as a hook (`app/src/bridges/useMarkChase.ts`).
 *
 * The shell draws it; this keeps the parts a drawing cannot be trusted with: which rung the learner
 * is on, whether the number is close enough *this* rung, and the fact that a landing must not fire
 * again while the value is still inside the tolerance it just hit. P.9 learned that the hard way
 * with a drag that hovered on a mark and counted itself every frame.
 *
 * The sound rule is the repository's, not this file's: `readMuted` starts muted, `bridgeAudio`
 * refuses under reduced motion, and the context is only unlocked by the gesture that switches sound
 * on. A lesson never makes noise unasked.
 *
 * One landing advances the shared ladder (`bridgeMark.ts`), so five hits on P.12 and five hits on
 * S0.6 are the same ladder, the same persistence and the same arpeggio.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { LabMark } from './bridgeLab.ts';
import { readMark, writeMark, clearMark, onMark, stepAt, targetAt, toleranceAt } from './bridgeMark.ts';
import { readMuted, writeMuted } from './bridgeChase.ts';
import { tick, unlock } from './bridgeAudio.ts';

export interface MarkControls {
  /** The rung's target, or NaN when the lab has no mark. */
  target: number;
  /** 0-based rung of the ladder. */
  step: number;
  /** How many landings this visitor has. */
  hits: number;
  /** The best run reached. */
  best: number;
  /** What the live region says after a landing; empty before the first. */
  announcement: string;
  /** True while the reader has sound switched off, which is the default. */
  muted: boolean;
  toggleSound: () => void;
  reset: () => void;
  format: (target: number) => string;
}

const DEFAULT_FORMAT = (target: number) => target.toFixed(2);

export function useMarkChase(mark: LabMark | undefined, value: number): MarkControls {
  const [hits, setHits] = useState(() => readMark().marks);
  const [best, setBest] = useState(() => readMark().best);
  const [announcement, setAnnouncement] = useState('');
  const [muted, setMuted] = useState(() => readMuted());

  /* Armed means "the value has left the last landing", so a drag that rests on a mark scores once.
   * It starts disarmed: a card whose dial already rests on the first rung when it paints (P.9's
   * answer dial sits on 63.2 % at one time constant) must not count that as a landing the learner
   * earned. Only a move out of the window and back into it scores. */
  const armed = useRef(false);
  const ladder = mark?.ladder ?? [];
  const step = ladder.length > 0 ? stepAt(ladder, hits) : 0;
  const target = ladder.length > 0 ? targetAt(ladder, hits) : Number.NaN;
  const tolerance = mark ? toleranceAt(mark.tolerance, step) : 0;
  const format = mark?.format ?? DEFAULT_FORMAT;

  useEffect(() => {
    if (!mark || ladder.length === 0) return;
    if (!armed.current) {
      if (Math.abs(value - target) > tolerance * 2.5) armed.current = true;
      return;
    }
    if (!onMark(value, target, tolerance)) return;

    armed.current = false;
    const next = hits + 1;
    const nextBest = Math.max(next, best);
    writeMark({ marks: next, best: nextBest });
    setHits(next);
    setBest(nextBest);
    const finished = stepAt(ladder, next) === 0;
    tick(finished ? 'done' : 'mark', readMuted());
    setAnnouncement(`landed ${format(target)} — ${finished ? 'ladder complete' : `${next} landed`}`);
  }, [value, mark, ladder.length, target, tolerance, hits, best, format]);

  const toggleSound = useCallback(() => {
    setMuted((previous) => {
      const next = !previous;
      writeMuted(next);
      if (!next) unlock(false);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    clearMark();
    setHits(0);
    setBest(0);
    setAnnouncement('ladder reset');
  }, []);

  return { target, step, hits, best, announcement, muted, toggleSound, reset, format };
}
