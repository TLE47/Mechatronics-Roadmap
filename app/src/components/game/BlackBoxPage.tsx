import React from 'react';
import { Lock, Radio } from 'lucide-react';
import { missionAt } from '../../content/loader.ts';
import { allRecordings } from '../../content/recordings.ts';

export interface BlackBoxPageProps {
  /** Missions verified in an unbroken run. A recording unlocks after its own mission. */
  verifiedMissions: number;
}

const VOICE_LABEL: Record<string, string> = {
  machinist: 'The Machinist',
  collective: 'The Last Hands',
  glados: 'EA Corp system notice',
  you: 'You',
};

/**
 * The Black Box (`app/src/components/game/BlackBoxPage.tsx`).
 *
 * Every recording in one place, replayable for as long as the learner wants — a story beat never
 * appears before the coding it belongs to, and never blocks the next lesson. A locked entry says
 * exactly what unlocks it, which is the only kind of "locked" this app allows: nothing in here is a
 * tool, and the editor, hints and scopes are never behind one.
 */
export const BlackBoxPage: React.FC<BlackBoxPageProps> = ({ verifiedMissions }) => {
  const recordings = allRecordings();
  const unlocked = recordings.filter((recording) => recording.number <= verifiedMissions).length;

  return (
    <section data-testid="blackbox-page" aria-labelledby="blackbox-heading" className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2
          id="blackbox-heading"
          className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide"
          style={{ color: 'var(--muted)' }}
        >
          <Radio className="h-3.5 w-3.5" aria-hidden="true" />
          Black Box
        </h2>
        <span className="text-[11px]" style={{ color: 'var(--dim)' }}>
          {unlocked} of {recordings.length} recordings
        </span>
      </div>
      <p className="text-[11px]" style={{ color: 'var(--muted)' }}>
        Voice memos from before the demo. Each one unlocks when its mission is verified, and stays
        here afterwards.
      </p>

      <ul className="space-y-1.5">
        {recordings.map((recording) => {
          const isOpen = recording.number <= verifiedMissions;
          const mission = missionAt(recording.number);
          return (
            <li key={recording.id} data-testid={`blackbox-row-${recording.number}`} data-locked={!isOpen}>
              {isOpen ? (
                <details
                  className="rounded-lg border px-3 py-2"
                  style={{ borderColor: 'var(--border)', backgroundColor: 'var(--panel)' }}
                >
                  <summary className="cursor-pointer text-[12.5px] font-semibold" style={{ color: 'var(--text)' }}>
                    {String(recording.number).padStart(2, '0')} · {recording.title}
                    <span className="ml-2 text-[11px] font-normal" style={{ color: 'var(--dim)' }}>
                      {VOICE_LABEL[recording.voice] ?? recording.credit} · {recording.words} words
                    </span>
                  </summary>
                  <p
                    className="mt-2 whitespace-pre-line text-[13px] leading-relaxed"
                    style={{ color: 'var(--body)' }}
                    data-testid={`blackbox-body-${recording.number}`}
                  >
                    {recording.body}
                  </p>
                  <p className="mt-2 text-[11px]" style={{ color: 'var(--dim)' }}>
                    {recording.credit} · clue: {recording.clue}
                  </p>
                </details>
              ) : (
                <div
                  className="flex items-center gap-2 rounded-lg border px-3 py-2"
                  style={{ borderColor: 'var(--border)', backgroundColor: 'var(--canvas)' }}
                >
                  <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" style={{ color: 'var(--dim)' }} />
                  <span className="text-[12px]" style={{ color: 'var(--muted)' }}>
                    Recording {String(recording.number).padStart(2, '0')}
                    <span className="ml-1.5" style={{ color: 'var(--dim)' }}>
                      unlocks after {mission?.name ?? `mission ${recording.number}`} is verified
                    </span>
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
};
