import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, Compass, Lock } from 'lucide-react';
import { PYTHON_LESSONS } from '../../data/pythonLessonsData.ts';
import {
  buildLearningPath,
  pathDistricts,
  pathSummary,
  stateLabel,
  type PathDistrict,
  type PathNode,
  type PathState,
} from '../../learningPath.ts';
import { bandForRows, layoutPath, pathD } from '../../learningPathLayout.ts';
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
 * A page, not a tab: the shell owns sixteen tabs and this is a destination reached from Home and
 * from Lessons, in the same way Home and the introduction are. It is lazy-loaded, so the
 * workbench's initial bundle does not carry the city or its style sheet.
 *
 * Everything drawn here is derived: the platforms are every row of `pythonLessonsData` in its own
 * order, the districts are contiguous runs of those rows (`pathDistricts`), their counts and states
 * come from the verified map the workbench already reads, and the layout is
 * `learningPathLayout`'s percentage points. There is no page-size limit and no phase filter: a row
 * added to the registry appears here on the next build.
 *
 * The sticky district strip is the map: it names every district, shows its verified count, jumps to
 * its first platform, and follows the scroll. The bands inside the world carry the same names as the
 * learner travels through them.
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

function prefersReducedMotion(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  } catch {
    return false;
  }
}

const districtDomId = (district: PathDistrict, index: number) => `${district.key}-${index}`;

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
  const districts = useMemo(() => pathDistricts(nodes), [nodes]);
  const columns = phone ? 1 : 3;
  const points = useMemo(
    () =>
      layoutPath(nodes.length, {
        columns,
        // Each district starts on its own row, so a full-width band cannot overlap the next one.
        groups: districts.map((district) => district.count),
      }),
    [nodes.length, columns, districts]
  );
  const rows = points.length === 0 ? 1 : points[points.length - 1].row + 1;
  const road = useMemo(() => pathD(points), [points]);
  const summary = pathSummary(nodes);
  const percent = summary.total === 0 ? 0 : Math.round((summary.done / summary.total) * 100);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = nodes.find((node) => node.lesson.id === selectedId) ?? null;
  const nodeRefs = useRef(new Map<string, HTMLButtonElement>());
  const bandRefs = useRef(new Map<string, HTMLDivElement>());
  const chipRefs = useRef(new Map<number, HTMLButtonElement>());
  const navRef = useRef<HTMLDivElement | null>(null);
  const [activeDistrict, setActiveDistrict] = useState(0);
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
      const height = 360;
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

  // Which district is on screen: the last band whose top has passed under the sticky strip. This is
  // the map's cursor, not a second progress store.
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      let next = 0;
      districts.forEach((district, index) => {
        const band = bandRefs.current.get(districtDomId(district, index));
        if (band && band.getBoundingClientRect().top <= 170) next = index;
      });
      // The last platform cannot reach the sticky strip: the document ends beneath it. At the
      // bottom of the page the final district is the one on screen, by definition.
      if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 8) {
        next = Math.max(0, districts.length - 1);
      }
      setActiveDistrict((prev) => (prev === next ? prev : next));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [districts, phone]);

  // Keep the map's cursor visible in the horizontally scrolling strip.
  useEffect(() => {
    const nav = navRef.current;
    const chip = chipRefs.current.get(activeDistrict);
    if (!nav || !chip) return;
    const target = chip.offsetLeft - nav.clientWidth / 2 + chip.clientWidth / 2;
    if (Math.abs(nav.scrollLeft - target) < 24) return;
    nav.scrollTo({ left: target, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, [activeDistrict]);

  const select = (node: PathNode) => {
    setSelectedId(node.lesson.id);
    rememberPath({ selectedId: node.lesson.id });
  };

  const jumpTo = (district: PathDistrict) => {
    const element = nodeRefs.current.get(district.firstLessonId);
    if (!element) return;
    element.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'start',
    });
  };

  return (
    <main className="lp-root" data-testid="learning-path">
      <header className="lp-header">
        <div>
          <p className="lp-kicker">
            <Compass className="h-4 w-4" aria-hidden="true" /> Learning Path
          </p>
          <h1 className="lp-title">Every lesson, one platform at a time</h1>
          <p className="lp-sub">
            All {summary.total} lessons in the registry&apos;s own order: Python, the math on-ramp,
            Stage 0, tracks 00–08 and every module lab. The city is {districts.length} districts on
            one road, and the path is a view of the course the runner grades — never a second course.
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
            Open the runner ({PYTHON_LESSONS.length} lessons)
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

      <nav className="lp-districts" aria-label="Learning Path districts" data-testid="lp-districts">
        <span className="lp-districts-title">Map</span>
        <div className="lp-districts-track" ref={navRef}>
          {districts.map((district, index) => (
            <button
              key={districtDomId(district, index)}
              type="button"
              ref={(element) => {
                if (element) chipRefs.current.set(index, element);
                else chipRefs.current.delete(index);
              }}
              className="lp-district-chip"
              data-active={activeDistrict === index ? 'true' : 'false'}
              data-testid={`lp-district-${index}`}
              aria-current={activeDistrict === index ? 'location' : undefined}
              aria-label={`${district.label}: ${district.done} of ${district.count} verified. Jump to its first lesson.`}
              onClick={() => jumpTo(district)}
            >
              <span className="lp-district-name">{district.short}</span>
              <span className="lp-district-count">
                {district.done}/{district.count}
              </span>
            </button>
          ))}
        </div>
      </nav>

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

        {districts.map((district, index) => {
          const band = bandForRows(
            points[district.first].row,
            points[district.last].row,
            rows
          );
          return (
            <div
              key={districtDomId(district, index)}
              ref={(element) => {
                if (element) bandRefs.current.set(districtDomId(district, index), element);
                else bandRefs.current.delete(districtDomId(district, index));
              }}
              className="lp-band"
              data-region={district.region}
              data-active={activeDistrict === index ? 'true' : 'false'}
              data-testid={`lp-band-${index}`}
              style={{ top: `${band.top}%`, height: `${band.height}%` }}
              aria-hidden="true"
            >
              <span className="lp-band-label">
                <span className="lp-band-number">{String(index + 1).padStart(2, '0')}</span>
                {district.label}
              </span>
            </div>
          );
        })}

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
              data-district={node.district}
              data-testid={`lp-lesson-${node.lesson.id}`}
              aria-label={`Lesson ${node.index} of ${nodes.length}: ${node.lesson.title}. ${node.districtLabel}. ${stateLabel(node.state)}`}
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
          total={nodes.length}
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
          <LessonPreviewBody node={selected} total={nodes.length} onStart={onStartLesson} />
        </Sheet>
      )}
    </main>
  );
};
