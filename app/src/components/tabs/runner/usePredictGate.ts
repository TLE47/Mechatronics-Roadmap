import { useEffect, useRef, useState } from 'react';
import {
  checkPrediction,
  clearPrediction,
  clearPredictionDraft,
  predictionFor,
  readPredictionDraft,
  savePrediction,
  savePredictionDraft,
  type PredictionRecord,
} from '../../../predictGate';
import type { PythonLessonItem } from '../../../data/pythonLessonsData';

interface PredictGateInput {
  selectedId: string;
  currentLesson: PythonLessonItem;
  /** True while the editor holds a page's snippet: that run is ungraded, so no question is asked. */
  scratchRef: { current: boolean };
  isRunning: boolean;
  runPythonCode: (code: string, lesson: PythonLessonItem) => Promise<void>;
  /** Put the gate's pane on screen (`TabPyodideRunner`'s `openPredictView`). */
  openPane: () => void;
}

export interface PredictGate {
  record: PredictionRecord | null;
  text: string;
  setText: (text: string) => void;
  /** A run is actually held for a guess; the watch loop must not run around it. */
  holding: boolean;
  requestRun: (sourceCode: string, lesson?: PythonLessonItem) => void;
  /** Reread this lesson's verdict and show its pane, without holding a run. */
  open: () => void;
  commit: () => void;
  skip: () => void;
  again: () => void;
}

/**
 * Predict first (`app/src/predictGate.ts`): the first Run of a lesson asks what it will print and
 * holds the run until the learner commits or skips, and the record is per lesson and per store.
 *
 * This owns the question's state and every decision made about it, so a run asked from the toolbar,
 * the phone bar or the keyboard all take the same path.
 */
export function usePredictGate({
  selectedId,
  currentLesson,
  scratchRef,
  isRunning,
  runPythonCode,
  openPane,
}: PredictGateInput): PredictGate {
  const [record, setRecord] = useState<PredictionRecord | null>(null);
  const [text, setText] = useState('');
  /** The run the gate is holding: set when Run was pressed before a prediction was made. */
  const [held, setHeld] = useState<{ code: string; lesson: PythonLessonItem } | null>(null);
  /** The draft writer, and the two values it needs after a render has already moved on. */
  const draftTimer = useRef<number | null>(null);
  const lessonRef = useRef(selectedId);
  lessonRef.current = selectedId;
  const textRef = useRef(text);
  textRef.current = text;

  /**
   * A new lesson is a new question: the record is read for the lesson now on screen, and the box comes
   * back with whatever was half-typed for it rather than with the last lesson's words.
   */
  useEffect(() => {
    setRecord(predictionFor(selectedId));
    setText(readPredictionDraft(selectedId));
    setHeld(null);
  }, [selectedId]);

  // A draft is written a beat after the last keystroke rather than on each one, and any pending write
  // is flushed when the gate goes away (a lesson switch, the pane closing, the tab closing) so the
  // sentence survives the thing it was interrupted by.
  useEffect(
    () => () => {
      if (draftTimer.current !== null) {
        window.clearTimeout(draftTimer.current);
        draftTimer.current = null;
        savePredictionDraft(lessonRef.current, textRef.current);
      }
    },
    []
  );

  /** Typing: the state moves now, the store follows 400 ms later. */
  const updateText = (next: string) => {
    setText(next);
    textRef.current = next;
    if (draftTimer.current !== null) window.clearTimeout(draftTimer.current);
    draftTimer.current = window.setTimeout(() => {
      draftTimer.current = null;
      savePredictionDraft(lessonRef.current, next);
    }, 400);
  };

  const requestRun = (sourceCode: string, lesson: PythonLessonItem = currentLesson) => {
    if (isRunning) return;
    // The gate asks what the *lesson* will print. A page's snippet is not the lesson, and a guess
    // about a loop the reader has not read yet is a quiz nobody asked for.
    if (scratchRef.current) {
      void runPythonCode(sourceCode, lesson);
      return;
    }
    // A suite that drives hundreds of runs sets this once; the gate keeps its own browser step, so
    // what is switched off here is a prompt, not a check.
    if (typeof window !== 'undefined' && window.__mechalabPredictFirst === false) {
      void runPythonCode(sourceCode, lesson);
      return;
    }
    const existing = predictionFor(lesson.id);
    setRecord(existing);
    if (!existing) {
      setHeld({ code: sourceCode, lesson });
      setText('');
      openPane();
      return;
    }
    void runPythonCode(sourceCode, lesson);
  };

  /** The toolbar's Predict press is a reread, not a run waiting on an answer. */
  const open = () => {
    setRecord(predictionFor(selectedId));
    setHeld(null);
    openPane();
  };

  /** Commit the guess and let the held run go; the verdict stays on screen beside the output. */
  const commit = () => {
    const pending = held;
    const lesson = pending?.lesson ?? currentLesson;
    if (!text.trim()) return;
    // The guess is now a record: the draft has nothing left to hold, and leaving it behind would put
    // the same words back in the box as if they had never been judged.
    if (draftTimer.current !== null) {
      window.clearTimeout(draftTimer.current);
      draftTimer.current = null;
    }
    clearPredictionDraft(lesson.id);
    const check = checkPrediction(text, lesson.expectedOutput);
    setRecord(
      savePrediction({
        lessonId: lesson.id,
        text,
        verdict: check.verdict,
        matchedLines: check.matchedLines,
        predictedLines: check.predictedLines,
        skipped: false,
        at: Date.now(),
      })
    );
    setHeld(null);
    // A run was waiting on the answer, so it goes now; a prediction made from the toolbar (no run
    // held) is just filed.
    if (pending) void runPythonCode(pending.code, lesson);
  };

  /** Skip is a recorded decision, not a loophole: nothing is blocked, and "skipped" is stored. */
  const skip = () => {
    const pending = held;
    const lesson = pending?.lesson ?? currentLesson;
    if (draftTimer.current !== null) {
      window.clearTimeout(draftTimer.current);
      draftTimer.current = null;
    }
    clearPredictionDraft(lesson.id);
    setRecord(
      savePrediction({
        lessonId: lesson.id,
        text: '',
        verdict: 'miss',
        matchedLines: 0,
        predictedLines: 0,
        skipped: true,
        at: Date.now(),
      })
    );
    setHeld(null);
    if (pending) void runPythonCode(pending.code, lesson);
  };

  /**
   * Edit the saved guess: the question comes back with the learner's own words in the box, so a
   * revision is a revision rather than retyping from memory. Committing writes the one record this
   * lesson keeps and judges it again against the same expected output.
   */
  const again = () => {
    const previous = predictionFor(selectedId);
    clearPrediction(selectedId);
    clearPredictionDraft(selectedId);
    setRecord(null);
    setText(previous?.text ?? '');
    textRef.current = previous?.text ?? '';
    setHeld(null);
  };

  return {
    record,
    text,
    setText: updateText,
    holding: held !== null,
    requestRun,
    open,
    commit,
    skip,
    again,
  };
}
