/**
 * The runtime micro-learning switch (`app/src/micro/settings.ts`).
 *
 * This is deliberately not a build flag. Turning the beta off hides the tab and Home's door while
 * leaving every stored concept, event and review date untouched; turning it back on must look like
 * coming back, not like losing progress.
 */

import { MICRO_SETTINGS_KEY } from './types.ts';

export const MICRO_SETTINGS_EVENT = 'mechalab-micro-settings';

function bucket(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function readMicroEnabled(): boolean {
  try {
    const value = bucket()?.getItem(MICRO_SETTINGS_KEY);
    return value === null || value === undefined ? true : value === '1';
  } catch {
    return true;
  }
}

export function writeMicroEnabled(enabled: boolean): void {
  try {
    bucket()?.setItem(MICRO_SETTINGS_KEY, enabled ? '1' : '0');
  } catch {
    // The switch is a preference; a blocked store leaves the default on rather than throwing.
  }
  try {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(MICRO_SETTINGS_EVENT));
  } catch {
    // ignore
  }
}
