import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  ExternalLink,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import type { MicroConcept, MicroQuestion } from '../../data/microLessons';
import { MICRO_CONCEPTS, MICRO_CATALOG } from '../../micro/catalog';
import {
  dueConceptIds,
  gradeAnswer,
  nextConceptId,
  reviewSet,
  statusLabel,
} from '../../micro/engine';
import { microProgress, resetMicroProgress, saveMicroEvent } from '../../micro/progress';
import {
  ActivityClock,
  clearClockSnapshot,
  formatClock,
  readClockSnapshot,
  writeClockSnapshot,
  type ClockReading,
} from '../../micro/timer';
import type { MicroEvent, MicroStore } from '../../micro/types';
import { optionalResources, resourcesFor } from '../../micro/resources';
import { formatWalkthroughChord, readWalkthroughKeys } from '../../micro/walkthroughKeys.ts';
import { lessonPageUrl } from '../../startHere';
import { MicroVisual } from '../micro/MicroVisual.tsx';
import { MicroWalkthrough } from '../micro/MicroWalkthrough.tsx';
import { MicroAnswerPreview } from '../micro/MicroAnswerPreview.tsx';
import { MicroCodeBlock, MicroOptionText, MicroRichText } from '../micro/MicroText.tsx';

export interface TabMicroProps {
  /** Return to the runner with the parent lesson selected. */
  openLesson: (id: string) => void;
}

type Stage = 'overview' | 'learn' | 'diagnostics' | 'practice' | 'review' | 'challenge' | 'done';

interface Result {
  kind: 'learn' | 'review' | 'challenge';
  score?: number;
  practice?: boolean | null;
  correct?: number;
  total?: number;
  passed?: boolean;
  missed?: string[];
}

const EMPTY_READING: ClockReading = {
  visibleSeconds: 0,
  adjustedSeconds: 0,
  overTarget: false,
  visibleOverLimit: false,
};

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function stageTitle(stage: Stage): string {
  if (stage === 'learn') return 'Learn';
  if (stage === 'diagnostics') return 'Two quick checks';
  if (stage === 'practice') return 'Practice';
  if (stage === 'review') return 'Review';
  if (stage === 'challenge') return 'Challenge';
  if (stage === 'done') return 'Result';
  return 'Micro-learning';
}

function outcomeCopy(result: Result | null): string {
  if (!result) return '';
  if (result.kind === 'learn') {
    if (result.score === 2) return 'Clean sweep. This is provisional and due for review tomorrow.';
    if (result.practice) return 'Practice correct. This is provisional; a review will consolidate it.';
    return 'This one is still learning. Read the targeted note and try the practice once more.';
  }
  if (result.kind === 'review') {
    return result.correct === result.total
      ? 'Consolidated. The next review moves further out.'
      : 'The review is scheduled again for tomorrow; your mastery was kept.';
  }
  return result.passed
    ? 'Challenge passed. Consolidated; the next review is two weeks out.'
    : 'Challenge missed. Your mastery was kept; the next review is tomorrow.';
}

const CARD = 'rounded-2xl border border-line bg-panel p-3.5 shadow-sm sm:p-5';
const OPTION_TONE = ['bg-accent', 'bg-emerald', 'bg-amber', 'bg-purple'];

/** The colour family a concept uses in the list and the lesson header. */
const TONE: Record<string, { dot: string; chip: string }> = {
  variables: { dot: 'bg-accent', chip: 'border-accent/40 bg-accent/10 text-accent' },
  'assignment-order': { dot: 'bg-emerald', chip: 'border-emerald/40 bg-emerald/10 text-emerald' },
  'int-float': { dot: 'bg-amber', chip: 'border-amber/40 bg-amber/10 text-amber' },
  strings: { dot: 'bg-purple', chip: 'border-purple/40 bg-purple/10 text-purple' },
  booleans: { dot: 'bg-rose', chip: 'border-rose/40 bg-rose/10 text-rose' },
  'mixed-types': { dot: 'bg-amber', chip: 'border-amber/40 bg-amber/10 text-amber' },
  'f-strings': { dot: 'bg-accent', chip: 'border-accent/40 bg-accent/10 text-accent' },
};

