import React from 'react';
import { Award as AwardIcon } from 'lucide-react';
import type { Award } from '../../gamification/rewards.ts';
import { levelAt } from '../../gamification/levels.ts';

export interface AwardToastProps {
  /** What was granted just now — never a replay of the whole ledger. */
  awards: readonly Award[];
  onClose: () => void;
}

/**
 * The moment a verify earns something (`app/src/components/game/AwardToast.tsx`).
 *
 * Deliberately quiet: a fixed card in the corner, `role="status"`, no overlay, no focus grab, no
 * blocking button — a learner mid-thought can ignore it entirely. The level-up reads as a
 * certificate rather than a slot machine: the handle, the one line, the perk now usable, and a
 * Skip for anyone who does not want to read it.
 */
export const AwardToast: React.FC<AwardToastProps> = ({ awards, onClose }) => {
  const level = awards.find((award) => award.kind === 'level');
  const rest = awards.filter((award) => award.kind !== 'level');

  if (awards.length === 0) return null;
  const levelInfo = level ? levelAt(level.mission ?? 0) : null;

  return (
    <div
      data-testid="award-toast"
      data-kind={level ? 'level' : 'award'}
      role="status"
      aria-live="polite"
      // sonner places the stack (above the focus-mode pill, which owns the very bottom-right
      // corner); this is the card itself, so it carries no position of its own.
      className="w-[19rem] max-w-[calc(100vw-2rem)] rounded-[var(--r-lg)] border p-3 shadow-[var(--shadow-lg)]"
      style={{
        borderColor: level ? 'var(--accent)' : 'var(--border)',
        backgroundColor: 'var(--panel)',
        color: 'var(--text)',
      }}
    >
      <div className="flex items-start gap-2">
        <AwardIcon
          className="mt-0.5 h-4 w-4 shrink-0"
          aria-hidden="true"
          style={{ color: level ? 'var(--accent)' : 'var(--emerald)' }}
        />
        <div className="min-w-0 flex-1">
          {level && levelInfo ? (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>
                Level {levelInfo.number}
              </p>
              <p className="font-display text-[14px] font-bold" data-testid="level-up-handle">
                {levelInfo.handle}
              </p>
              <p className="text-[12px]" style={{ color: 'var(--muted)' }}>
                {levelInfo.tagline}
              </p>
              {levelInfo.perks[0] && (
                <p className="mt-1 text-[12px]" style={{ color: 'var(--body)' }}>
                  Unlocked: {levelInfo.perks[0].label}
                </p>
              )}
            </>
          ) : (
            <p className="text-[12px] font-semibold" data-testid="award-label">
              {awards.map((award) => award.label).join(' · ')}
            </p>
          )}
          {level && rest.length > 0 && (
            <p className="mt-1 text-[11px]" style={{ color: 'var(--muted)' }}>
              Also: {rest.map((award) => award.label).join(' · ')}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          data-testid="btn-toast-close"
          className="cursor-pointer rounded-[var(--r-sm)] px-1.5 py-0.5 text-[11px] font-semibold"
          style={{ color: 'var(--muted)', border: '1px solid var(--border)' }}
        >
          {level ? 'Skip' : 'Close'}
        </button>
      </div>
    </div>
  );
};
