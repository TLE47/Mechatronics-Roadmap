import React from 'react';
import { ArrowRight, CheckCircle2, Circle, MapPin } from 'lucide-react';
import { missionCheckLabel, type MissionProgress } from '../../gamification/missions.ts';
import { levelAt } from '../../gamification/levels.ts';

export interface JourneyMapProps {
  progress: readonly MissionProgress[];
  /** Missions verified in an unbroken run: which mission is "here". */
  verifiedMissions: number;
  /** The learner's flags, so every row opens the next check that is actually open. */
  verified: Record<string, boolean>;
  onOpenLesson: (lessonId: string) => void;
}

type State = 'verified' | 'current' | 'ahead';

function stateOf(mission: MissionProgress, verifiedMissions: number): State {
  if (mission.verified) return 'verified';
  if (mission.mission.number === verifiedMissions + 1) return 'current';
  return 'ahead';
}

/**
 * The ten missions (`app/src/components/game/JourneyMap.tsx`).
 *
 * One ordered list, drawn as a route with a marker where the learner is. It is an `<ol>` with real
 * text and real buttons rather than a canvas: the visual is a second reading of the same rows, not
 * the only door. "Ahead" is a description of where the work is, never a lock — the button on every
 * row opens that mission's next unverified check, because no game state may sit in front of the
 * editor, the hints or a lesson.
 */
export const JourneyMap: React.FC<JourneyMapProps> = ({
  progress,
  verifiedMissions,
  verified,
  onOpenLesson,
}) => {
  return (
    <section data-testid="journey-map" aria-labelledby="journey-heading" className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2
          id="journey-heading"
          className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide"
          style={{ color: 'var(--muted)' }}
        >
          <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
          The ten missions
        </h2>
        <span className="text-[11px]" style={{ color: 'var(--dim)' }}>
          {verifiedMissions} of {progress.length} verified
        </span>
      </div>

      <ol className="space-y-1.5">
        {progress.map((mission) => {
          const state = stateOf(mission, verifiedMissions);
          const level = levelAt(mission.mission.number);
          const entry =
            mission.entries.find((candidate) => !verified[candidate.id]) ?? mission.entries[0] ?? null;
          return (
            <li
              key={mission.mission.number}
              data-testid={`mission-row-${mission.mission.number}`}
              data-state={state}
              className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border px-3 py-2"
              style={{
                borderColor: state === 'current' ? 'var(--accent)' : 'var(--border)',
                backgroundColor: state === 'current' ? 'var(--accent-soft)' : 'var(--panel)',
                opacity: state === 'ahead' ? 0.82 : 1,
              }}
            >
              {state === 'verified' ? (
                <CheckCircle2
                  className="h-4 w-4 shrink-0"
                  aria-hidden="true"
                  style={{ color: 'var(--emerald)' }}
                />
              ) : (
                <Circle
                  className="h-4 w-4 shrink-0"
                  aria-hidden="true"
                  style={{ color: state === 'current' ? 'var(--accent)' : 'var(--dim)' }}
                />
              )}
              <span className="w-7 shrink-0 text-[11px] font-semibold tabular-nums" style={{ color: 'var(--dim)' }}>
                {String(mission.mission.number).padStart(2, '0')}
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold" style={{ color: 'var(--text)' }}>
                  {mission.mission.name}
                </span>
                <span className="block text-[11px]" style={{ color: 'var(--muted)' }}>
                  {mission.mission.capability} · {level.handle} · {missionCheckLabel(mission)}
                </span>
              </span>
              <span className="ml-auto flex items-center gap-2">
                <span className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--dim)' }}>
                  {state === 'verified' ? 'Verified' : state === 'current' ? 'In progress' : 'Ahead'}
                </span>
                <button
                  type="button"
                  data-testid={`btn-mission-${mission.mission.number}`}
                  onClick={() => entry && onOpenLesson(entry.id)}
                  disabled={!entry}
                  className="flex cursor-pointer items-center gap-1 rounded-[var(--r-sm)] px-2 py-1 text-[12px] font-semibold"
                  style={{
                    color: state === 'current' ? 'var(--inverse)' : 'var(--accent)',
                    backgroundColor: state === 'current' ? 'var(--accent)' : 'transparent',
                    border: state === 'current' ? 'none' : '1px solid var(--border)',
                  }}
                >
                  {state === 'verified' ? 'Revisit' : state === 'current' ? 'Continue' : 'Open'}
                  <ArrowRight className="h-3 w-3" aria-hidden="true" />
                </button>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
};
