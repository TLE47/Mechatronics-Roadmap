/**
 * The public half of site settings: an announcement line and a short, fixed list of flags.
 *
 * Stored in `mechalab_site_settings`, readable by everyone (there is nothing private in it) and
 * writable only by the server-side admin function. A flag that has never been written is **on**, so a
 * fresh project behaves exactly like the build before settings existed; only an explicit `false` turns
 * a surface off. The list is fixed in code on purpose: a database row cannot switch on a feature the
 * bundle does not have, and it cannot hide a lesson or lock a learner out.
 */

export const FLAG_NAMES = ['guided_tour'] as const;

export type FlagName = (typeof FLAG_NAMES)[number];

export interface PublicSettings {
  announcement: string;
  flags: Record<FlagName, boolean>;
}

export const MAX_ANNOUNCEMENT_CHARS = 280;

export function defaultPublicSettings(): PublicSettings {
  return {
    announcement: '',
    flags: { guided_tour: true },
  };
}

export function isFlagName(value: string): value is FlagName {
  return (FLAG_NAMES as readonly string[]).includes(value);
}

/** Rows from `mechalab_site_settings` → the settings the app reads. Unknown keys are ignored. */
export function parsePublicSettings(rows: readonly { key: string; value: unknown }[]): PublicSettings {
  const settings = defaultPublicSettings();
  for (const row of rows) {
    if (row.key === 'announcement' && typeof row.value === 'string') {
      settings.announcement = row.value.trim().slice(0, MAX_ANNOUNCEMENT_CHARS);
    }
    if (row.key === 'feature_flags' && row.value && typeof row.value === 'object' && !Array.isArray(row.value)) {
      for (const [name, value] of Object.entries(row.value as Record<string, unknown>)) {
        if (isFlagName(name) && typeof value === 'boolean') settings.flags[name] = value;
      }
    }
  }
  return settings;
}

/** A flag is on unless the server said, explicitly and with a boolean, that it is off. */
export function flagOn(settings: PublicSettings, name: FlagName): boolean {
  return settings.flags[name] !== false;
}
