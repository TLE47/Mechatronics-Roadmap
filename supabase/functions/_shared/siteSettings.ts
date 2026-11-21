/**
 * The server-side contract for the two public settings (`_shared/siteSettings.ts`).
 *
 * The browser model and this validator are deliberately separate values with one fixed list, but
 * they must agree: a flag the admin can write has to be a flag the public reader can understand.
 * Keeping the validator pure lets `npm run test:accounts` exercise the exact function the edge
 * function calls, without a Deno runtime or a Supabase project.
 */

export const SETTING_KEYS = ['announcement', 'feature_flags'] as const;
export const FLAG_NAMES = ['guided_tour', 'resource_workspace'] as const;
export const MAX_ANNOUNCEMENT = 280;

export type SettingKey = (typeof SETTING_KEYS)[number];
export type AdminFlagName = (typeof FLAG_NAMES)[number];

export function validateSetting(key: string, value: unknown): string | null {
  if (key === 'announcement') {
    if (typeof value !== 'string') return 'The announcement must be a string.';
    if (value.trim().length > MAX_ANNOUNCEMENT) return `Keep the announcement under ${MAX_ANNOUNCEMENT} characters.`;
    return null;
  }
  if (key === 'feature_flags') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return 'Feature flags must be an object.';
    for (const [name, flag] of Object.entries(value as Record<string, unknown>)) {
      if (!(FLAG_NAMES as readonly string[]).includes(name)) return `Unknown flag: ${name}.`;
      if (typeof flag !== 'boolean') return `Flag ${name} must be true or false.`;
    }
    return null;
  }
  return `Unknown setting: ${key}.`;
}
