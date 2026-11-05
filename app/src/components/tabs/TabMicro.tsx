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
import { lessonPageUrl } from '../../startHere';

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

const CARD = 'rounded-xl border border-line bg-panel p-4';

export const TabMicro: React.FC<TabMicroProps> = ({ openLesson }) => {
  const [store, setStore] = useState<MicroStore>(() => microProgress.read());
  const [persistent, setPersistent] = useState(() => microProgress.persistent());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>('overview');
  const [answers, setAnswers] = useState<Record<string, string>>({});
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
    setResult(null);
    setNote('');
    setMissed([]);
    setDiagnosticScore(0);
    if (concept.id === activeId) clockRef.current?.resume();
  };

  const back = () => {
    if (clockRef.current) {
      clockRef.current.pause();
      writeClockSnapshot(activeId ?? '', clockRef.current.snapshot());
    }
    setActiveId(null);
    setStage('overview');
    setAnswers({});
    setResult(null);
    setNote('');
  };

  const finish = () => {
    const next = clockRef.current?.tick();
    if (next) setReading(next);
    clockRef.current?.pause();
    setStage('done');
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
    const correct = active.diagnostics.filter((question) => gradeAnswer(question, answers[question.id] ?? '')).length;
    const score = correct as 0 | 1 | 2;
    const missedQuestions = active.diagnostics
      .filter((question) => !gradeAnswer(question, answers[question.id] ?? ''))
      .map((question) => question.explanation);
    setDiagnosticScore(score);
    setMissed(missedQuestions);
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
      finish();
      if (!saved) setNote('The clean diagnostics were not saved.');
      return;
    }
    setStage('practice');
    setAnswers({});
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
    setResult({ kind: 'learn', score: diagnosticScore, practice: correct, missed });
    finish();
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
    setResult({ kind: 'review', correct, total: reviewQuestions.length });
    setReviewAttempt((attempt) => attempt + 1);
    finish();
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
    setResult({ kind: 'challenge', passed: correct });
    finish();
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
    return (
      <fieldset key={question.id} className="rounded-lg border border-line-soft bg-canvas p-3">
        <legend className="px-1 font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
          {index + 1} / {question.type === 'choice' ? 'choose one' : 'short answer'}
        </legend>
        <p className="text-[13px] font-semibold text-ink">{question.prompt}</p>
        {question.code ? (
          <pre className="mt-2 overflow-x-auto rounded-md border border-line-soft bg-panel p-2 font-mono text-[11.5px] text-body">
            {question.code}
          </pre>
        ) : null}
        {question.type === 'short' ? (
          <input
            value={selected}
            onChange={(event) => setAnswers((previous) => ({ ...previous, [question.id]: event.target.value }))}
            aria-label={question.prompt}
            className="mt-2 w-full rounded-md border border-line bg-panel px-2.5 py-1.5 font-mono text-[12px] text-ink"
          />
        ) : (
          <div className="mt-2 grid gap-1.5">
            {(question.options ?? []).map((option) => (
              <label
                key={option.id}
                className={`flex cursor-pointer items-start gap-2 rounded-md border px-2.5 py-2 text-[12.5px] ${
                  selected === option.id
                    ? 'border-accent bg-accent-soft text-ink'
                    : 'border-line-soft bg-panel text-body hover:border-line'
                }`}
              >
                <input
                  type="radio"
                  name={question.id}
                  value={option.id}
                  checked={selected === option.id}
                  onChange={() => setAnswers((previous) => ({ ...previous, [question.id]: option.id }))}
                  className="mt-0.5"
                />
                <span>{option.text}</span>
              </label>
            ))}
          </div>
        )}
      </fieldset>
    );
  };

  const renderResources = (concept: MicroConcept) => {
    const resources = resourcesFor(concept);
    if (!resources.length) return null;
    return (
      <div className="rounded-lg border border-line-soft bg-canvas p-3" data-testid="micro-resources">
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">Go deeper (optional)</p>
        <ul className="mt-2 space-y-1.5">
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
                <span className="ml-1 text-[10px] text-faint">
                  {resource.role === 'primary' ? 'primary' : 'optional'} · {resource.lastVerified}
                </span>
              </span>
            </li>
          ))}
        </ul>
        {optionalResources(concept).length === 0 ? (
          <p className="mt-1 text-[11px] text-muted">The parent lesson is the only required reading.</p>
        ) : null}
      </div>
    );
  };

  const overview = (
    <div className="space-y-3" data-testid="micro-overview">
      <section className={`${CARD} border-accent/30`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent">P.1 · seven tiny concepts</p>
            <h2 className="mt-1 text-base font-bold text-ink">One idea, then a check that cannot be guessed</h2>
            <p className="mt-1 max-w-[65ch] text-[12.5px] leading-relaxed text-muted">
              Learn a single concept in about two minutes, answer two diagnostics, then review it
              tomorrow. A clean diagnostic is provisional; a review or challenge consolidates it. The
              parent lesson P.1 is never marked verified from here.
            </p>
          </div>
          <div className="rounded-lg border border-line-soft bg-canvas px-3 py-2 text-right">
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-faint">Due now</p>
            <p className="font-mono text-2xl font-bold tabular-nums text-ink">{due.length}</p>
          </div>
        </div>
        {suggested ? (
          <button
            type="button"
            onClick={() => {
              const concept = MICRO_CONCEPTS.find((entry) => entry.id === suggested);
              if (concept) begin(concept, 'learn');
            }}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-[12.5px] font-bold text-inverse hover:bg-accent/80"
            data-testid="micro-next"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            {suggested && store.concepts[suggested] ? 'Continue with' : 'Start with'}{' '}
            {MICRO_CONCEPTS.find((concept) => concept.id === suggested)?.title}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : (
          <p className="mt-3 rounded-lg border border-emerald/30 bg-emerald/5 px-3 py-2 text-[12px] text-emerald">
            All seven P.1 concepts have been learned. Reviews return on their own schedule; start
            any concept from the list whenever you want.
          </p>
        )}
      </section>

      {due.length > 0 ? (
        <section className={CARD} data-testid="micro-due">
          <div className="flex items-center gap-2">
            <Clock3 className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2 className="text-sm font-bold text-ink">Due now</h2>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {due.map((id) => {
              const concept = MICRO_CONCEPTS.find((entry) => entry.id === id);
              return concept ? (
                <button
                  key={id}
                  type="button"
                  onClick={() => begin(concept, 'review')}
                  className="rounded-full border border-accent/50 bg-accent-soft px-3 py-1 text-[11.5px] font-semibold text-accent"
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
          <h2 className="text-sm font-bold text-ink">Seven P.1 concepts</h2>
        </div>
        <ul className="mt-2 divide-y divide-line-soft">
          {MICRO_CONCEPTS.map((concept, index) => {
            const conceptState = store.concepts[concept.id];
            const label = statusLabel(conceptState, concept, Date.now());
            const canReview = Boolean(conceptState?.learnCompletedAt);
            return (
              <li key={concept.id} className="flex flex-wrap items-center gap-2 py-2.5" data-testid={`micro-concept-${concept.id}`}>
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-line-soft font-mono text-[10px] text-faint">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-semibold text-ink">{concept.title}</p>
                  <p className="text-[10.5px] text-muted">
                    {label} · {concept.timing.learn.estimatedSeconds}s designed
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => begin(concept, 'learn')}
                  className="rounded-md border border-line bg-panel px-2.5 py-1 text-[11px] font-semibold text-ink hover:border-accent/60 hover:text-accent"
                  data-testid={`micro-learn-${concept.id}`}
                >
                  {canReview ? 'Learn again' : 'Learn'}
                </button>
                {canReview ? (
                  <>
                    <button
                      type="button"
                      onClick={() => begin(concept, 'review')}
                      className="rounded-md border border-line bg-panel px-2.5 py-1 text-[11px] font-semibold text-ink hover:border-accent/60 hover:text-accent"
                      data-testid={`micro-review-${concept.id}`}
                    >
                      Review
                    </button>
                    <button
                      type="button"
                      onClick={() => begin(concept, 'challenge')}
                      className="rounded-md border border-line bg-panel px-2.5 py-1 text-[11px] font-semibold text-ink hover:border-accent/60 hover:text-accent"
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
    <div className="space-y-3" data-testid="micro-detail">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={back}
            className="inline-flex items-center gap-1 text-[12px] text-muted hover:text-ink"
            data-testid="micro-back"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            All concepts
          </button>
          <a
            href={`${lessonPageUrl(MICRO_CATALOG.parentPath)}#${active.anchor}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[11.5px] text-muted underline decoration-dotted underline-offset-2 hover:text-accent"
            data-testid="micro-source-anchor"
          >
            Read this section in P.1
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        </div>
        <div className="flex items-center gap-2 font-mono text-[11px] text-muted" data-testid="micro-timer">
          <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{formatClock(reading.adjustedSeconds)}</span>
          <span className="text-faint">/ target {active.timing.learn.estimatedSeconds}s</span>
        </div>
      </div>

      <section className={`${CARD} border-accent/30`}>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
          {stageTitle(stage)} · P.1 · {active.title}
        </p>
        <p className="mt-1 text-[12px] text-muted">{MICRO_CATALOG.title}</p>
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
        <section className={`${CARD} space-y-3`} data-testid="micro-teaching">
          {active.teaching.map((paragraph) => (
            <p key={paragraph} className="text-[13px] leading-relaxed text-body">
              {paragraph}
            </p>
          ))}
          <pre className="overflow-x-auto rounded-lg border border-line-soft bg-canvas p-3 font-mono text-[12px] text-body">
            {active.example.code}
          </pre>
          <div className="rounded-lg border border-line-soft bg-canvas p-2.5">
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-faint">Output</p>
            <pre className="mt-1 whitespace-pre-wrap font-mono text-[12px] text-emerald">{active.example.output}</pre>
          </div>
          <button
            type="button"
            onClick={() => {
              setStage('diagnostics');
              setAnswers({});
              setNote('');
              clockRef.current?.resume();
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-[12.5px] font-bold text-inverse hover:bg-accent/80"
            data-testid="micro-start-diagnostics"
          >
            Start the two checks
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          {renderResources(active)}
        </section>
      ) : null}

      {stage === 'diagnostics' ? (
        <section className={`${CARD} space-y-3`} data-testid="micro-diagnostics">
          <p className="text-[12.5px] text-muted">
            Two checks, no timer pressure. A wrong answer is used to choose the practice, not to score you.
          </p>
          {active.diagnostics.map((question, index) => renderQuestion(question, index))}
          <button
            type="button"
            disabled={busy || active.diagnostics.some((question) => !answers[question.id])}
            onClick={() => void submitDiagnostics()}
            className="rounded-lg bg-accent px-3.5 py-2 text-[12.5px] font-bold text-inverse disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="micro-submit-diagnostics"
          >
            Check both answers
          </button>
        </section>
      ) : null}

      {stage === 'practice' ? (
        <section className={`${CARD} space-y-3`} data-testid="micro-practice">
          <div className="rounded-lg border border-line-soft bg-canvas p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-accent">
              Targeted note · {diagnosticScore}/2
            </p>
            {diagnosticScore === 0 ? (
              <>
                <p className="mt-1 text-[12.5px] text-body">
                  Let's slow down and walk the worked example once more before the practice.
                </p>
                <pre className="mt-2 overflow-x-auto rounded-md border border-line-soft bg-panel p-2 font-mono text-[11.5px] text-body">
                  {active.example.code}
                </pre>
              </>
            ) : (
              <ul className="mt-2 space-y-1 text-[12px] text-body">
                {missed.map((explanation) => (
                  <li key={explanation} className="flex gap-1.5">
                    <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-accent" aria-hidden="true" />
                    {explanation}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {renderQuestion(active.practice, 0)}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !answers[active.practice.id]}
              onClick={() => void submitPractice()}
              className="rounded-lg bg-accent px-3.5 py-2 text-[12.5px] font-bold text-inverse disabled:cursor-not-allowed disabled:opacity-50"
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
              }}
              className="rounded-lg border border-line bg-panel px-3 py-2 text-[12px] font-semibold text-muted hover:text-ink"
            >
              Re-read the diagnostics
            </button>
          </div>
        </section>
      ) : null}

      {stage === 'review' ? (
        <section className={`${CARD} space-y-3`} data-testid="micro-review-stage">
          <p className="text-[12.5px] text-muted">
            A review is one concept at a time, two questions, all correct to consolidate.
          </p>
          {reviewQuestions.map((question, index) => renderQuestion(question, index))}
          <button
            type="button"
            disabled={busy || reviewQuestions.some((question) => !answers[question.id])}
            onClick={() => void submitReview()}
            className="rounded-lg bg-accent px-3.5 py-2 text-[12.5px] font-bold text-inverse disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="micro-submit-review"
          >
            Check both answers
          </button>
        </section>
      ) : null}

      {stage === 'challenge' ? (
        <section className={`${CARD} space-y-3`} data-testid="micro-challenge-stage">
          <p className="text-[12.5px] text-muted">
            One transfer question. A pass consolidates the concept for two weeks; a miss keeps what you
            have learned and schedules tomorrow.
          </p>
          {renderQuestion(active.challenge, 0)}
          <button
            type="button"
            disabled={busy || !answers[active.challenge.id]}
            onClick={() => void submitChallenge()}
            className="rounded-lg bg-accent px-3.5 py-2 text-[12.5px] font-bold text-inverse disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="micro-submit-challenge"
          >
            Check the challenge
          </button>
        </section>
      ) : null}

      {stage === 'done' && result ? (
        <section className={`${CARD} space-y-3`} data-testid="micro-result">
          <div className="flex items-start gap-2">
            <span className="rounded-full border border-emerald/40 bg-emerald/10 p-1.5 text-emerald">
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
              <p className="text-[13px] font-bold text-ink">{outcomeCopy(result)}</p>
              {result.kind === 'learn' && result.score !== 2 && result.practice === false ? (
                <p className="mt-1 text-[12px] text-muted">
                  The parent lesson P.1 remains unverified. This micro result is not a lesson pass.
                </p>
              ) : null}
              {result.kind === 'review' && result.correct !== result.total ? (
                <p className="mt-1 text-[12px] text-muted">
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
                setNote('');
                clockRef.current?.resume();
              }}
              className="rounded-lg border border-line bg-panel px-3 py-2 text-[12px] font-semibold text-ink hover:border-accent/60"
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
              className="rounded-lg bg-accent px-3.5 py-2 text-[12.5px] font-bold text-inverse hover:bg-accent/80"
              data-testid="micro-next-concept"
            >
              {nextConceptId(store, MICRO_CONCEPTS, Date.now()) ? 'Next concept' : 'Back to all concepts'}
            </button>
            <button
              type="button"
              onClick={back}
              className="rounded-lg border border-line bg-panel px-3 py-2 text-[12px] font-semibold text-muted hover:text-ink"
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
    <div data-testid="tab-micro" className="space-y-4">
      <section className={`${CARD} relative overflow-hidden border-accent/30`}>
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_20%,var(--accent-soft),transparent_42%)]" />
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent">Beta · subject-agnostic engine</p>
            <h1 className="mt-1 font-display text-xl font-bold text-ink">Micro-learning</h1>
            <p className="mt-1 max-w-[62ch] text-[12.5px] leading-relaxed text-muted">
              Seven P.1 concepts, each about two minutes. Local-only progress; no account, no cloud,
              no generated content. The tab stays beta until a beginner who has never seen MechaLab
              completes P.1 and reports where they got stuck.
            </p>
          </div>
          <div className="rounded-lg border border-line-soft bg-canvas px-3 py-2 font-mono text-[10px] text-muted">
            <p>{MICRO_CONCEPTS.length} concepts</p>
            <p>{store.events.length} evidence events</p>
            <p>{persistent ? 'saved on this device' : 'not saved'}</p>
          </div>
        </div>
      </section>

      {!persistent ? (
        <p role="status" className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-200">
          Progress won't be saved — this browser's storage is blocked or full. The activities still work.
        </p>
      ) : null}
      {note ? (
        <p role="status" className="rounded-lg border border-line bg-panel px-3 py-2 text-[12px] text-muted">
          {note}
        </p>
      ) : null}

      {active ? detail : overview}

      {debugReadout ? React.createElement(debugReadout) : null}
    </div>
  );
};
