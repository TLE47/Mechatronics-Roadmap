import { Volume2, VolumeX } from 'lucide-react';
import { soundLabel, type SoundPrefs } from '../audio/prefs.ts';

interface AudioPlayerWidgetProps {
  prefs: SoundPrefs;
  /** The focus pill, which keeps the one press from muted while the header is hidden. */
  pill?: boolean;
  open: boolean;
  panelId: string;
  onToggle: () => void;
  /** Absent on the pill: the pill's whole job is to open the panel. */
  onOpenPanel?: () => void;
  testIdSuffix?: string;
  wrapRef?: React.RefObject<HTMLDivElement | null>;
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
}

/**
 * The music strip: one toggle and the panel's door.
 *
 * The header control and the focus pill are the same widget because they are the same controls. The
 * genre and tape choice lives in the settings panel, so this strip cannot become a second picker.
 */
export function AudioPlayerWidget({
  prefs,
  pill = false,
  open,
  panelId,
  onToggle,
  onOpenPanel,
  testIdSuffix = '',
  wrapRef,
  triggerRef,
}: AudioPlayerWidgetProps) {
  const tid = (base: string) => (testIdSuffix ? `${base}-${testIdSuffix}` : base);
  return (
    <div ref={wrapRef} data-testid={tid(pill ? 'sound-control-pill' : 'sound-control')} className="relative flex items-center">
      <button
        type="button"
        onClick={onToggle}
        data-testid={tid(pill ? 'btn-sound-toggle-pill' : 'btn-sound-toggle')}
        aria-label={soundLabel(prefs.on)}
        aria-pressed={prefs.on}
        data-tip={`Sound — ${soundLabel(prefs.on).toLowerCase()}`}
        className={
          pill
            ? 'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11.5px] font-semibold shadow-lg'
            : 'btn'
        }
        style={{
          borderColor: pill ? 'var(--border-strong)' : undefined,
          backgroundColor: pill ? 'var(--panel)' : undefined,
          color: prefs.on ? 'var(--accent)' : pill ? 'var(--muted)' : undefined,
        }}
      >
        {prefs.on ? (
          <Volume2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        ) : (
          <VolumeX className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        )}
        {pill ? (
          <span>{prefs.on ? 'Sound' : 'Muted'}</span>
        ) : (
          <span className="hidden 2xl:inline">Sound</span>
        )}
      </button>
      {onOpenPanel && (
        <button
          ref={triggerRef}
          type="button"
          onClick={onOpenPanel}
          aria-expanded={open}
          aria-controls={panelId}
          aria-label="Sound settings"
          data-testid={tid('btn-sound-settings')}
          data-tip="Sound settings — volume, ambience and the click map"
          className="btn ml-1 px-1.5"
          style={{ color: 'var(--muted)' }}
        >
          <span aria-hidden="true">···</span>
        </button>
      )}
    </div>
  );
}
