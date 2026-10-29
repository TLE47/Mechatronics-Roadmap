/**
 * When to offer "add this to your home screen" (`app/src/installOffer.ts`).
 *
 * MechaLab is a study app a learner returns to daily, and on a phone the browser tab is the wrong
 * shape: the address bar and the tab strip eat a fifth of a 390 px screen, and the lesson loses it.
 * Installed, `display: standalone` gives the page the whole display and the safe-area CSS keeps the
 * header under the status bar where it belongs. That is worth one row in the tab picker, once.
 *
 * The rules, and why each is the one it is:
 *
 * - **Never inside the app.** A learner who already installed it is looking at `standalone`; an offer
 *   to install what they are using is noise. This is the check that has to come first.
 * - **Chrome/Edge's own prompt when it exists.** `beforeinstallprompt` is the only way to install
 *   without leaving the page, and the browser only fires it when the app is installable (manifest,
 *   icons, service worker). So its presence is the browser's answer, not ours.
 * - **iOS gets the words instead.** Safari has no prompt event; installing is Share → *Add to Home
 *   Screen*. Since iOS 11.3 every iOS browser is WebKit and shares the same sheet, so the platform
 *   is the user agent and the hint names the two buttons a thumb can reach.
 * - **No offer on a laptop.** Nothing fires the event on desktop Chrome unless the manifest asks,
 *   and a desktop install prompt in a study app is a pop-up. The row only renders inside the phone
 *   tab sheet anyway; this module just refuses `none`.
 * - **"Not now" is a month, not forever.** A learner who dismisses the row on the bus may want it on
 *   the train; thirty days is long enough not to nag and short enough to be asked again. Accepting
 *   needs no dismissal at all — the next launch is standalone and the first rule hides the row.
 *
 * Pure apart from the two storage helpers, so `npm run test:phone` pins the platform rules and the
 * snooze without a browser.
 */

export const INSTALL_DISMISSED_KEY = 'mechalab_install_offer_v1';

/** Thirty days. Long enough not to nag; short enough that "later" is still answered. */
export const INSTALL_SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;

/** `prompt` when the browser handed us its install event, `ios` for the manual sheet, else none. */
export type InstallPlatform = 'prompt' | 'ios' | 'none';

/** A stored dismissal is a timestamp; anything else is "never dismissed". */
export function parseInstallDismissed(raw: string | null): number | null {
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}

/** The stored dismissal, or null when there is none or storage is blocked. */
export function readInstallDismissed(store: Storage | null = bucket()): number | null {
  if (!store) return null;
  try {
    return parseInstallDismissed(store.getItem(INSTALL_DISMISSED_KEY));
  } catch {
    return null;
  }
}

/** Remember "not now" and return the timestamp, so a caller updates its state with what it wrote. */
export function snoozeInstallOffer(
  now: number,
  store: Storage | null = bucket()
): number | null {
  const at = Math.round(now);
  if (!store) return at;
  try {
    store.setItem(INSTALL_DISMISSED_KEY, String(at));
  } catch {
    // Blocked storage means the row may return this visit; the app itself is unaffected.
  }
  return at;
}

/** Is the page already running as the installed app? */
export function isStandaloneDisplay(
  matches?: boolean | null,
  navigatorStandalone?: boolean
): boolean {
  // iOS Safari exposes `navigator.standalone`; everyone else uses the display-mode query.
  return Boolean(matches) || Boolean(navigatorStandalone);
}

/** iOS and iPadOS share the manual sheet, whichever browser is wearing the WebKit engine. */
export function isIosLike(userAgent: string): boolean {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return true;
  // iPadOS 13+ reports a desktop Macintosh user agent; touch points are what give it away.
  return /Macintosh/i.test(userAgent) && /Mobile\/\w+/i.test(userAgent);
}

/**
 * Which offer this browser can honestly make.
 *
 * `hasPrompt` wins over the user agent: an iOS browser will never have one, and a desktop browser
 * can have one, but the event is the browser stating the app is installable right now.
 */
export function installPlatform(input: {
  hasPrompt: boolean;
  userAgent: string;
  standalone: boolean;
}): InstallPlatform {
  if (input.standalone) return 'none';
  if (input.hasPrompt) return 'prompt';
  if (isIosLike(input.userAgent)) return 'ios';
  return 'none';
}

/**
 * Should the row be drawn now? A dismissal is a snooze, and a clock that moved backwards (a device
 * whose date was wrong) must not lock the row away forever, so a future timestamp counts as expired.
 */
export function shouldShowInstallOffer(input: {
  platform: InstallPlatform;
  dismissedAt: number | null;
  now: number;
}): boolean {
  if (input.platform === 'none') return false;
  if (input.dismissedAt === null) return true;
  const elapsed = Math.round(input.now) - input.dismissedAt;
  if (elapsed < 0) return true;
  return elapsed >= INSTALL_SNOOZE_MS;
}

function bucket(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
