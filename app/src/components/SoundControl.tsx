import React from 'react';
import { cachedSoundPrefs, subscribeSoundPrefs, type SoundPrefs } from '../audio/prefs.ts';
import { install, subscribeArmed, togglePlay } from '../audio/musicManager.ts';
import { openGeneralSettings } from '../generalSettings';
import { AudioPlayerWidget } from './AudioPlayerWidget.tsx';

/**
 * The header's sound control (`app/src/components/SoundControl.tsx`).
 *
 * One button and one door. The button is the whole promise — sound on or off in one press, from
 * anywhere, including the focus pill. The door opens **General settings**, where the whole sound
 * surface lives: the master, the music and its genre doors, the room, the cues, the shuffle
 * switches and the credit. The panel used to be a popover of its own, which meant two mounts of the
 * same store and two places to look for one preference. There is now one settings surface, and the
 * header keeps only the press that has to be there.
 */
export const SoundControl: React.FC<{ variant?: 'header' | 'pill'; testIdSuffix?: string }> = ({
  variant = 'header',
  testIdSuffix,
}) => {
  const [prefs, setPrefs] = React.useState<SoundPrefs>(() => cachedSoundPrefs());
  const [, setArmed] = React.useState(false);
  React.useEffect(() => {
    install();
    const release = subscribeArmed(setArmed);
    const stop = subscribeSoundPrefs(setPrefs);
    return () => {
      release();
      stop();
    };
  }, []);
  const pill = variant === 'pill';
  return (
    <AudioPlayerWidget
      prefs={prefs}
      pill={pill}
      open={false}
      panelId="sound-settings-general"
      testIdSuffix={testIdSuffix}
      onToggle={() => togglePlay()}
      // The pill's whole job in focus mode is the one press; its detail door is the settings dialog,
      // which is reachable from the header once focus is left.
      onOpenPanel={pill ? undefined : () => openGeneralSettings()}
    />
  );
};
