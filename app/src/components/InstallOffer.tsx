import React, { useEffect, useMemo, useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import {
  installPlatform,
  isStandaloneDisplay,
  readInstallDismissed,
  shouldShowInstallOffer,
  snoozeInstallOffer,
} from '../installOffer';

/**
 * "Add MechaLab to your home screen", as one row in the phone's tab sheet
 * (`components/InstallOffer.tsx`).
 *
 * The rules are in `installOffer.ts`; this file is the part that cannot be pure: it subscribes to
 * Chrome's `beforeinstallprompt` (which can fire before this component mounts, so the listener is
 * registered once per mount and the last event kept), calls the browser's own prompt, and writes a
 * dismissal. A learner who accepts needs nothing written: the next launch is `standalone`, and the
 * rules hide the row by themselves.
 *
 * It lives in the tab sheet rather than a banner for one reason: a banner on a 390 px phone is the
 * first thing between a learner and the lesson, and this is an offer, not the lesson.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice?: Promise<{ outcome: 'accepted' | 'dismissed'; platform?: string }>;
}

const isCoarsePointer = (): boolean => {
  try {
    return typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
};

const standaloneNow = (): boolean => {
  try {
    if (typeof window === 'undefined') return false;
    const matches =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(display-mode: standalone)').matches
        : false;
    const navigatorStandalone =
      typeof navigator !== 'undefined' && (navigator as Navigator & { standalone?: boolean }).standalone;
    return isStandaloneDisplay(matches, navigatorStandalone);
  } catch {
    return false;
  }
};

export const InstallOffer: React.FC = () => {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissedAt, setDismissedAt] = useState<number | null>(() => readInstallDismissed());
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPrompt = (event: Event) => {
      // The default is a mini-infobar; we ask from the row instead, where the learner chose to look.
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setAccepted(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const platform = useMemo(
    () =>
      installPlatform({
        hasPrompt: Boolean(promptEvent),
        userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
        standalone: standaloneNow(),
      }),
    [promptEvent]
  );

  const offer = useMemo(
    () =>
      !accepted &&
      // A laptop can reach this sheet by narrowing the window; the offer is for a thumb.
      isCoarsePointer() &&
      shouldShowInstallOffer({ platform, dismissedAt, now: Date.now() }),
    [accepted, dismissedAt, platform]
  );

  if (!offer) return null;

  const dismiss = () => setDismissedAt(snoozeInstallOffer(Date.now()));

  const install = async () => {
    if (!promptEvent) return;
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice?.outcome === 'accepted') {
        setAccepted(true);
        return;
      }
    } catch {
      // A browser that refuses its own prompt is not an error the learner can act on; leave the row
      // so they can try again, or install from the browser menu.
    }
    dismiss();
  };

  return (
    <div
      data-testid="install-offer"
      className="flex items-start gap-2.5 rounded-lg border border-line bg-canvas px-3 py-2.5"
    >
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line bg-panel text-accent">
        {platform === 'ios' ? (
          <Share className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Download className="h-4 w-4" aria-hidden="true" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] font-semibold text-ink">Keep MechaLab on your home screen</p>
        {platform === 'ios' ? (
          <p data-testid="install-ios-hint" className="mt-0.5 text-[11.5px] leading-snug text-muted">
            Tap <span className="font-semibold text-body">Share</span>, then{' '}
            <span className="font-semibold text-body">Add to Home Screen</span>. It opens without the
            address bar, so the lesson gets the whole screen.
          </p>
        ) : (
          <p className="mt-0.5 text-[11.5px] leading-snug text-muted">
            One tap, then it opens full screen with nothing to install from a store.
          </p>
        )}
        {platform === 'prompt' && (
          <button
            type="button"
            onClick={install}
            data-testid="btn-install-app"
            className="btn mt-2 min-h-[40px] gap-1.5 px-3 text-[12.5px] font-semibold"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Install
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        data-testid="btn-install-dismiss"
        aria-label="Not now, do not offer to install"
        className="btn h-9 w-9 shrink-0 px-0 text-muted"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
};
