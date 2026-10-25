/**
 * Read the public site settings once per page load.
 *
 * A guest never needs an account for this: the table grants `select` to `anon`, because an
 * announcement banner and a feature flag are public by definition. A build with no Supabase project,
 * an offline browser or a project that has not run the migration gets the defaults, which are the
 * behaviour the app already had.
 */

import { getClient } from './accounts';
import {
  defaultPublicSettings,
  parsePublicSettings,
  type PublicSettings,
} from './siteSettingsModel';

let cached: Promise<PublicSettings> | null = null;

export function loadPublicSettings(): Promise<PublicSettings> {
  if (!cached) {
    cached = (async () => {
      const supabase = await getClient();
      if (!supabase) return defaultPublicSettings();
      try {
        const { data, error } = await supabase
          .from('mechalab_site_settings')
          .select('key, value');
        if (error || !Array.isArray(data)) return defaultPublicSettings();
        return parsePublicSettings(data as { key: string; value: unknown }[]);
      } catch {
        return defaultPublicSettings();
      }
    })();
  }
  return cached;
}
