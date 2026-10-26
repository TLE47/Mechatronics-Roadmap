import React from 'react';
import { Lock, Unlock } from 'lucide-react';
import {
  levelAt,
  levelProgress,
  nextLevel,
  perksUpTo,
  lockedPerks,
  type Level,
  type Perk,
} from '../../gamification/levels.ts';

export interface LevelBarProps {
  /** Missions verified in an unbroken run: the level, and nothing else, comes from this. */
  verifiedMissions: number;
  /** The current mission's verified checks: what the bar fills with. */
  checkpoints: { verifiedCount: number; total: number };
  /** The mission the bar is measuring, for the line under it. */
  missionName?: string;
}

const percent = (fraction: number) => Math.round(Math.min(1, Math.max(0, fraction)) * 100);

function PerkRow({ perk, dim = false }: { perk: Perk; dim?: boolean }) {
  return (
    <li className={`flex items-start gap-1.5 ${dim ? 'opacity-70' : ''}`}>
      {dim ? (
        <Lock className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" style={{ color: 'var(--dim)' }} />
      ) : (
        <Unlock className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" style={{ color: 'var(--emerald)' }} />
      )}
      <span className="text-[12px]" style={{ color: dim ? 'var(--muted)' : 'var(--text)' }}>
        {perk.label}
      </span>
    </li>
  );
}

/**
 * The LV bar (`app/src/components/game/LevelBar.tsx`): a level, the checks that earn the next one,
 * and the door to the perk ladder.
 *
 * Three promises are visible in the markup:
 *  - the handle and the next step are *text*, so the bar still means something without colour;
 *  - the bar measures verified checks in the current mission, not a timer, a streak or Neon;
 *  - the Perk panel has a "Later" column in which every locked perk names the level that opens it,
 *    so nothing is a mystery. No perk in it is a learning tool: the kinds are surfaces, toys, rooms,
 *    looks and audio.
 */
export const LevelBar: React.FC<LevelBarProps> = ({ verifiedMissions, checkpoints, missionName }) => {
  const [open, setOpen] = React.useState(false);
  const progress = levelProgress(verifiedMissions, checkpoints);
  const current: Level = levelAt(progress.level);
  const next: Level | null = nextLevel(progress.level);
  const now: Perk[] = perksUpTo(progress.level);
  const later = lockedPerks(progress.level).filter((row) => next && row.level.number === next.number);
  const ahead = lockedPerks(progress.level).filter((row) => !next || row.level.number > next.number);
  const pct = percent(progress.fraction);

  return (
    <section
      data-testid="level-bar"
      aria-label="Your level"
      className="rounded-xl border p-3.5"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--panel)' }}
    >
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span
          data-testid="level-bar-level"
          className="rounded-[var(--r-sm)] px-1.5 py-0.5 text-[12px] font-bold"
          style={{ color: 'var(--accent)', backgroundColor: 'var(--accent-soft)' }}
        >
          LV {progress.level}
        </span>
        <span className="text-[13.5px] font-bold" style={{ color: 'var(--text)' }}>
          {current.handle}
        </span>
        <span className="text-[12px]" style={{ color: 'var(--muted)' }}>
          {current.tagline}
        </span>
        <span className="ml-auto text-[12px]" style={{ color: 'var(--muted)' }}>
          {next ? `→ LV ${next.number} ${next.handle}` : 'The ladder is finished'}
        </span>
      </div>

      <div
        role="progressbar"
        aria-label={missionName ? `Checks verified in ${missionName}` : 'Checks verified'}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={`${checkpoints.verifiedCount} of ${checkpoints.total} checks`}
        data-testid="level-bar-fill"
        data-value={pct}
        className="mt-2.5 h-2 w-full overflow-hidden rounded-full"
        style={{ backgroundColor: 'var(--raise)' }}
      >
        <div
          className="h-full rounded-full transition-[width]"
          style={{ width: `${pct}%`, backgroundColor: 'var(--accent)' }}
        />
      </div>

      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-[12px]" data-testid="level-bar-next">
          {next
            ? `${progress.toGo} check${progress.toGo === 1 ? '' : 's'} to go in ${missionName ?? 'this mission'}`
            : 'Every mission verified. No proof, no power — you have both.'}
        </span>
        <span className="text-[11px]" style={{ color: 'var(--dim)' }}>
          {checkpoints.verifiedCount} of {checkpoints.total} checks
        </span>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="perk-panel"
          data-testid="btn-perks"
          className="ml-auto cursor-pointer text-[12px] font-semibold underline underline-offset-4"
          style={{ color: 'var(--accent)' }}
        >
          Perks
        </button>
      </div>

      {open && (
        <div id="perk-panel" data-testid="perk-panel" className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
              Now
            </h3>
            <ul className="mt-1 space-y-1">
              {now.slice(-4).map((perk) => (
                <PerkRow key={perk.id} perk={perk} />
              ))}
              {now.length > 4 && (
                <li className="text-[11px]" style={{ color: 'var(--dim)' }}>
                  +{now.length - 4} more unlocked
                </li>
              )}
            </ul>
          </div>
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
              Next — LV {next?.number ?? '—'}
            </h3>
            <ul className="mt-1 space-y-1">
              {next ? (
                later.map((row) => <PerkRow key={row.perk.id} perk={row.perk} dim />)
              ) : (
                <li className="text-[11px]" style={{ color: 'var(--dim)' }}>
                  Nothing left above you.
                </li>
              )}
            </ul>
            {next && (
              <p className="mt-1 text-[11px]" style={{ color: 'var(--dim)' }}>
                {progress.toGo} more check{progress.toGo === 1 ? '' : 's'} in {missionName ?? 'this mission'}.
              </p>
            )}
          </div>
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
              Later
            </h3>
            <ul className="mt-1 space-y-1">
              {ahead.slice(0, 4).map((row) => (
                <li key={row.perk.id} className="flex items-start gap-1.5">
                  <Lock className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" style={{ color: 'var(--dim)' }} />
                  <span className="text-[11px]" style={{ color: 'var(--dim)' }}>
                    {row.perk.label}
                    <span className="opacity-80"> · LV {row.level.number}</span>
                  </span>
                </li>
              ))}
              {ahead.length === 0 && (
                <li className="text-[11px]" style={{ color: 'var(--dim)' }}>
                  Nothing further.
                </li>
              )}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
};
