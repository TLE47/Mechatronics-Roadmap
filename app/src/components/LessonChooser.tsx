import React from 'react';
import { Check, CheckCircle2, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import type { PythonLessonItem } from '../data/pythonLessonsData';
import { roadmapStepForLesson } from '../practiceLinks';
import { stepBreadcrumb } from '../spine';

/**
 * The lesson chooser (`app/src/components/LessonChooser.tsx`).
 *
 * It used to be a 4/12 column beside the work area, which cost a third of the width to a control
 * used once per lesson. It is a narrower rail now, so the lesson text and the editor can share what
 * it used to take; the search, the four filters and the list are unchanged.
 *
 * The rail is a search result list, so the search is the first thing that must read: a field with a
 * clear button and a live count, filter chips whose selected state is a filled accent rather than a
 * near-white wash, and one line per lesson. The green **Verified** mark is the promise of the whole
 * surface — it says the instructor's own checks passed — so it stays on every row, filtered or not,
 * and it is the brightest thing in the row rather than an afterthought on the far edge.
 */
export type TrackFilter = 'all' | 'onramp' | 'lessons' | 'modules';

interface LessonChooserProps {
  lessons: PythonLessonItem[];
  filteredLessons: PythonLessonItem[];
  trackFilter: TrackFilter;
  onTrackFilter: (filter: TrackFilter) => void;
  searchQuery: string;
  onSearchQuery: (query: string) => void;
  currentId: string;
  verifiedLessons: Record<string, boolean>;
  completedLessons: Record<string, boolean>;
  onSelect: (id: string) => void;
  /**
   * Extra classes for the frame. The phone's lesson sheet passes `max-h-none` and drops the border:
   * the sheet already owns the edge and the scroll, and a 760 px card inside a 90dvh sheet would
   * leave the list its own scrollbar inside another one.
   */
  className?: string;
  /** Inline max-height for the frame; `'none'` lets a sheet's body own the scroll. */
  maxHeight?: string;
  /**
   * Fold the rail to its strip. Omitted in a sheet: the list is already the whole surface there, and
   * a collapsed card inside a sheet would be a card with no room to be folded into.
   */
  onCollapse?: () => void;
}

export function LessonChooser({
  lessons,
  filteredLessons,
  trackFilter,
  onTrackFilter,
  searchQuery,
  onSearchQuery,
  currentId,
  verifiedLessons,
  completedLessons,
  onSelect,
  className = '',
  maxHeight,
  onCollapse,
}: LessonChooserProps) {
  const tracks: { id: TrackFilter; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: lessons.length },
    {
      id: 'modules',
      label: 'Graded modules',
      count: lessons.filter((lesson) => lesson.track === 'modules').length,
    },
    {
      id: 'lessons',
      label: 'Track lessons',
      count: lessons.filter(
        (lesson) =>
          lesson.track !== 'modules' && lesson.track !== 'track-p' && lesson.track !== 'ramp'
      ).length,
    },
    {
      id: 'onramp',
      label: 'Python on-ramp',
      count: lessons.filter((lesson) => lesson.track === 'track-p' || lesson.track === 'ramp').length,
    },
  ];
  const query = searchQuery.trim();
  const verifiedCount = filteredLessons.filter((lesson) => verifiedLessons[lesson.id]).length;

  return (
    <div
      data-testid="lesson-list-card"
      data-chrome="lesson-list"
      className={`flex max-h-[760px] flex-col overflow-hidden rounded-xl border border-line bg-panel ${className}`}
      style={maxHeight ? { maxHeight } : undefined}
    >
      <div className="border-b border-line-soft bg-canvas/60 px-3 pt-3 pb-2">
        <div className="mb-2 flex items-center justify-between gap-2">
          <label
            htmlFor="lesson-search-input"
            className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-faint"
          >
            <Search className="h-3 w-3 text-accent" aria-hidden="true" />
            Find a lesson
          </label>
          {onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              data-testid="btn-lessons-collapse"
              aria-expanded={true}
              aria-controls="lesson-chooser-rail"
              aria-label="Hide the lesson list"
              title="Hide the lesson list to its strip; every lesson stays one press away"
              className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-[var(--r-sm)] border border-line-soft px-1.5 py-0.5 font-mono text-[12.5px] uppercase tracking-wider text-muted transition-colors hover:border-line hover:text-ink"
            >
              <ChevronLeft className="h-3 w-3" aria-hidden="true" />
              <span>Hide</span>
            </button>
          )}
        </div>

        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <input
            id="lesson-search-input"
            type="search"
            value={searchQuery}
            onChange={(event) => onSearchQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') onSearchQuery('');
            }}
            placeholder="Search by ID, title or topic…"
            data-testid="input-lesson-search"
            aria-label={`Search ${lessons.length} lessons and exercises`}
            className="h-9 w-full rounded-lg border border-line bg-panel pl-8 pr-9 text-[12.5px] text-ink outline-none placeholder:text-faint focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent [&::-webkit-search-cancel-button]:hidden"
          />
          {query ? (
            <button
              type="button"
              data-testid="btn-lesson-search-clear"
              aria-label="Clear the lesson search"
              title="Clear (Esc)"
              onClick={() => onSearchQuery('')}
              className="absolute right-1.5 top-1/2 grid h-6 w-6 -translate-y-1/2 cursor-pointer place-items-center rounded-full text-faint hover:bg-raise hover:text-body"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : (
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-line-soft bg-canvas px-1 font-mono text-[11px] text-faint">
              ID
            </span>
          )}
        </div>

        <div className="mt-2 flex flex-wrap gap-1" data-testid="track-filters">
          {tracks.map((track) => {
            const active = trackFilter === track.id;
            return (
              <button
                key={track.id}
                type="button"
                aria-pressed={active}
                onClick={() => onTrackFilter(track.id)}
                title={`${track.label} — ${track.count} entr${track.count === 1 ? 'y' : 'ies'}`}
                className={`shrink-0 cursor-pointer whitespace-nowrap rounded-full border px-2 py-0.5 font-mono text-[12px] transition-colors ${
                  active
                    ? 'border-accent bg-accent font-bold text-inverse shadow-sm'
                    : 'border-line bg-panel text-body hover:border-accent/60 hover:text-accent'
                }`}
              >
                {track.label}
                <span className={`ml-1 tabular-nums ${active ? 'opacity-80' : 'text-faint'}`}>
                  {track.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex min-w-0 items-center justify-between gap-2 px-3 pt-2 pb-1">
        <span className="min-w-0 truncate font-mono text-[11px] uppercase tracking-[0.1em] text-faint">
          {query ? 'Matches' : 'Lessons & exercises'}
          <span className="ml-1 tabular-nums text-body">{filteredLessons.length}</span>
        </span>
        {verifiedCount > 0 && (
          <span className="flex shrink-0 items-center gap-1 font-mono text-[11px] text-emerald">
            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
            {verifiedCount} verified
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-2">
        {filteredLessons.length === 0 && (
          <div className="mx-1 mt-1 rounded-lg border border-dashed border-line px-3 py-4 text-center">
            <p className="text-[12px] font-semibold text-body">No lesson matches “{query}”</p>
            <p className="mt-1 text-[11px] leading-snug text-muted">
              Try an ID like <span className="font-mono text-accent">P.12</span>, or a word from the
              title.
            </p>
            <button
              type="button"
              onClick={() => onSearchQuery('')}
              className="mt-2 cursor-pointer rounded border border-line bg-panel px-2 py-1 font-mono text-[11px] text-accent hover:bg-raise"
            >
              Clear the search
            </button>
          </div>
        )}
        {filteredLessons.map((lesson) => {
          const isSelected = lesson.id === currentId;
          const isVerified = !!verifiedLessons[lesson.id];
          const isSelfMarked = !!completedLessons[lesson.id];
          return (
            <button
              key={lesson.id}
              data-testid={`lesson-item-${lesson.id}`}
              data-sound="row"
              aria-current={isSelected ? 'true' : undefined}
              onClick={() => onSelect(lesson.id)}
              className={`flex w-full cursor-pointer items-start justify-between gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                isSelected
                  ? 'border-accent bg-accent/[0.09] text-ink'
                  : 'border-transparent text-body hover:border-line hover:bg-raise/60'
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 font-mono text-[11px]">
                  <span className="rounded bg-accent/10 px-1 font-bold text-accent">{lesson.id}</span>
                  <span className="truncate text-muted">
                    {roadmapStepForLesson(lesson.id)
                      ? stepBreadcrumb(roadmapStepForLesson(lesson.id)!)
                      : lesson.track === 'track-p'
                        ? 'Python on-ramp'
                        : lesson.track === 'ramp'
                          ? 'School-maths ramp'
                          : 'Stage 0 on-ramp'}
                  </span>
                </div>
                <div className="mt-0.5 line-clamp-1 text-[12.5px] font-medium">{lesson.title}</div>
              </div>
              <div className="mt-0.5 shrink-0">
                {isVerified ? (
                  <span
                    data-testid={`lesson-verified-${lesson.id}`}
                    title="Passed the instructor's behavioural checks"
                    className="inline-flex items-center gap-1 rounded-full border border-emerald/40 bg-emerald/10 px-1.5 py-0.5 font-mono text-[11px] font-bold text-emerald"
                  >
                    <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                    <span>Verified</span>
                  </span>
                ) : isSelfMarked ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-1.5 py-0.5 font-mono text-[11px] text-accent">
                    <Check className="h-3 w-3" aria-hidden="true" />
                    <span>Marked</span>
                  </span>
                ) : (
                  <ChevronRight className="h-4 w-4 text-faint" aria-hidden="true" />
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
