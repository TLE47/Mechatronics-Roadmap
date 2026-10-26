import React from 'react';
import { Check, CheckCircle2, ChevronRight, Search } from 'lucide-react';
import type { PythonLessonItem } from '../data/pythonLessonsData';
import { roadmapStepForLesson } from '../practiceLinks';
import { stepBreadcrumb } from '../spine';

/**
 * The lesson chooser (`app/src/components/LessonChooser.tsx`).
 *
 * It used to be a 4/12 column beside the work area, which cost a third of the width to a control
 * used once per lesson. It is a narrower rail now, so the lesson text and the editor can share what
 * it used to take; the search, the four filters and the list are unchanged.
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
}: LessonChooserProps) {
  const tracks: { id: TrackFilter; label: string }[] = [
    { id: 'all', label: `All (${lessons.length})` },
    {
      id: 'modules',
      label: `Graded modules (${lessons.filter((lesson) => lesson.track === 'modules').length})`,
    },
    {
      id: 'lessons',
      label: `Track lessons (${
        lessons.filter(
          (lesson) =>
            lesson.track !== 'modules' && lesson.track !== 'track-p' && lesson.track !== 'ramp'
        ).length
      })`,
    },
    {
      id: 'onramp',
      label: `Python on-ramp (${
        lessons.filter((lesson) => lesson.track === 'track-p' || lesson.track === 'ramp').length
      })`,
    },
  ];

  return (
    <div
      data-testid="lesson-list-card"
      data-chrome="lesson-list"
      className="flex max-h-[760px] flex-col rounded-xl border border-line bg-panel px-3 py-3"
    >
      <div className="relative mb-2">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
        <input
          type="text"
          value={searchQuery}
          onChange={(event) => onSearchQuery(event.target.value)}
          placeholder={`Search ${lessons.length} lessons and exercises by ID, title, or topic...`}
          data-testid="input-lesson-search"
          className="w-full rounded-lg border border-line bg-canvas py-1.5 pl-8 pr-3 text-xs text-ink placeholder-faint focus:border-accent focus:outline-none"
        />
      </div>

      {/* The count gets its own line and the chips wrap: five chips and a number do not share one
          narrow column, and a chip that runs under the next panel is a chip nobody can press. */}
      <div className="mb-2">
        <span className="mb-1.5 block font-mono text-xs tabular-nums text-muted">
          Lessons &amp; exercises ({filteredLessons.length})
        </span>
        <div className="flex flex-wrap gap-1" data-testid="track-filters">
          {tracks.map((track) => (
            <button
              key={track.id}
              onClick={() => onTrackFilter(track.id)}
              className={`shrink-0 whitespace-nowrap rounded px-2 py-1 font-mono text-[12.5px] transition-colors cursor-pointer ${
                trackFilter === track.id
                  ? 'bg-accent font-bold text-inverse'
                  : 'border border-line-soft bg-canvas text-muted hover:text-ink'
              }`}
            >
              {track.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 space-y-1.5 overflow-y-auto pr-1">
        {filteredLessons.map((lesson) => {
          const isSelected = lesson.id === currentId;
          const isVerified = !!verifiedLessons[lesson.id];
          const isSelfMarked = !!completedLessons[lesson.id];
          return (
            <button
              key={lesson.id}
              data-testid={`lesson-item-${lesson.id}`}
              data-sound="row"
              onClick={() => onSelect(lesson.id)}
              className={`flex w-full items-start justify-between gap-2 rounded-lg border p-2.5 text-left transition-all cursor-pointer ${
                isSelected
                  ? 'border-accent bg-raise text-ink'
                  : 'border-line-soft bg-canvas/70 text-body hover:border-line-strong'
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 font-mono text-[11px]">
                  <span className="font-bold text-accent">{lesson.id}</span>
                  <span aria-hidden="true" className="text-faint">
                    ·
                  </span>
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
                <div className="mt-0.5 line-clamp-1 text-xs font-medium">{lesson.title}</div>
              </div>
              <div className="mt-0.5 shrink-0">
                {isVerified ? (
                  <span className="inline-flex items-center gap-1 font-mono text-[11px] text-emerald">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Verified</span>
                  </span>
                ) : isSelfMarked ? (
                  <span className="inline-flex items-center gap-1 font-mono text-[11px] text-accent">
                    <Check className="h-3.5 w-3.5" />
                    <span>Marked</span>
                  </span>
                ) : (
                  <ChevronRight className="h-4 w-4 text-faint" />
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