export const TabMicro: React.FC<TabMicroProps> = ({ openLesson }) => {
  const [store, setStore] = useState<MicroStore>(() => microProgress.read());
  const [persistent, setPersistent] = useState(() => microProgress.persistent());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>('overview');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [gradedAnswers, setGradedAnswers] = useState<Record<string, boolean>>({});
  const [walkthroughDone, setWalkthroughDone] = useState(false);
  const [testChord, setTestChord] = useState(() => readWalkthroughKeys().test);
  const [inputMode, setInputMode] = useState<'pointer' | 'key'>('pointer');
  const [diagnosticScore, setDiagnosticScore] = useState<0 | 1 | 2>(0);
  const [missed, setMissed] = useState<string[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [reviewAttempt, setReviewAttempt] = useState(0);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState<ClockReading>(EMPTY_READING);
  const [debugReadout, setDebugReadout] = useState<React.ComponentType | null>(null);
  const clockRef = useRef<ActivityClock | null>(null);
  const active = activeId ? MICRO_CONCEPTS.find((concept) => concept.id === activeId) ?? null : null;

  const refresh = useCallback(() => {
    setStore(microProgress.read());
    setPersistent(microProgress.persistent());
  }, []);

  useEffect(() => {
    const unsubscribe = microProgress.subscribe(refresh);
    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key.startsWith('mechalab_micro_')) refresh();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      unsubscribe();
      window.removeEventListener('storage', onStorage);
    };
  }, [refresh]);

  useEffect(() => {
    if (!activeId) return;
    const key = activeId;
    const clock = new ActivityClock(Date.now(), readClockSnapshot(key));
    clockRef.current = clock;
    setReading(clock.reading());
    const id = window.setInterval(() => {
      const next = clock.tick();
      setReading(next);
      writeClockSnapshot(key, clock.snapshot());
    }, 1000);
    const onVisibility = () => {
      if (document.hidden) clock.pause();
      else clock.resume();
      setReading(clock.reading());
      writeClockSnapshot(key, clock.snapshot());
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
      writeClockSnapshot(key, clock.snapshot());
      clockRef.current = null;
    };
  }, [activeId]);

  useEffect(() => {
    if (!import.meta.env.VITE_MICRO_DEBUG) return;
    let alive = true;
    void import('../../micro/MicroDebugReadout').then((module) => {
      if (alive) setDebugReadout(() => module.MicroDebugReadout);
    });
    return () => {
      alive = false;
    };
  }, []);

  const state = active ? store.concepts[active.id] : undefined;
  const learnedCount = MICRO_CONCEPTS.filter((concept) => store.concepts[concept.id]?.learnCompletedAt).length;
  const consolidatedCount = MICRO_CONCEPTS.filter(
    (concept) => store.concepts[concept.id]?.mastery === 'consolidated'
  ).length;
  const evidenceDays = new Set(store.events.map((event) => new Date(event.timestamp).toDateString())).size;
  const due = useMemo(() => dueConceptIds(store, MICRO_CONCEPTS, Date.now()), [store]);
  const suggested = useMemo(() => nextConceptId(store, MICRO_CONCEPTS, Date.now()), [store]);
  const reviewQuestions = useMemo(
    () => (active ? reviewSet(active, reviewAttempt) : []),
    [active, reviewAttempt]
  );

  const begin = (concept: MicroConcept, next: Exclude<Stage, 'overview'>) => {
    setActiveId(concept.id);
    setStage(next);
    setAnswers({});
    setGradedAnswers({});
    setWalkthroughDone(false);
    setResult(null);
    setNote('');
    setMissed([]);
    setDiagnosticScore(0);
    setInputMode('pointer');
    if (concept.id === activeId) clockRef.current?.resume();
  };

  const back = () => {
    if (clockRef.current) {
      clockRef.current.pause();
      writeClockSnapshot(activeId ?? '', clockRef.current.snapshot());
    }
    setActiveId(null);
    setStage('overview');
    setInputMode('pointer');
    setAnswers({});
    setGradedAnswers({});
    setWalkthroughDone(false);
    setResult(null);
    setNote('');
  };

  const finish = () => {
    const next = clockRef.current?.tick();
    if (next) setReading(next);
    clockRef.current?.pause();
    if (result?.kind === 'review') setReviewAttempt((attempt) => attempt + 1);
    setInputMode('pointer');
    setStage('done');
  };

  const stopClock = () => {
    const next = clockRef.current?.tick();
    if (next) setReading(next);
    clockRef.current?.pause();
  };

  const continueToPractice = () => {
    setInputMode('pointer');
    setStage('practice');
    setAnswers({});
    setGradedAnswers({});
    setNote('');
    clockRef.current?.resume();
  };

  const startDiagnostics = (input: 'pointer' | 'key' = 'pointer') => {
    if (!active || !walkthroughDone) return;
    setInputMode(input);
    setStage('diagnostics');
    setAnswers({});
    setGradedAnswers({});
    setNote('');
    clockRef.current?.resume();
  };

  const persist = async (event: MicroEvent) => {
    setBusy(true);
    try {
      const saved = await saveMicroEvent(event);
      if (!saved.saved) {
        setNote(
          saved.reason === 'read-only'
            ? 'This browser has a newer micro-progress format. It is open read-only; nothing was overwritten.'
            : 'Progress could not be saved. The activity still works, but it will not be here next time.'
        );
        setPersistent(false);
        return false;
      }
      setStore(saved.store);
      setPersistent(saved.persistent);
      return true;
    } finally {
      setBusy(false);
    }
  };

  const clockEvent = (concept: MicroConcept): Pick<MicroEvent, 'eventId' | 'attemptId' | 'timestamp' | 'elapsedSeconds' | 'visibleSeconds' | 'sourceRevision'> => {
    const current = clockRef.current?.tick() ?? EMPTY_READING;
    const eventId = newId();
    return {
      eventId,
      attemptId: eventId,
      timestamp: Date.now(),
      elapsedSeconds: current.adjustedSeconds,
      visibleSeconds: current.visibleSeconds,
      sourceRevision: concept.revision,
    };
  };

  const submitDiagnostics = async () => {
    if (!active) return;
    const grades: Record<string, boolean> = {};
    for (const question of active.diagnostics) {
      grades[question.id] = gradeAnswer(question, answers[question.id] ?? '');
    }
    const correct = active.diagnostics.filter((question) => grades[question.id]).length;
    const score = correct as 0 | 1 | 2;
    const missedQuestions = active.diagnostics
      .filter((question) => !grades[question.id])
      .map((question) => question.explanation);
    setDiagnosticScore(score);
    setMissed(missedQuestions);
    setGradedAnswers(grades);
    if (score === 2) {
      const event: MicroEvent = {
        ...clockEvent(active),
        conceptId: active.id,
        activity: 'learn',
        diagnosticCorrect: 2,
        diagnosticTotal: 2,
        practiceCorrect: null,
      };
      const saved = await persist(event);
      setResult({ kind: 'learn', score: 2, practice: null, missed: [] });
      stopClock();
      if (!saved) setNote('The clean diagnostics were not saved.');
    }
  };

  const submitPractice = async () => {
    if (!active) return;
    const correct = gradeAnswer(active.practice, answers[active.practice.id] ?? '');
    const event: MicroEvent = {
      ...clockEvent(active),
      conceptId: active.id,
      activity: 'learn',
      diagnosticCorrect: diagnosticScore,
      diagnosticTotal: 2,
      practiceCorrect: correct,
    };
    const saved = await persist(event);
    setGradedAnswers({ [active.practice.id]: correct });
    setResult({ kind: 'learn', score: diagnosticScore, practice: correct, missed });
    stopClock();
    if (!saved) setNote('This result was not saved.');
  };

  const submitReview = async () => {
    if (!active) return;
    const correct = reviewQuestions.filter((question) => gradeAnswer(question, answers[question.id] ?? '')).length;
    const event: MicroEvent = {
      ...clockEvent(active),
      conceptId: active.id,
      activity: 'review',
      correctCount: correct,
      totalQuestions: reviewQuestions.length,
    };
    const saved = await persist(event);
    const grades: Record<string, boolean> = {};
    for (const question of reviewQuestions) {
      grades[question.id] = gradeAnswer(question, answers[question.id] ?? '');
    }
    setGradedAnswers(grades);
    setResult({ kind: 'review', correct, total: reviewQuestions.length });
    stopClock();
    if (!saved) setNote('The review result was not saved.');
  };

  const submitChallenge = async () => {
    if (!active) return;
    const correct = gradeAnswer(active.challenge, answers[active.challenge.id] ?? '');
    const event: MicroEvent = {
      ...clockEvent(active),
      conceptId: active.id,
      activity: 'challenge',
      correct,
    };
    const saved = await persist(event);
    setGradedAnswers({ [active.challenge.id]: correct });
    setResult({ kind: 'challenge', passed: correct });
    stopClock();
    if (!saved) setNote('The challenge result was not saved.');
  };

  const resetProgress = () => {
    if (!window.confirm('Reset micro-learning progress? Lessons, notes and the rest of your MechaLab progress stay.')) {
      return;
    }
    if (!resetMicroProgress()) {
      setNote('Micro progress could not be reset. A newer store format is read-only, or storage is blocked.');
      return;
    }
    if (activeId) clearClockSnapshot(activeId);
    setStore(microProgress.read());
    back();
    setNote('Micro-learning progress reset. Nothing else was touched.');
  };

  const renderQuestion = (question: MicroQuestion, index: number) => {
    const selected = answers[question.id] ?? '';
    const isGraded = Object.prototype.hasOwnProperty.call(gradedAnswers, question.id);
    const isCorrect = gradedAnswers[question.id] === true;
    const hasPreview = Boolean(selected);
    return (
      <fieldset
        key={question.id}
        className="rounded-xl border border-line-soft bg-canvas p-2.5 sm:p-3.5"
        data-testid={`micro-question-${question.id}`}
      >
        <legend className="px-1 font-mono text-[11px] uppercase tracking-[0.12em] text-faint">
          {index + 1} / {question.type === 'choice' ? 'choose one' : 'short answer'}
        </legend>
        <div className={hasPreview ? 'grid gap-3 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] lg:items-start lg:gap-4' : ''}>
          <div className="min-w-0">
            <p className="text-[14px] font-semibold leading-relaxed text-ink sm:text-[15.5px]">
              <MicroRichText text={question.prompt} />
            </p>
            {question.code ? <MicroCodeBlock code={question.code} compact className="mt-2" /> : null}
            {question.type === 'short' ? (
              <input
                value={selected}
                onChange={(event) => setAnswers((previous) => ({ ...previous, [question.id]: event.target.value }))}
                aria-label={question.prompt}
                disabled={isGraded}
                className="mt-2.5 w-full rounded-lg border border-line bg-panel px-3 py-2 font-mono text-[14px] text-ink disabled:opacity-70"
              />
            ) : (
              <div className="mt-2.5 grid gap-2">
                {(question.options ?? []).map((option, optionIndex) => (
                  <label
                    key={option.id}
                    className={`flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 text-[13.5px] leading-relaxed sm:gap-2.5 sm:px-3 sm:py-2.5 sm:text-[14.5px] ${
                      selected === option.id
                        ? isGraded
                          ? isCorrect
                            ? 'border-emerald bg-emerald/10 text-ink'
                            : 'border-rose bg-rose/10 text-ink'
                          : 'border-accent bg-accent-soft text-ink'
                        : 'border-line-soft bg-panel text-body hover:border-accent/50'
                    }`}
                  >
                    <input
                      type="radio"
                      name={question.id}
                      value={option.id}
                      checked={selected === option.id}
                      disabled={isGraded}
                      onChange={() => setAnswers((previous) => ({ ...previous, [question.id]: option.id }))}
                      className="mt-0.5"
                    />
                    <span
                      aria-hidden="true"
                      className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${OPTION_TONE[optionIndex % OPTION_TONE.length]}`}
                    />
                    <span className="min-w-0">
                      <MicroOptionText text={option.text} />
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
          {hasPreview ? (
            <MicroAnswerPreview
              key={`${question.id}-${selected}`}
              question={question}
              selected={selected}
              graded={isGraded}
              correct={isCorrect}
            />
          ) : null}
        </div>
      </fieldset>
    );
  };

  const renderResources = (concept: MicroConcept) => {
    const resources = resourcesFor(concept);
    if (!resources.length) return null;
    return (
      <div className="rounded-xl border border-line-soft bg-canvas p-3.5" data-testid="micro-resources">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-faint">Go deeper (optional)</p>
        <ul className="mt-2 space-y-2">
          {resources.map((resource) => (
            <li key={resource.id} className="flex items-start gap-2">
              <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-accent" aria-hidden="true" />
              <span className="min-w-0">
                <a
                  href={resource.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[12px] font-semibold text-ink underline decoration-dotted underline-offset-2 hover:text-accent"
                >
                  {resource.title}
                </a>
                <span className="ml-1 text-[11px] text-faint">
                  {resource.role === 'primary' ? 'primary' : 'optional'} · {resource.lastVerified}
                </span>
              </span>
            </li>
          ))}
        </ul>
        {optionalResources(concept).length === 0 ? (
          <p className="mt-1 text-[12px] text-muted">The parent lesson is the only required reading.</p>
        ) : null}
      </div>
    );
  };

  const overview = (
    <div className="space-y-2.5 sm:space-y-3" data-testid="micro-overview">
      <section className={`${CARD} relative overflow-hidden border-accent/30`} data-testid="micro-hero">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_92%_8%,var(--accent-soft),transparent_38%),radial-gradient(circle_at_8%_92%,var(--emerald),transparent_32%)] opacity-70" />        <div className="relative grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-4">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent sm:text-[11px]">P.1 · seven tiny concepts</p>
            <h2 className="mt-1 font-display text-2xl font-bold leading-tight text-ink sm:text-3xl">
              Follow the question. The answer can wait.
            </h2>
            <p className="mt-1.5 max-w-[62ch] text-[13.5px] leading-relaxed text-muted sm:mt-2 sm:text-[15px]">
              One small idea, two quick checks, then a review that returns tomorrow. A clean diagnostic
              is provisional; a review or challenge makes it stick. The parent lesson P.1 is never
              marked verified from here.
            </p>
          </div>
          <div className="w-full rounded-xl border border-line-soft bg-canvas/90 px-3 py-2.5 text-left sm:w-auto sm:px-4 sm:py-3 sm:text-right">
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-faint">Due now</p>
            <p className="font-mono text-3xl font-bold tabular-nums text-ink">{due.length}</p>
            <p className="font-mono text-[10px] text-faint">{due.length === 0 ? 'all caught up' : 'ready for you'}</p>
          </div>
        </div>
        <div className="relative mt-3 grid gap-2 sm:mt-4 sm:grid-cols-3">
          <div className="rounded-lg border border-line-soft bg-canvas/80 px-3 py-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-faint">Ideas unlocked</p>
            <p className="mt-0.5 text-[15px] font-bold text-ink">
              {learnedCount} <span className="text-[12px] font-normal text-muted">/ {MICRO_CONCEPTS.length}</span>
            </p>
          </div>
          <div className="rounded-lg border border-line-soft bg-canvas/80 px-3 py-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-faint">Consolidated</p>
            <p className="mt-0.5 text-[15px] font-bold text-emerald">{consolidatedCount}</p>
          </div>
          <div className="rounded-lg border border-line-soft bg-canvas/80 px-3 py-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-faint">Curiosity days</p>
            <p className="mt-0.5 text-[15px] font-bold text-accent">{evidenceDays}</p>
          </div>
        </div>
        <div className="relative mt-3 h-2 overflow-hidden rounded-full bg-raise" aria-hidden="true">
          <div
            className="h-full rounded-full bg-gradient-to-r from-accent via-emerald to-purple transition-[width] duration-500"
            style={{ width: `${Math.round((learnedCount / MICRO_CONCEPTS.length) * 100)}%` }}
          />
        </div>
        <div className="relative mt-3 sm:mt-4">
          <MicroVisual conceptId="variables" />
        </div>
        {suggested ? (
          <button
            type="button"
            onClick={() => {
              const concept = MICRO_CONCEPTS.find((entry) => entry.id === suggested);
              if (concept) begin(concept, 'learn');
            }}
            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-[14px] font-bold text-inverse shadow-sm hover:bg-accent/80"
            data-testid="micro-next"
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {suggested && store.concepts[suggested] ? 'Continue with' : 'Start with'}{' '}
            {MICRO_CONCEPTS.find((concept) => concept.id === suggested)?.title}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : (
          <p className="mt-3 rounded-xl border border-emerald/30 bg-emerald/5 px-3.5 py-2.5 text-[13.5px] leading-relaxed text-emerald">
            All seven P.1 concepts have been learned. Reviews return on their own schedule; start
            any concept from the list whenever you want. Curiosity does not expire.
          </p>
        )}
      </section>

      {due.length > 0 ? (
        <section className={CARD} data-testid="micro-due">
          <div className="flex items-center gap-2">
            <Clock3 className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2 className="text-base font-bold text-ink">Due now</h2>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {due.map((id) => {
              const concept = MICRO_CONCEPTS.find((entry) => entry.id === id);
              return concept ? (
                <button
                  key={id}
                  type="button"
                  onClick={() => begin(concept, 'review')}
                  className="rounded-full border border-accent/50 bg-accent-soft px-3.5 py-1.5 text-[13px] font-semibold text-accent"
                >
                  Review {concept.title}
                </button>
              ) : null;
            })}
          </div>
        </section>
      ) : null}

      <section className={CARD}>
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-accent" aria-hidden="true" />
          <h2 className="text-base font-bold text-ink">Seven P.1 concepts</h2>
        </div>
        <ul className="mt-2 divide-y divide-line-soft">
          {MICRO_CONCEPTS.map((concept, index) => {
            const conceptState = store.concepts[concept.id];
            const label = statusLabel(conceptState, concept, Date.now());
            const canReview = Boolean(conceptState?.learnCompletedAt);
            return (
              <li key={concept.id} className="flex flex-wrap items-center gap-2.5 py-3" data-testid={`micro-concept-${concept.id}`}>
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${TONE[concept.id]?.dot ?? 'bg-accent'}`} aria-hidden="true" />
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-line-soft font-mono text-[11px] text-faint">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14.5px] font-semibold leading-snug text-ink">{concept.title}</p>
                  <p className="mt-0.5 text-[12px] text-muted">
                    {label} · {concept.timing.learn.estimatedSeconds}s designed
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => begin(concept, 'learn')}
                  className="rounded-lg border border-line bg-panel px-3 py-1.5 text-[12.5px] font-semibold text-ink hover:border-accent/60 hover:text-accent"
                  data-testid={`micro-learn-${concept.id}`}
                >
                  {canReview ? 'Learn again' : 'Learn'}
                </button>
                {canReview ? (
                  <>
                    <button
                      type="button"
                      onClick={() => begin(concept, 'review')}
                      className="rounded-lg border border-line bg-panel px-3 py-1.5 text-[12.5px] font-semibold text-ink hover:border-accent/60 hover:text-accent"
                      data-testid={`micro-review-${concept.id}`}
                    >
                      Review
                    </button>
                    <button
                      type="button"
                      onClick={() => begin(concept, 'challenge')}
                      className="rounded-lg border border-line bg-panel px-3 py-1.5 text-[12.5px] font-semibold text-ink hover:border-accent/60 hover:text-accent"
                      data-testid={`micro-challenge-${concept.id}`}
                    >
                      Challenge
                    </button>
                  </>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
        <button
          type="button"
          onClick={() => openLesson('P.1')}
          className="inline-flex items-center gap-1.5 text-muted underline decoration-dotted underline-offset-2 hover:text-ink"
        >
          Open the full P.1 lesson
          <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={resetProgress}
          className="inline-flex items-center gap-1.5 text-muted hover:text-rose"
          data-testid="micro-reset"
        >
          <RotateCcw className="h-3 w-3" aria-hidden="true" />
          Reset micro progress
        </button>
      </div>
    </div>
  );

  const detail = active ? (
    <div className="space-y-2.5 sm:space-y-3" data-testid="micro-detail">
      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={back}
            className="inline-flex items-center gap-1.5 text-[13.5px] text-muted hover:text-ink"
            data-testid="micro-back"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            All concepts
          </button>
          <a
            href={`${lessonPageUrl(MICRO_CATALOG.parentPath)}#${active.anchor}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[13px] text-muted underline decoration-dotted underline-offset-2 hover:text-accent"
            data-testid="micro-source-anchor"
          >
            Read this section in P.1
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        </div>
        <div className="flex items-center gap-2 font-mono text-[12.5px] text-muted md:justify-self-end" data-testid="micro-timer">
          <Clock3 className="h-4 w-4" aria-hidden="true" />
          <span>{formatClock(reading.adjustedSeconds)}</span>
          <span className="text-faint">/ target {active.timing.learn.estimatedSeconds}s</span>
        </div>
      </div>

      <section className={`${CARD} border-accent/30`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] ${TONE[active.id]?.chip ?? 'border-accent/40 bg-accent/10 text-accent'}`}>
            {stageTitle(stage)}
          </span>
          <span className="font-mono text-[11px] text-faint">P.1 · {active.title}</span>
        </div>
        <h2 className="mt-2 font-display text-xl font-bold leading-tight text-ink sm:text-2xl">{active.title}</h2>
        <p className="mt-1 text-[12px] text-muted sm:text-[13px]">{MICRO_CATALOG.title}</p>
        {reading.overTarget ? (
          <p
            role="status"
            data-testid="micro-over-target"
            className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[11.5px] text-amber-200"
          >
            Over target — finish comfortably. Nothing is blocked or discarded.
          </p>
        ) : reading.visibleOverLimit ? (
          <p className="mt-2 text-[11px] text-faint">This one is taking a little longer than designed. Take your time.</p>
        ) : null}
      </section>

      {stage === 'learn' ? (
        <section className={`${CARD} micro-stage micro-reveal space-y-3 sm:space-y-4`} data-testid="micro-teaching" data-input={inputMode}>
          <MicroVisual conceptId={active.id} />
          <div className="max-w-[72ch]">
            {active.teaching[0] ? (
              <p className="text-[14.5px] font-medium leading-7 text-ink sm:text-[16px] sm:leading-8">
                <MicroRichText text={active.teaching[0]} />
              </p>
            ) : null}
          </div>
          <MicroWalkthrough
            key={active.id}
            concept={active}
            onComplete={() => setWalkthroughDone(true)}
            onTest={startDiagnostics}
            testReady={walkthroughDone}
            onKeysChange={(next) => setTestChord(next.test)}
          />
          {walkthroughDone ? (
            <div className="micro-reveal space-y-3">
              {active.teaching.slice(1).map((paragraph) => (
                <p key={paragraph} className="max-w-[72ch] text-[14.5px] leading-7 text-body sm:text-[16px] sm:leading-8">
                  <MicroRichText text={paragraph} />
                </p>
              ))}
              <div className="rounded-xl border border-emerald/25 bg-emerald/5 p-3.5">
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-emerald">What Python says</p>
                <pre className="mt-1 whitespace-pre-wrap font-mono text-[13.5px] leading-relaxed text-emerald">
                  {active.example.output}
                </pre>
              </div>
            </div>
          ) : (
            <p className="text-[13px] leading-relaxed text-muted">
              Reveal each line above to unlock the rest of the idea and the checks.
            </p>
          )}
          <button
            type="button"
            disabled={!walkthroughDone}
            onClick={() => startDiagnostics('pointer')}
            className="inline-flex flex-wrap items-center gap-2 rounded-xl bg-accent px-3.5 py-2.5 text-[13px] font-bold text-inverse shadow-sm hover:bg-accent/80 disabled:cursor-not-allowed disabled:opacity-50 sm:px-4 sm:text-[14px]"
            data-testid="micro-start-diagnostics"
          >
            Let me test that
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
            <kbd className="rounded border border-inverse/25 bg-inverse/10 px-1.5 py-0.5 font-mono text-[10px] text-inverse/80">
              {formatWalkthroughChord(testChord)}
            </kbd>
          </button>
          {renderResources(active)}
        </section>
      ) : null}

      {stage === 'diagnostics' ? (
        <section className={`${CARD} micro-stage micro-reveal space-y-3`} data-testid="micro-diagnostics" data-input={inputMode}>
          <p className="text-[14px] leading-relaxed text-muted">
            Two checks, no timer pressure. A wrong answer is a clue for the next step, not a score.
          </p>
          {active.diagnostics.map((question, index) => renderQuestion(question, index))}
          {active.diagnostics.every((question) => Object.prototype.hasOwnProperty.call(gradedAnswers, question.id)) ? (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line-soft bg-panel p-3" data-testid="micro-diagnostics-feedback">
              <p className="text-[13px] leading-relaxed text-muted">
                {diagnosticScore === 2
                  ? 'Both answers match. See the result when you are ready.'
                  : `${diagnosticScore}/2 checked. The practice will walk the missed piece.`}
              </p>
              <button
                type="button"
                onClick={diagnosticScore === 2 ? finish : continueToPractice}
                className="rounded-xl bg-accent px-4 py-2.5 text-[14px] font-bold text-inverse"
                data-testid={diagnosticScore === 2 ? 'micro-see-result' : 'micro-continue-practice'}
              >
                {diagnosticScore === 2 ? 'See my result' : 'Continue to practice'}
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={busy || active.diagnostics.some((question) => !answers[question.id])}
              onClick={() => void submitDiagnostics()}
              className="rounded-xl bg-accent px-4 py-2.5 text-[14px] font-bold text-inverse disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="micro-submit-diagnostics"
            >
              Check both answers
            </button>
          )}
        </section>
      ) : null}

      {stage === 'practice' ? (
        <section className={`${CARD} micro-stage micro-reveal space-y-3`} data-testid="micro-practice" data-input={inputMode}>
          <div className="rounded-xl border border-amber/25 bg-amber/5 p-3.5">
            <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-amber">
              A closer look · {diagnosticScore}/2
            </p>
            {diagnosticScore === 0 ? (
              <>
                <p className="mt-1 text-[14px] leading-relaxed text-body">
                  Let's slow down and walk the worked example once more before the practice.
                </p>
                <pre className="mt-2 overflow-x-auto rounded-lg border border-line-soft bg-panel p-2.5 font-mono text-[13px] text-body">
                  {active.example.code}
                </pre>
              </>
            ) : (
              <ul className="mt-2 space-y-1.5 text-[13.5px] leading-relaxed text-body">
                {missed.map((explanation) => (
                  <li key={explanation} className="flex gap-1.5">
                    <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber" aria-hidden="true" />
                    {explanation}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {renderQuestion(active.practice, 0)}
          {Object.prototype.hasOwnProperty.call(gradedAnswers, active.practice.id) ? (
            <button
              type="button"
              onClick={finish}
              className="rounded-xl bg-accent px-4 py-2.5 text-[14px] font-bold text-inverse"
              data-testid="micro-see-result"
            >
              See my result
            </button>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy || !answers[active.practice.id]}
                onClick={() => void submitPractice()}
                className="rounded-xl bg-accent px-4 py-2.5 text-[14px] font-bold text-inverse disabled:cursor-not-allowed disabled:opacity-50"
                data-testid="micro-submit-practice"
              >
                Check the practice
              </button>
              <button
                type="button"
                onClick={() => {
                  setDiagnosticScore(0);
                  setMissed([]);
                  setStage('diagnostics');
                  setAnswers({});
                  setGradedAnswers({});
                }}
                className="rounded-xl border border-line bg-panel px-3 py-2 text-[13.5px] font-semibold text-muted hover:text-ink"
              >
                Re-read the diagnostics
              </button>
            </div>
          )}
        </section>
      ) : null}

      {stage === 'review' ? (
        <section className={`${CARD} micro-stage micro-reveal space-y-3`} data-testid="micro-review-stage" data-input={inputMode}>
          <p className="text-[14px] leading-relaxed text-muted">
            A review is one concept at a time, two questions, all correct to consolidate.
          </p>
          {reviewQuestions.map((question, index) => renderQuestion(question, index))}
          {reviewQuestions.every((question) => Object.prototype.hasOwnProperty.call(gradedAnswers, question.id)) ? (
            <button
              type="button"
              onClick={finish}
              className="rounded-xl bg-accent px-4 py-2.5 text-[14px] font-bold text-inverse"
              data-testid="micro-see-result"
            >
              See my result
            </button>
          ) : (
            <button
              type="button"
              disabled={busy || reviewQuestions.some((question) => !answers[question.id])}
              onClick={() => void submitReview()}
              className="rounded-xl bg-accent px-4 py-2.5 text-[14px] font-bold text-inverse disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="micro-submit-review"
            >
              Check both answers
            </button>
          )}
        </section>
      ) : null}

      {stage === 'challenge' ? (
        <section className={`${CARD} micro-stage micro-reveal space-y-3`} data-testid="micro-challenge-stage" data-input={inputMode}>
          <p className="text-[14px] leading-relaxed text-muted">
            One transfer question. A pass consolidates the concept for two weeks; a miss keeps what you
            have learned and schedules tomorrow.
          </p>
          {renderQuestion(active.challenge, 0)}
          {Object.prototype.hasOwnProperty.call(gradedAnswers, active.challenge.id) ? (
            <button
              type="button"
              onClick={finish}
              className="rounded-xl bg-accent px-4 py-2.5 text-[14px] font-bold text-inverse"
              data-testid="micro-see-result"
            >
              See my result
            </button>
          ) : (
            <button
              type="button"
              disabled={busy || !answers[active.challenge.id]}
              onClick={() => void submitChallenge()}
              className="rounded-xl bg-accent px-4 py-2.5 text-[14px] font-bold text-inverse disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="micro-submit-challenge"
            >
              Check the challenge
            </button>
          )}
        </section>
      ) : null}

      {stage === 'done' && result ? (
        <section className={`${CARD} micro-stage micro-reveal space-y-4`} data-testid="micro-result" data-input={inputMode}>
          <div className="flex items-start gap-3">
            <span className="rounded-full border border-emerald/40 bg-emerald/10 p-2 text-emerald">
              {result.kind === 'review' && result.correct !== result.total ? (
                <CircleHelp className="h-4 w-4" aria-hidden="true" />
              ) : result.kind === 'challenge' && !result.passed ? (
                <CircleHelp className="h-4 w-4" aria-hidden="true" />
              ) : result.kind === 'learn' && result.practice === false ? (
                <CircleHelp className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Check className="h-4 w-4" aria-hidden="true" />
              )}
            </span>
            <div>
              <p className="text-[16px] font-bold leading-relaxed text-ink">{outcomeCopy(result)}</p>
              {result.kind === 'learn' && result.score !== 2 && result.practice === false ? (
                <p className="mt-1 text-[13px] leading-relaxed text-muted">
                  The parent lesson P.1 remains unverified. This micro result is not a lesson pass.
                </p>
              ) : null}
              {result.kind === 'review' && result.correct !== result.total ? (
                <p className="mt-1 text-[13px] leading-relaxed text-muted">
                  Your mastery and skip decision are unchanged; the review is simply due again tomorrow.
                </p>
              ) : null}
            </div>
          </div>
          {result.kind === 'learn' && result.practice === false ? (
            <button
              type="button"
              onClick={() => {
                setStage('practice');
                setAnswers({});
                setGradedAnswers({});
                setNote('');
                clockRef.current?.resume();
              }}
              className="rounded-xl border border-line bg-panel px-3.5 py-2.5 text-[13.5px] font-semibold text-ink hover:border-accent/60"
            >
              Try the practice once more
            </button>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                const next = nextConceptId(store, MICRO_CONCEPTS, Date.now());
                const concept = next ? MICRO_CONCEPTS.find((entry) => entry.id === next) : null;
                if (concept && concept.id !== active.id) begin(concept, 'learn');
                else back();
              }}
              className="rounded-xl bg-accent px-4 py-2.5 text-[14px] font-bold text-inverse shadow-sm hover:bg-accent/80"
              data-testid="micro-next-concept"
            >
              {nextConceptId(store, MICRO_CONCEPTS, Date.now()) ? 'Next concept' : 'Back to all concepts'}
            </button>
            <button
              type="button"
              onClick={back}
              className="rounded-xl border border-line bg-panel px-3.5 py-2.5 text-[13.5px] font-semibold text-muted hover:text-ink"
            >
              All concepts
            </button>
          </div>
        </section>
      ) : null}

      {stage === 'done' && result?.kind === 'learn' ? renderResources(active) : null}
    </div>
  ) : null;

  return (
    <div data-testid="tab-micro" className="micro-shell space-y-3 sm:space-y-4">
      <section className={`${CARD} relative overflow-hidden border-accent/30`}>
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_18%,var(--accent-soft),transparent_36%),radial-gradient(circle_at_12%_90%,var(--purple),transparent_30%)] opacity-80" />
        <div className="relative grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-4">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent sm:text-[11px]">Beta · subject-agnostic engine</p>
            <h1 className="mt-1 font-display text-2xl font-bold leading-tight text-ink sm:text-3xl md:text-4xl">
              Micro-learning
            </h1>
            <p className="mt-1.5 max-w-[62ch] text-[13.5px] leading-relaxed text-muted sm:mt-2 sm:text-[15px]">
              Seven P.1 concepts, each about two minutes. Local-only progress; no account, no cloud,
              no generated content. Follow one curious thread at a time and let the small wins stack up.
            </p>
          </div>
          <div className="grid w-full grid-cols-3 gap-x-3 gap-y-1 rounded-xl border border-line-soft bg-canvas/90 px-3.5 py-2.5 font-mono text-[11px] text-muted sm:w-auto sm:grid-cols-1">
            <p>{MICRO_CONCEPTS.length} concepts</p>
            <p>{store.events.length} evidence events</p>
            <p>{persistent ? 'saved on this device' : 'not saved'}</p>
          </div>
        </div>
      </section>

      {!persistent ? (
        <p role="status" className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3.5 py-2.5 text-[13px] text-amber-200">
          Progress won't be saved — this browser's storage is blocked or full. The activities still work.
        </p>
      ) : null}
      {note ? (
        <p role="status" className="rounded-xl border border-line bg-panel px-3.5 py-2.5 text-[13px] text-muted">
          {note}
        </p>
      ) : null}

      {active ? detail : overview}

      {debugReadout ? React.createElement(debugReadout) : null}
    </div>
  );
};
