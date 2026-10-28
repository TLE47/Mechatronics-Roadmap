/**
 * What the admin area offers, and the action names it is allowed to send.
 *
 * This is the UI's half of a contract whose other half is `supabase/functions/admin-action`: every
 * action listed here is one the function re-checks server-side against the caller's role. Rendering
 * this list is not authorization — a learner who un-hides the panel still gets a 403 — but keeping the
 * two lists in one place means a new button cannot quietly call an action the server never learned.
 */

export const ADMIN_ACTIONS = [
  'site_settings.list',
  'site_setting.set',
  'site_setting.clear',
  'audit.list',
  'role.assign',
] as const;

export type AdminAction = (typeof ADMIN_ACTIONS)[number];

export interface AdminCapability {
  id: 'overview' | 'settings' | 'curriculum' | 'feedback' | 'users' | 'audit';
  title: string;
  detail: string;
  actions: readonly AdminAction[];
}

/**
 * The capabilities the admin area ships with. Deliberately small: no learner drafts, notes or code
 * appear anywhere in it, and curriculum work leaves through a pull request rather than a database
 * edit, so the generator and CI stay the single publishing gate.
 */
export const ADMIN_CAPABILITIES: readonly AdminCapability[] = [
  {
    id: 'overview',
    title: 'Overview',
    detail: 'Release version, service status and whether sign-in and sync answer. Aggregate only.',
    actions: [],
  },
  {
    id: 'settings',
    title: 'Site settings',
    detail: 'Announcement banner and a short list of feature flags. Stored in the database, not the bundle.',
    actions: ['site_settings.list', 'site_setting.set', 'site_setting.clear'],
  },
  {
    id: 'curriculum',
    title: 'Curriculum changes',
    detail: 'Prepare a lesson edit and open a pull request; CI and the generators still decide what ships.',
    actions: [],
  },
  {
    id: 'users',
    title: 'Roles',
    detail: 'Grant or revoke the admin role. Learners’ code, drafts, notes and checklist ticks are not visible here.',
    actions: ['role.assign'],
  },
  {
    id: 'audit',
    title: 'Audit log',
    detail: 'Who changed a setting or a role, and when. Written by the server, never by the browser.',
    actions: ['audit.list'],
  },
];

/** The capabilities a role may see. An unknown or missing role gets none. */
export function adminCapabilities(role: unknown): readonly AdminCapability[] {
  return role === 'admin' ? ADMIN_CAPABILITIES : [];
}

export type AdminDenial = 'not-configured' | 'signed-out' | 'not-admin';

/**
 * Why the admin area is closed, in the order the checks actually run. `null` means "open".
 * The server repeats the role check; this only chooses the sentence to show.
 */
export function adminDenial(options: {
  configured: boolean;
  signedIn: boolean;
  role: unknown;
}): AdminDenial | null {
  if (!options.configured) return 'not-configured';
  if (!options.signedIn) return 'signed-out';
  if (options.role !== 'admin') return 'not-admin';
  return null;
}

/** Every denial says the same thing about the boundary, so a probing learner learns nothing extra. */
export const ADMIN_DENIAL_TEXT: Record<AdminDenial, string> = {
  'not-configured': 'This build has no account service, so there is no admin area.',
  'signed-out': 'Sign in with an admin account to open this page.',
  'not-admin': 'This account does not have the admin role.',
};

export function isAdminAction(value: unknown): value is AdminAction {
  return typeof value === 'string' && (ADMIN_ACTIONS as readonly string[]).includes(value);
}
