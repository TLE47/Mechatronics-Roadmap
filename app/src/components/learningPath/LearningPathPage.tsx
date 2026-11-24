import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, Compass, Lock } from 'lucide-react';
import { PYTHON_LESSONS } from '../../data/pythonLessonsData.ts';
import {
  buildLearningPath,
  pathSummary,
  stateLabel,
  type PathNode,
  type PathState,
} from '../../learningPath.ts';
import { layoutPath, pathD, pathRows } from '../../learningPathLayout.ts';
import { readPathMemory, rememberPath } from '../../learningPathScroll.ts';
import { readLastLessonId } from '../../lastLesson.ts';
import { PHONE_VIEWPORT_QUERY } from '../../phoneViewport.ts';
import { useMediaQuery } from '../../useMediaQuery.ts';
import { Sheet } from '../Sheet';
import { Landmark } from './Landmarks.tsx';
import { LessonPreviewBody, LessonPreviewCard } from './LessonPreview.tsx';
import './learningPath.css';

/**
 * The Learning Path (`app/src/components/learningPath/LearningPathPage.tsx`).
 *
 * A page, not a tab: the shell owns sixteen tabs and this is a destination reached from the
 * Home page and from Lessons, in the same way Home and the introduction are. It is lazy-loaded,
 * so the workbench's initial bundle does not carry the city or its style sheet.
 *
 * Everything drawn here is derived: the six platforms are rows from `pythonLessonsData`, their
 * states come from the verified map the workbench already reads, and the layout is
 * `learningPathLayout`'s percentage points. Starting a lesson goes through the App's existing
 * `openLesson`, so the runner, the cloud snapshot and the lesson history see exactly what they see
 * when the learner picks the lesson from the chooser.
 */

interface LearningPathPageProps {
  verified: Record<string, boolean>;
  onStartLesson: (lessonId: string) => void;
  onOpenRunner: () => void;
}

const STATES: PathState[] = ['completed', 'current', 'available', 'locked'];

const STATE_NOTE: Record<PathState, string> = {
  completed: 'verified',
  current: 'the next one to earn',
  available: 'one step ahead',
  locked: 'preview only',
};

