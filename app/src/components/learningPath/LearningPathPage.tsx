import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Compass,
  Lock,
} from 'lucide-react';
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
import {
  districtTheme,
  DistrictScenery,
  SkyScenery,
  WorldCanal,
  WorldGround,
} from './CityScenery.tsx';
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
  const districtsDone = districts.filter((district) => district.done === district.count).length;
  const quarters = new Set(nodes.map((node) => node.region)).size;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = nodes.find((node) => node.lesson.id === selectedId) ?? null;
  const nodeRefs = useRef(new Map<string, HTMLButtonElement>());
  const bandRefs = useRef(new Map<string, HTMLDivElement>());
  const chipRefs = useRef(new Map<number, HTMLButtonElement>());
  const navRef = useRef<HTMLDivElement | null>(null);
  const [activeDistrict, setActiveDistrict] = useState(0);
  const [allDistricts, setAllDistricts] = useState(false);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const active = districts[Math.min(activeDistrict, districts.length - 1)] ?? null;

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

  const select = (node: PathNode) => {
    setSelectedId(node.lesson.id);
    rememberPath({ selectedId: node.lesson.id });
  };

  // Keep the phone's chapter strip centred on the district that is on screen. The desktop board
  // is a wrapping grid with no overflow, so this is a no-op there.
  useEffect(() => {
    const nav = navRef.current;
    const chip = chipRefs.current.get(activeDistrict);
    if (!nav || !chip || nav.scrollWidth <= nav.clientWidth + 2) return;
    const target = chip.offsetLeft - nav.clientWidth / 2 + chip.clientWidth / 2;
    nav.scrollTo({
      left: Math.max(0, target),
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  }, [activeDistrict]);

  const jumpTo = (district: PathDistrict) => {
    const element = nodeRefs.current.get(district.firstLessonId);
    if (!element) return;
    element.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'start',
    });
  };

  const stepDistrict = (delta: number) => {
    const next = districts[Math.max(0, Math.min(districts.length - 1, activeDistrict + delta))];
    if (next && next !== active) jumpTo(next);
  };

  return (
    <main className="lp-root" data-testid="learning-path">
      <header className="lp-header">
        <div className="lp-header-copy">
          <p className="lp-kicker">
            <Compass className="h-4 w-4" aria-hidden="true" /> MechaLab Learning Path
          </p>
          <h1 className="lp-title">Explore the engineering city</h1>
          <p className="lp-sub">
            One road through all {summary.total} lessons and {districts.length} districts, from
            Python to the capstone. Preview a landmark; verified stops light their windows and the
            next raises a flag.
          </p>
          <p className="lp-facts" aria-label="The city at a glance">
            <span>
              <strong>{summary.total}</strong> stops
            </span>
            <span>
              <strong>{districts.length}</strong> districts
            </span>
            <span>
              <strong>{quarters}</strong> quarters
            </span>
            <span>one continuous road</span>
          </p>
        </div>
        <aside className="lp-aside" aria-label="Your progress through the city">
          <div className="lp-aside-top">
            <div>
              <span className="lp-aside-label">Expedition progress</span>
              <p className="lp-progress" data-testid="lp-progress">
                {summary.done} of {summary.total} verified
              </p>
            </div>
            <span className="lp-aside-percent">{percent}%</span>
          </div>
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
          <div className="lp-aside-foot">
            <p className="lp-aside-note">
              {districtsDone === 0
                ? 'The first district is waiting.'
                : `${districtsDone} of ${districts.length} districts fully lit.`}
            </p>
            <button type="button" className="lp-runner-link" onClick={onOpenRunner}>
              Open the runner
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </aside>
      </header>

      <ul className="lp-legend" aria-label="Platform states">
        <li className="lp-legend-title" aria-hidden="true">
          Reading the city
        </li>
        {STATES.map((state) => (
          <li key={state} className="lp-legend-item" data-state={state}>
            <span className="lp-legend-dot" aria-hidden="true" />
            <span className="lp-legend-name">{stateLabel(state)}</span>
            <span className="lp-legend-note">{STATE_NOTE[state]}</span>
          </li>
        ))}
      </ul>

      <nav
        className="lp-districts"
        aria-label="Learning Path districts"
        data-testid="lp-districts"
        data-expanded={allDistricts ? 'true' : 'false'}
      >
        <div className="lp-map-bar">
          <div className="lp-map-heading">
            <p className="lp-map-eyebrow">Course map</p>
            <div className="lp-map-current" aria-live="polite">
              <span className="lp-map-index">
                {String(activeDistrict + 1).padStart(2, '0')}
              </span>
              <span className="lp-map-title">{active?.label ?? 'The city'}</span>
              {active && (
                <span className="lp-map-count">
                  {active.done}/{active.count} verified
                </span>
              )}
            </div>
          </div>
          <div className="lp-map-actions">
            <button
              type="button"
              className="lp-map-step"
              onClick={() => stepDistrict(-1)}
              disabled={activeDistrict <= 0}
              aria-label="Previous district"
            >
              <ChevronLeft aria-hidden="true" />
            </button>
            <label className="lp-map-jump">
              <span className="lp-map-jump-label">Travel to</span>
              <select
                aria-label="Jump to district"
                value={activeDistrict}
                onChange={(event) => {
                  const next = districts[Number(event.target.value)];
                  if (next) jumpTo(next);
                }}
              >
                {districts.map((district, index) => (
                  <option key={districtDomId(district, index)} value={index}>
                    {String(index + 1).padStart(2, '0')} · {district.label} ({district.done}/
                    {district.count})
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="lp-map-step"
              onClick={() => stepDistrict(1)}
              disabled={activeDistrict >= districts.length - 1}
              aria-label="Next district"
            >
              <ChevronRight aria-hidden="true" />
            </button>
            <button
              type="button"
              className="lp-map-toggle"
              aria-expanded={allDistricts}
              aria-controls="lp-districts-track"
              onClick={() => setAllDistricts((open) => !open)}
            >
              {allDistricts ? 'Compact map' : `All ${districts.length} districts`}
              {allDistricts ? (
                <ChevronUp aria-hidden="true" />
              ) : (
                <ChevronDown aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
        <div
          className="lp-districts-track"
          id="lp-districts-track"
          ref={navRef}
        >
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
              <span className="lp-district-full">{district.label}</span>
              <span className="lp-district-count">
                {district.done}/{district.count}
              </span>
              <span className="lp-district-meter" aria-hidden="true">
                <span
                  className="lp-district-meter-fill"
                  style={{
                    width: `${district.count === 0 ? 0 : (district.done / district.count) * 100}%`,
                  }}
                />
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
        <SkyScenery />
        <WorldGround />
        <WorldCanal />

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
              data-theme={districtTheme(district.key, district.region)}
              data-active={activeDistrict === index ? 'true' : 'false'}
              data-testid={`lp-band-${index}`}
              style={{ top: `${band.top}%`, height: `${band.height}%` }}
              aria-hidden="true"
            >
              <DistrictScenery
                theme={districtTheme(district.key, district.region)}
                variant={index}
              />
              <span className="lp-band-label">
                <span className="lp-band-number">{String(index + 1).padStart(2, '0')}</span>
                <span className="lp-band-name">{district.label}</span>
                <span className="lp-band-count">
                  {district.done}/{district.count}
                </span>
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
          <path className="lp-road-curb" d={road} vectorEffect="non-scaling-stroke" />
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
              data-theme={districtTheme(node.district, node.region)}
              data-testid={`lp-lesson-${node.lesson.id}`}
              aria-label={`Lesson ${node.index} of ${nodes.length}: ${node.lesson.title}. ${node.districtLabel}. ${stateLabel(node.state)}`}
              data-selected={selectedId === node.lesson.id ? 'true' : 'false'}
              style={{ left: `${point.x}%`, top: `${point.y}%` }}
              onClick={() => select(node)}
            >
              <span
                className="lp-platform"
                data-theme={districtTheme(node.district, node.region)}
                aria-hidden="true"
              >
                <span className="lp-platform-shadow" />
                <span className="lp-plaza" />
                <Landmark kind={node.landmark} locked={node.state === 'locked'} />
                <span className="lp-state-ring" />
                {node.state === 'completed' && (
                  <>
                    <span className="lp-spark lp-spark-a" />
                    <span className="lp-spark lp-spark-b" />
                    <span className="lp-spark lp-spark-c" />
                    <Check className="lp-mark lp-mark-check" />
                  </>
                )}
                {node.state === 'locked' && <Lock className="lp-mark lp-mark-lock" />}
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
