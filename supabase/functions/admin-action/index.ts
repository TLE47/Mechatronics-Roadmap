/**
 * Every admin write in MechaLab goes through here.
 *
 * The dashboard's hidden-ness is not the boundary: this function re-reads the caller's role on every
 * request, requires a two-factor session, validates the value it is asked to store, and writes an audit
 * row before answering. A learner who calls it by hand with their own JWT gets the same 403 the page
 * would have shown.
 *
 * Actions:
 *   site_settings.list           public settings + who last changed them
 *   site_setting.set {key,value} announcement (≤280 chars) or feature_flags (booleans, fixed names)
 *   site_setting.clear {key}     remove a setting so the built-in default applies again
 *   role.assign {userId,role}    grant or revoke admin; refuses to remove the last admin
 *   audit.list {limit}           the last N actions
 *
 * Deployment:
 *   supabase functions deploy admin-action
 * Optional secrets: APP_ORIGIN (comma-separated allow-list), ADMIN_REQUIRE_MFA=0 for a fresh project.
 */

import { json, preflight, requireAdmin, audit } from '../_shared/http.ts';

const SETTING_KEYS = ['announcement', 'feature_flags'] as const;
const FLAG_NAMES = ['guided_tour'] as const;
const MAX_ANNOUNCEMENT = 280;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface RequestBody {
  action?: string;
  key?: string;
  value?: unknown;
  userId?: string;
  role?: string;
  limit?: number;
}

function validateSetting(key: string, value: unknown): string | null {
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return preflight(req);
  if (req.method !== 'POST') return json(req, 405, { error: 'Use POST.' });

  const context = await requireAdmin(req);
  if (context instanceof Response) return context;
  const { user, service } = context;

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return json(req, 400, { error: 'The request body was not JSON.' });
  }

  switch (body.action) {
    case 'site_settings.list': {
      const { data, error } = await service
        .from('mechalab_site_settings')
        .select('key, value, updated_at, updated_by')
        .order('key');
      if (error) return json(req, 500, { error: error.message });
      return json(req, 200, {
        settings: (data ?? []).map((row) => ({
          key: row.key,
          value: row.value,
          updatedAt: row.updated_at,
          updatedBy: row.updated_by,
        })),
      });
    }

    case 'site_setting.set': {
      const key = String(body.key ?? '');
      if (!(SETTING_KEYS as readonly string[]).includes(key)) return json(req, 400, { error: 'Unknown setting.' });
      const problem = validateSetting(key, body.value);
      if (problem) return json(req, 400, { error: problem });
      const value = key === 'announcement' ? String(body.value).trim() : body.value;
      const { data, error } = await service
        .from('mechalab_site_settings')
        .upsert(
          { key, value, updated_at: new Date().toISOString(), updated_by: user.id },
          { onConflict: 'key' }
        )
        .select('key, value, updated_at, updated_by')
        .single();
      if (error) return json(req, 500, { error: error.message });
      await audit(service, user.id, 'site_setting.set', { key, value });
      return json(req, 200, {
        setting: {
          key: data.key,
          value: data.value,
          updatedAt: data.updated_at,
          updatedBy: data.updated_by,
        },
      });
    }

    case 'site_setting.clear': {
      const key = String(body.key ?? '');
      if (!(SETTING_KEYS as readonly string[]).includes(key)) return json(req, 400, { error: 'Unknown setting.' });
      const { error } = await service.from('mechalab_site_settings').delete().eq('key', key);
      if (error) return json(req, 500, { error: error.message });
      await audit(service, user.id, 'site_setting.clear', { key });
      return json(req, 200, { cleared: key });
    }

    case 'role.assign': {
      const userId = String(body.userId ?? '').trim();
      const role = body.role === 'admin' ? 'admin' : body.role === 'learner' ? 'learner' : null;
      if (!UUID.test(userId)) return json(req, 400, { error: 'That is not a user id.' });
      if (!role) return json(req, 400, { error: 'Role must be admin or learner.' });

      const { data: existing, error: readError } = await service
        .from('mechalab_roles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle();
      if (readError) return json(req, 500, { error: readError.message });

      if (existing?.role === 'admin' && role === 'learner') {
        const { count, error: countError } = await service
          .from('mechalab_roles')
          .select('user_id', { count: 'exact', head: true })
          .eq('role', 'admin');
        if (countError) return json(req, 500, { error: countError.message });
        // Removing the last admin would leave the site with no one who can open this function.
        if ((count ?? 0) <= 1) return json(req, 409, { error: 'That is the last admin. Grant the role to someone else first.' });
      }

      const { error } = await service
        .from('mechalab_roles')
        .upsert({ user_id: userId, role, granted_at: new Date().toISOString(), granted_by: user.id }, { onConflict: 'user_id' });
      if (error) return json(req, 500, { error: error.message });
      await audit(service, user.id, 'role.assign', { userId, role });
      return json(req, 200, { role });
    }

    case 'audit.list': {
      const limit = Math.min(Math.max(Number(body.limit ?? 50) || 50, 1), 200);
      const { data, error } = await service
        .from('mechalab_audit')
        .select('at, actor, action, detail')
        .order('at', { ascending: false })
        .limit(limit);
      if (error) return json(req, 500, { error: error.message });
      return json(req, 200, { entries: data ?? [] });
    }

    default:
      return json(req, 400, { error: 'Unknown action.' });
  }
});