export const LearningPathPage: React.FC<LearningPathPageProps> = ({
  verified,
  onStartLesson,
  onOpenRunner,
}) => {
  const phone = useMediaQuery(PHONE_VIEWPORT_QUERY);
  const [lastLessonId] = useState<string | null>(() => {
    try {
      return readLastLessonId();
    } catch {
      return null;
    }
  });
  const nodes = useMemo(
    () => buildLearningPath({ verified, lastLessonId }),
    [verified, lastLessonId]
  );
  const columns = phone ? 1 : 3;
  const points = useMemo(
    () => layoutPath(nodes.length, { columns, top: phone ? 8 : 13, bottom: phone ? 8 : 13 }),
    [nodes.length, columns, phone]
  );
  const rows = pathRows(nodes.length, columns);
  const road = useMemo(() => pathD(points), [points]);
  const summary = pathSummary(nodes);
  const percent = summary.total === 0 ? 0 : Math.round((summary.done / summary.total) * 100);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = nodes.find((node) => node.lesson.id === selectedId) ?? null;
  const nodeRefs = useRef(new Map<string, HTMLButtonElement>());
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);

  // A lesson started from the path unmounts it. Put the learner back where they were when they
  // come back: the offset is read once, after the world has been laid out.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const { y } = readPathMemory();
    if (y <= 0) return;
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => window.scrollTo(0, y));
    });
    return () => {
      cancelAnimationFrame(outer);
      if (inner) cancelAnimationFrame(inner);
    };
  }, []);

  useEffect(() => {
    if (!selected) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  // The card sits beside its platform. It follows a scroll or a resize, and never leaves the
  // viewport, so a platform near the right edge gets its card on the left.
  useEffect(() => {
    if (!selected || phone) {
      setAnchor(null);
      return;
    }
    let frame = 0;
    const place = () => {
      const element = nodeRefs.current.get(selected.lesson.id);
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const width = 336;
      const height = 330;
      const gap = 14;
      const margin = 12;
      const right = rect.right + gap;
      const left = rect.left - gap - width;
      const x = right + width <= window.innerWidth - margin ? right : Math.max(margin, left);
      const y = Math.min(
        window.innerHeight - height - margin,
        Math.max(margin, rect.top - 24)
      );
      setAnchor({ x, y });
    };
    frame = requestAnimationFrame(place);
    const onMove = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    window.addEventListener('scroll', onMove, { passive: true });
    window.addEventListener('resize', onMove);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onMove);
      window.removeEventListener('resize', onMove);
    };
  }, [selected, phone]);

  const select = (node: PathNode) => {
    setSelectedId(node.lesson.id);
    rememberPath({ selectedId: node.lesson.id });
  };

  return (
    <main className="lp-root" data-testid="learning-path">
      <header className="lp-header">
        <div>
          <p className="lp-kicker">
            <Compass className="h-4 w-4" aria-hidden="true" /> Learning Path
          </p>
          <h1 className="lp-title">Python, one platform at a time</h1>
          <p className="lp-sub">
            Six lessons from the same registry the runner grades: P.1, P.2, P.2.5, P.3, P.4 and
            P.5. The city grows a platform at a time — the path is a view of the course, never a
            second course.
          </p>
        </div>
        <div className="lp-aside">
          <p className="lp-progress" data-testid="lp-progress">
            {summary.done} of {summary.total} verified
          </p>
          <div
            className="lp-meter"
            role="progressbar"
            aria-label="Lessons verified"
            aria-valuemin={0}
            aria-valuemax={summary.total}
            aria-valuenow={summary.done}
          >
            <span className="lp-meter-fill" style={{ width: `${percent}%` }} />
          </div>
          <button type="button" className="lp-runner-link" onClick={onOpenRunner}>
            All {PYTHON_LESSONS.length} lessons
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </header>

      <ul className="lp-legend" aria-label="Platform states">
        {STATES.map((state) => (
          <li key={state} className="lp-legend-item" data-state={state}>
            <span className="lp-legend-dot" aria-hidden="true" />
            <span className="lp-legend-name">{stateLabel(state)}</span>
            <span className="lp-legend-note">{STATE_NOTE[state]}</span>
          </li>
        ))}
      </ul>

      <div
        className="lp-world"
        data-testid="lp-world"
        style={{ '--lp-rows': rows } as React.CSSProperties}
      >
        <div className="lp-sky" aria-hidden="true">
          <svg viewBox="0 0 1200 300" preserveAspectRatio="none">
            <g className="lp-skyline">
              <rect x="0" y="180" width="90" height="120" />
              <rect x="96" y="140" width="54" height="160" />
              <rect x="158" y="205" width="120" height="95" />
              <rect x="290" y="120" width="70" height="180" />
              <rect x="370" y="170" width="150" height="130" />
              <rect x="532" y="90" width="48" height="210" />
              <rect x="590" y="160" width="120" height="140" />
              <rect x="720" y="200" width="90" height="100" />
              <rect x="820" y="130" width="64" height="170" />
              <rect x="894" y="180" width="130" height="120" />
              <rect x="1034" y="110" width="58" height="190" />
              <rect x="1100" y="190" width="100" height="110" />
            </g>
          </svg>
        </div>

        <svg
          className="lp-road"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path className="lp-road-bed" d={road} vectorEffect="non-scaling-stroke" />
          <path className="lp-road-line" d={road} vectorEffect="non-scaling-stroke" />
        </svg>

        {nodes.map((node, index) => {
          const point = points[index];
          return (
            <button
              key={node.lesson.id}
              type="button"
              ref={(element) => {
                if (element) nodeRefs.current.set(node.lesson.id, element);
                else nodeRefs.current.delete(node.lesson.id);
              }}
              className="lp-node"
              data-state={node.state}
              data-testid={`lp-lesson-${node.lesson.id}`}
              aria-label={`Lesson ${node.index}: ${node.lesson.title}. ${stateLabel(node.state)}`}
              data-selected={selectedId === node.lesson.id ? 'true' : 'false'}
              style={{ left: `${point.x}%`, top: `${point.y}%` }}
              onClick={() => select(node)}
            >
              <span className="lp-platform" aria-hidden="true">
                <span className="lp-platform-shadow" />
                <Landmark kind={node.landmark} locked={node.state === 'locked'} />
                {node.state === 'completed' && (
                  <Check className="lp-mark lp-mark-check" aria-hidden="true" />
                )}
                {node.state === 'locked' && (
                  <Lock className="lp-mark lp-mark-lock" aria-hidden="true" />
                )}
              </span>
              <span className="lp-label">
                <span className="lp-number">{node.index}</span>
                <span className="lp-name">{node.lesson.title}</span>
              </span>
              {node.state === 'current' && <span className="lp-now">Current</span>}
            </button>
          );
        })}
      </div>

      <footer className="lp-foot">
        <p>
          A lock is this page&apos;s rule, not the runner&apos;s: every lesson in the registry still
          opens from its own link or the lesson list.
        </p>
        <button type="button" className="lp-runner-link" onClick={onOpenRunner}>
          Open the runner
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </footer>

      {selected && !phone && anchor && (
        <LessonPreviewCard
          node={selected}
          x={anchor.x}
          y={anchor.y}
          onStart={onStartLesson}
          onClose={() => setSelectedId(null)}
        />
      )}

      {selected && phone && (
        <Sheet
          open
          onClose={() => setSelectedId(null)}
          title={selected.lesson.title}
          testId="lp-preview-sheet"
          size="md"
          titleLines={2}
        >
          <LessonPreviewBody node={selected} onStart={onStartLesson} />
        </Sheet>
      )}
    </main>
  );
};
