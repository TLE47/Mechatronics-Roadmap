import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { PYTHON_LESSONS } from '../../../data/pythonLessonsData';
import type { PythonEditorHandle } from '../../PythonEditor';
import { logEvent } from '../../../learningLog';
import { reduceTour, stepAt } from '../../../tour';
import type { TourFacts, TourSignal, TourState } from '../../../tour';
import { readTour, tourOffer, writeTour } from '../../../tourState';

type PassStatus =
  | 'untested'
  | 'passed'
  | 'harness_failed'
  | 'behavior_failed'
  | 'mismatch'
  | 'stopped'
  | 'error';

interface FirstRunTourInput {
  /** The lesson on screen: the offer is judged against it, not against the first entry. */
  selectedId: string;
  code: string;
  runAttempts: Record<string, number>;
  isRunning: boolean;
  passStatus: PassStatus;
  /** Nonce the palette and the `?` sheet bump to ask for a replay. */
  tourRequest?: number;
  hasProgress: boolean;
  /** Esc belongs to a sheet while one is open, so the tour must not also close on it. */
  sheetOpen: boolean;
  runButtonRef: RefObject<HTMLButtonElement | null>;
  editorRef: RefObject<PythonEditorHandle | null>;
}

/**
 * The first-run tour (`app/src/tour.ts`, `app/src/tourState.ts`).
 *
 * The gate is the app's own state, never a click: step 3 moves when the editor text differs from the
 * text the tour found, and step 4 moves when a run has ended with a verdict. `reduceTour` owns those
 * rules; this hook only measures and forwards, so a rule lives in one place to be tested.
 */
export function useFirstRunTour({
  selectedId,
  code,
  runAttempts,
  isRunning,
  passStatus,
  tourRequest,
  hasProgress,
  sheetOpen,
  runButtonRef,
  editorRef,
}: FirstRunTourInput) {
  // Read once at mount: it records what this browser has already been shown, and only this screen
  // writes it back.
  const [tourState, setTourState] = useState<TourState>(() => readTour());
  // Whether *this visit* draws the coach mark, which is not the same question as what the record says.
  // A record left on step 4 means the learner closed the page mid-tour: that gets the chip, and the
  // card only comes back when they take it. Only a fresh record on step one opens by itself.
  const [tourOpen, setTourOpen] = useState<boolean>(() => {
    const stored = readTour();
    return stored.status === 'active' && stored.stepIndex === 0;
  });
  // The chip is either "new here" or "you were at step 4": the same control, two honest labels.
  const [tourChip, setTourChip] = useState<{ resume: boolean } | null>(null);

  const tourStep = stepAt(tourState.stepIndex);
  const tourActive = tourOpen && tourState.status === 'active';
  // What the document was when the tour reached the editor step. A draft restored from storage is not
  // an edit the learner made in this visit, and must not satisfy a step that asks them to type.
  const tourBaselineRef = useRef<string | null>(null);
  // Runs already counted when the tour started: a run from before it does not satisfy step 4.
  const tourRunBaselineRef = useRef<number>(0);
  const attemptsHereNow = runAttempts[selectedId] ?? 0;
  const tourFacts: TourFacts = {
    edited: tourBaselineRef.current !== null && code !== tourBaselineRef.current,
    runFinished: !isRunning && attemptsHereNow > tourRunBaselineRef.current,
    passed: passStatus === 'passed',
  };
  const tourFactsRef = useRef<TourFacts>(tourFacts);
  tourFactsRef.current = tourFacts;
  // A mirror of the record for the click handlers: the reducer is pure, but writing the record and
  // closing the card are two updates, and doing them inside a `setTourState` updater would run both
  // twice under StrictMode's double-invoke.
  const tourStateRef = useRef<TourState>(tourState);
  tourStateRef.current = tourState;

  const signalTour = (signal: TourSignal) => {
    const previous = tourStateRef.current;
    const next = reduceTour(previous, signal, tourFactsRef.current);
    if (next === previous) return;
    // Local only, like every other log line: this is how a pilot tells "walked it" from "closed it at
    // step two" without watching anyone (`learningLog.ts`).
    logEvent({
      kind: 'tour',
      action: next.status === 'completed' ? 'completed' : next.status === 'dismissed' ? 'skipped' : 'step',
      level: next.stepIndex + 1,
    });
    setTourState(writeTour(next));
    // Anything but "still walking" puts the card away: a dismissed and a finished tour look the same
    // on the page, and the record is what remembers which one it was.
    if (next.status !== 'active') setTourOpen(false);
  };

  /**
   * Start (or restart) the tour, with both baselines taken now.
   *
   * `resume` continues at the step the record left off at; `restart` is the replay the palette and the
   * `?` sheet ask for, which begins at step one because that is what "replay" means.
   */
  const startTour = (mode: 'restart' | 'resume' = 'restart') => {
    tourBaselineRef.current = null;
    tourRunBaselineRef.current = runAttempts[selectedId] ?? 0;
    setTourChip(null);
    setTourOpen(true);
    const previous = readTour();
    const next: TourState =
      mode === 'resume'
        ? { ...previous, status: 'active', chipShown: true, updatedAt: Date.now() }
        : reduceTour(previous, 'replay', tourFactsRef.current);
    logEvent({
      kind: 'tour',
      action: mode === 'resume' ? 'resume' : 'shown',
      level: next.stepIndex + 1,
    });
    setTourState(writeTour(next));
  };

  // Which surface to offer. Judged against the lesson actually open, so a deep link into a later
  // entry gets the chip rather than a tour of six steps about someone else's lesson.
  useEffect(() => {
    const current = readTour();
    const offer = tourOffer(current, {
      onFirstLesson: selectedId === PYTHON_LESSONS[0].id,
      hasProgress,
    });
    if (offer === 'none') return;
    if (offer === 'tour') {
      tourBaselineRef.current = null;
      tourRunBaselineRef.current = runAttempts[selectedId] ?? 0;
      setTourOpen(true);
      // A record that is already open on step one is this effect running again (StrictMode's
      // double-invoke in development), not a second time the learner was shown it.
      if (!(current.status === 'active' && current.stepIndex === 0)) {
        logEvent({ kind: 'tour', action: 'shown', level: 1 });
      }
      setTourState(writeTour({ ...current, status: 'active', stepIndex: 0, updatedAt: Date.now() }));
      return;
    }
    // Someone who left the tour at step 4 gets the step, not the welcome: `active` is the record that
    // says where they were.
    setTourChip({ resume: current.status === 'active' });
    setTourState(writeTour({ ...current, chipShown: true, updatedAt: Date.now() }));
    // Deliberately keyed on the lesson: the counts are read once per visit, so the run that finishes
    // during the tour cannot close the tour it is part of.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // The palette and the `?` sheet ask for a replay with a nonce, the same way they ask for a run.
  const lastTourRequestRef = useRef<number>(tourRequest ?? 0);
  useEffect(() => {
    if ((tourRequest ?? 0) === lastTourRequestRef.current) return;
    lastTourRequestRef.current = tourRequest ?? 0;
    startTour();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourRequest]);

  // Step 3's gate: the editor now holds text that is not the text the tour found.
  useEffect(() => {
    if (!tourActive) return;
    if (tourStep.gate === 'edited') {
      if (tourBaselineRef.current === null) {
        tourBaselineRef.current = code;
        return;
      }
      if (tourFactsRef.current.edited) signalTour('edited');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourActive, tourStep.gate, code]);

  // Step 4's gate: a run that finished while the tour was on screen.
  useEffect(() => {
    if (!tourActive) return;
    if (tourStep.gate === 'run-finished' && tourFactsRef.current.runFinished) {
      signalTour('run-finished');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourActive, tourStep.gate, tourFacts.runFinished]);

  // Focus follows the kind of step: the editor for the typing one, Run for the press one. A card that
  // keeps focus while asking the learner to type is a card they have to fight.
  //
  // The editor is a deferred chunk (`PythonEditor` draws the starter text while CodeMirror loads), so
  // the handle can still be null when this runs — on a loaded machine the tour asked for focus before
  // there was anything to focus and the step sat there untyped. So the request is retried until the
  // handle answers, bounded, and cancelled the moment the step changes or the tour closes.
  useEffect(() => {
    if (!tourActive) return;
    if (tourStep.id === 'run') {
      runButtonRef.current?.focus();
      return;
    }
    if (tourStep.id !== 'editor') return;
    let timer = 0;
    let waited = 0;
    const ask = () => {
      const editor = editorRef.current;
      if (editor) {
        editor.focus();
        return;
      }
      if (waited >= 5000) return;
      waited += 100;
      timer = window.setTimeout(ask, 100);
    };
    ask();
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourActive, tourStep.id]);

  // Esc closes the tour — unless a sheet is open, in which case that press was meant for the sheet.
  useEffect(() => {
    if (!tourActive) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (sheetOpen) return;
      signalTour('dismiss');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourActive, sheetOpen]);

  return {
    tourActive,
    tourStep,
    tourState,
    tourFacts,
    tourChip,
    setTourChip,
    startTour,
    signalTour,
  };
}
