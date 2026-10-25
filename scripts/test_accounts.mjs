#!/usr/bin/env node
/**
 * The account layer, without a browser or a Supabase project.
 *
 * Every module this imports is deliberately free of `window`, storage and the SDK, so the rules that
 * decide what can be sent, where a sign-in can return to, what a merge keeps, and who may open the
 * admin area are all checkable here. The browser-side wrappers (`accounts.ts`, `workspaceSync.ts`,
 * `accountActions.ts`) are thin and are exercised by the build, the e2e suites and a real project.
 */

import assert from 'node:assert/strict';
import {
  emailProblem,
  passwordProblem,
  identityLabels,
  isAdminRole,
  syncScopeLine,
  authCallbackProblem,
  isVerifiedUser,
  staleTotpFactors,
  MIN_PASSWORD_LENGTH,
} from '../app/src/accountRules.ts';
import { buildReturnUrl, normalizeBase, parseReturnTarget, safeReturnTo } from '../app/src/returnTo.ts';
import {
  emptyWorkspace,
  isWorkspaceDoc,
  mergeWorkspace,
  workspaceCounts,
  WORKSPACE_SCHEMA,
} from '../app/src/workspaceMerge.ts';
import { buildDashboard } from '../app/src/dashboardData.ts';
import {
  ADMIN_ACTIONS,
  ADMIN_DENIAL_TEXT,
  adminCapabilities,
  adminDenial,
  isAdminAction,
} from '../app/src/adminModel.ts';
import {
  MAX_ANNOUNCEMENT_CHARS,
  defaultPublicSettings,
  flagOn,
  parsePublicSettings,
} from '../app/src/siteSettingsModel.ts';

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

// ── Account rules ─────────────────────────────────────────────────────────────────────────────────
test('email addresses are checked loosely, not strictly', () => {
  assert.equal(emailProblem(''), 'Enter your email address.');
  assert.match(emailProblem('not-an-address'), /does not look like/);
  assert.equal(emailProblem(' learner@example.com '), null);
  assert.equal(emailProblem('a+tag@sub.example.co.uk'), null);
});

test('passwords are judged on length and obvious traps', () => {
  assert.match(passwordProblem(''), /Choose a password/);
  assert.match(passwordProblem('short'), /at least/);
  assert.equal(passwordProblem('x'.repeat(MIN_PASSWORD_LENGTH - 1)).startsWith('Use at least'), true);
  assert.equal(passwordProblem('a long phrase 42'), null);
  assert.match(passwordProblem('learner@example.com', 'learner@example.com'), /email address/);
  assert.match(passwordProblem('aaaaaaaaaaaa'), /repeated/);
});

test('connected methods are labelled and de-duplicated', () => {
  assert.deepEqual(identityLabels(['email', 'google', 'email']), ['Email', 'Google']);
  assert.deepEqual(identityLabels(['github']), ['GitHub']);
  assert.deepEqual(identityLabels([]), []);
});

test('only the exact admin role counts in the UI', () => {
  assert.equal(isAdminRole('admin'), true);
  for (const value of ['Admin', 'administrator', 'learner', null, undefined, 1]) {
    assert.equal(isAdminRole(value), false);
  }
});

test('the sync line names what actually leaves the browser', () => {
  assert.match(syncScopeLine({ signedIn: false, workspace: false }), /browser only/);
  assert.match(syncScopeLine({ signedIn: true, workspace: false }), /Drafts and notes stay/);
  assert.match(syncScopeLine({ signedIn: true, workspace: true }), /drafts and notes/i);
});

test('sign-in callback errors become sentences', () => {
  assert.equal(authCallbackProblem(null, null), null);
  assert.match(authCallbackProblem('access_denied', null), /cancelled/);
  assert.match(authCallbackProblem('server_error', 'That link has expired'), /expired/);
  assert.match(authCallbackProblem('invalid_request', null), /already been used/);
  assert.equal(authCallbackProblem('mystery', 'Custom detail'), 'Custom detail');
  assert.match(authCallbackProblem('mystery', null), /could not be completed/);
});

test('a confirmed email is the only verified state', () => {
  assert.equal(isVerifiedUser(null), false);
  assert.equal(isVerifiedUser({}), false);
  assert.equal(isVerifiedUser({ email_confirmed_at: '2026-01-01T00:00:00Z' }), true);
});

// ── Return destinations ──────────────────────────────────────────────────────────────────────────
const pagesBase = '/Mechatronics-Roadmap/';

test('the base always ends in a slash', () => {
  assert.equal(normalizeBase('/Mechatronics-Roadmap'), '/Mechatronics-Roadmap/');
  assert.equal(normalizeBase(''), '/');
  assert.equal(normalizeBase('/'), '/');
});

test('internal destinations survive; everything else becomes the root', () => {
  assert.equal(safeReturnTo('', pagesBase), pagesBase);
  assert.equal(safeReturnTo('?lesson=P.1', pagesBase), `${pagesBase}?lesson=P.1`);
  assert.equal(safeReturnTo(`${pagesBase}?lesson=P.1`, pagesBase), `${pagesBase}?lesson=P.1`);
  assert.equal(safeReturnTo(`${pagesBase}?view=dashboard`, pagesBase), `${pagesBase}?view=dashboard`);
  for (const hostile of [
    'https://evil.example/',
    'HTTPS://evil.example',
    '//evil.example/',
    '/\\evil.example',
    '\\\\evil.example',
    'javascript:alert(1)',
    '  //evil.example',
    `${pagesBase}../../etc/passwd`,
    `${pagesBase}%2e%2e/secret`,
    '/other-project/',
  ]) {
    assert.equal(safeReturnTo(hostile, pagesBase), pagesBase, `hostile target kept: ${hostile}`);
  }
});

test('a return URL is built on the site origin and encoded', () => {
  const url = buildReturnUrl('https://tle47.github.io', pagesBase, '?lesson=P.1');
  assert.equal(
    url,
    `https://tle47.github.io${pagesBase}?return=${encodeURIComponent(`${pagesBase}?lesson=P.1`)}`
  );
  const hostile = buildReturnUrl('https://tle47.github.io', pagesBase, 'https://evil.example/');
  assert.equal(hostile, `https://tle47.github.io${pagesBase}?return=${encodeURIComponent(pagesBase)}`);
});

test('a return target opens only a known lesson or a known view', () => {
  const known = (id) => id === 'P.1';
  assert.deepEqual(parseReturnTarget('?return=%3Flesson%3DP.1', known), { view: null, lessonId: 'P.1' });
  assert.deepEqual(parseReturnTarget('?return=%3Fview%3Ddashboard', known), {
    view: 'dashboard',
    lessonId: null,
  });
  assert.equal(parseReturnTarget('?return=%3Flesson%3Dnope', known), null);
  assert.equal(parseReturnTarget('?return=%3Fview%3Dsuperuser', known), null);
  assert.equal(parseReturnTarget('', known), null);
  assert.equal(parseReturnTarget('?return=https%3A%2F%2Fevil.example', known), null);
});

// ── Workspace merge: never choose silently ───────────────────────────────────────────────────────
function workspace({ at = 1, drafts = {}, study = {}, conflicts = [] } = {}) {
  return { schema: WORKSPACE_SCHEMA, updatedAt: at, drafts, study, conflicts };
}

test('a draft present on one side only is kept', () => {
  const local = workspace({ at: 2, drafts: { 'P.1': 'local draft' } });
  const remote = workspace({ at: 1 });
  const result = mergeWorkspace(local, remote);
  assert.equal(result.doc.drafts['P.1'], 'local draft');
  assert.equal(result.addedDrafts, 1);
  assert.equal(result.conflicts, 0);
});

test('two different drafts are both kept, and the newer snapshot owns the slot', () => {
  const local = workspace({ at: 5, drafts: { 'P.1': 'mine' } });
  const remote = workspace({ at: 9, drafts: { 'P.1': 'theirs' } });
  const result = mergeWorkspace(local, remote);
  assert.equal(result.doc.drafts['P.1'], 'theirs');
  assert.equal(result.conflicts, 1);
  const kept = result.doc.conflicts[0];
  assert.equal(kept.kind, 'draft');
  assert.equal(kept.text, 'mine');
  assert.equal(kept.from, 'local');
});

test('identical drafts do not invent a conflict', () => {
  const same = { 'P.1': 'same text' };
  const result = mergeWorkspace(workspace({ at: 2, drafts: same }), workspace({ at: 5, drafts: same }));
  assert.equal(result.conflicts, 0);
  assert.equal(result.doc.drafts['P.1'], 'same text');
});

test('notes fill a gap, and two notes are kept as a conflict', () => {
  const local = workspace({ at: 3, study: { 'P.1': { note: 'local note', highlights: [], updatedAt: 3 } } });
  const remote = workspace({
    at: 4,
    study: {
      'P.2': { note: 'remote note', highlights: [], updatedAt: 4 },
      'P.3': { note: '', highlights: [{ quote: 'q', comment: 'c', at: 4 }], updatedAt: 4 },
    },
  });
  const result = mergeWorkspace(local, remote);
  assert.equal(result.doc.study['P.1'].note, 'local note');
  assert.equal(result.doc.study['P.2'].note, 'remote note');
  assert.equal(result.conflicts, 0);

  const clash = mergeWorkspace(
    workspace({ at: 1, study: { 'P.1': { note: 'older note', highlights: [], updatedAt: 1 } } }),
    workspace({ at: 2, study: { 'P.1': { note: 'newer note', highlights: [], updatedAt: 2 } } })
  );
  assert.equal(clash.doc.study['P.1'].note, 'newer note');
  assert.equal(clash.conflicts, 1);
  assert.equal(clash.doc.conflicts[0].text, 'older note');
});

test('highlights union by quote, and a newer comment wins with the old one kept', () => {
  const local = workspace({
    at: 3,
    study: {
      'P.1': {
        note: '',
        highlights: [
          { quote: 'same quote', comment: 'older', at: 1 },
          { quote: 'only local', comment: '', at: 3 },
        ],
        updatedAt: 3,
      },
    },
  });
  const remote = workspace({
    at: 4,
    study: {
      'P.1': {
        note: '',
        highlights: [{ quote: 'same quote', comment: 'newer', at: 4 }],
        updatedAt: 4,
      },
    },
  });
  const result = mergeWorkspace(local, remote);
  const merged = result.doc.study['P.1'];
  assert.equal(merged.highlights.length, 2);
  assert.equal(merged.highlights.find((entry) => entry.quote === 'same quote').comment, 'newer');
  assert.equal(result.conflicts, 1);
  assert.equal(result.doc.conflicts[0].text, 'older');
});

test('merging the merged document is stable', () => {
  const local = workspace({ at: 5, drafts: { 'P.1': 'mine' } });
  const remote = workspace({ at: 9, drafts: { 'P.1': 'theirs' } });
  const once = mergeWorkspace(local, remote).doc;
  const twice = mergeWorkspace(once, once);
  assert.equal(twice.conflicts, 0);
  assert.deepEqual(twice.doc.drafts, once.drafts);
});

test('a workspace document is validated before it is trusted', () => {
  assert.equal(isWorkspaceDoc(workspace()), true);
  assert.equal(isWorkspaceDoc(null), false);
  assert.equal(isWorkspaceDoc({ ...workspace(), schema: 'other/1' }), false);
  assert.equal(isWorkspaceDoc({ ...workspace(), drafts: null }), false);
  assert.deepEqual(workspaceCounts(emptyWorkspace()), { drafts: 0, notes: 0, highlights: 0, conflicts: 0 });
  assert.deepEqual(
    workspaceCounts(
      workspace({
        drafts: { a: 'x', b: '  ' },
        study: { a: { note: 'n', highlights: [{ quote: 'q', comment: '', at: 1 }], updatedAt: 1 } },
      })
    ),
    { drafts: 1, notes: 1, highlights: 1, conflicts: 0 }
  );
});

// ── Dashboard model ─────────────────────────────────────────────────────────────────────────────
test('the dashboard names one next action and counts what is actually there', () => {
  const model = buildDashboard({
    lessons: [
      { id: 'P.1', title: 'Variables' },
      { id: 'P.2', title: 'Loops' },
    ],
    verified: { 'P.1': true },
    completed: { 'P.2': true },
    milestones: { m1: true, m2: false },
    continueLesson: { id: 'P.2', reason: 'resume' },
    drafts: { 'P.2': 'print(1)', 'P.1': 'x = 1' },
    study: { 'P.1': { note: 'a note', highlights: [{ quote: 'q' }] } },
    events: [
      { t: 10, kind: 'lesson_open', lesson: 'P.1' },
      { t: 20, kind: 'run', lesson: 'P.2' },
      { t: 30, kind: 'hint', lesson: 'P.2' },
      { t: 40, kind: 'run' },
    ],
    dueCards: 3.7,
    account: { email: 'learner@example.com', workspaceSync: true, syncNote: 'Saved.', conflicts: 1 },
  });
  assert.equal(model.continueLesson.title, 'Loops');
  assert.equal(model.continueLesson.hasDraft, true);
  assert.equal(model.continueLesson.chars, 8);
  assert.deepEqual(model.progress, { verified: 1, completed: 1, milestones: 1, totalLessons: 2 });
  assert.deepEqual(model.recent.map((row) => row.id), ['P.2', 'P.1']);
  assert.deepEqual(model.saved.map((row) => row.id), ['P.2', 'P.1']);
  assert.deepEqual(model.study, { notes: 1, highlights: 1 });
  assert.equal(model.review.due, 3);
  assert.deepEqual(model.account.conflicts, 1);
});

test('no served lesson means the dashboard does not invent one', () => {
  const model = buildDashboard({
    lessons: [{ id: 'P.1', title: 'Variables' }],
    verified: {},
    completed: {},
    milestones: {},
    continueLesson: null,
    drafts: {},
    study: {},
    events: [],
    dueCards: 0,
    account: { email: null, workspaceSync: false, syncNote: '', conflicts: 0 },
  });
  assert.equal(model.continueLesson, null);
  assert.equal(model.recent.length, 0);
});

// ── Admin model ────────────────────────────────────────────────────────────────────────────────
test('the admin area is closed unless the role is exactly admin', () => {
  assert.equal(adminCapabilities(null).length, 0);
  assert.equal(adminCapabilities('admin').length > 0, true);
  assert.equal(adminDenial({ configured: false, signedIn: false, role: null }), 'not-configured');
  assert.equal(adminDenial({ configured: true, signedIn: false, role: null }), 'signed-out');
  assert.equal(adminDenial({ configured: true, signedIn: true, role: 'learner' }), 'not-admin');
  assert.equal(adminDenial({ configured: true, signedIn: true, role: 'admin' }), null);
  for (const value of Object.values(ADMIN_DENIAL_TEXT)) {
    assert.equal(typeof value, 'string');
    assert.ok(value.length > 10);
  }
});

test('an action the UI can send is one the server learns', () => {
  const server = new Set([
    'site_settings.list',
    'site_setting.set',
    'site_setting.clear',
    'audit.list',
    'role.assign',
  ]);
  for (const action of ADMIN_ACTIONS) assert.equal(server.has(action), true, action);
  assert.equal(isAdminAction('role.assign'), true);
  assert.equal(isAdminAction('role.delete-everything'), false);
  assert.equal(isAdminAction(null), false);
});

// ── Public settings ────────────────────────────────────────────────────────────────────────────
test('settings default to the behaviour the build already had', () => {
  const defaults = defaultPublicSettings();
  assert.equal(defaults.announcement, '');
  assert.equal(flagOn(defaults, 'guided_tour'), true);
});

test('an announcement is trimmed and capped; only known boolean flags are read', () => {
  const parsed = parsePublicSettings([
    { key: 'announcement', value: `  ${'x'.repeat(400)}  ` },
    { key: 'feature_flags', value: { guided_tour: false, unknown_flag: true, pair_mode: false } },
    { key: 'something_else', value: 'ignored' },
  ]);
  assert.equal(parsed.announcement.length, MAX_ANNOUNCEMENT_CHARS);
  assert.equal(flagOn(parsed, 'guided_tour'), false);
  assert.deepEqual(Object.keys(parsed.flags), ['guided_tour']);
});

test('a non-boolean or non-string row cannot change settings', () => {
  const parsed = parsePublicSettings([
    { key: 'announcement', value: 42 },
    { key: 'feature_flags', value: { guided_tour: 'no' } },
  ]);
  assert.equal(parsed.announcement, '');
  assert.equal(flagOn(parsed, 'guided_tour'), true);
});

test('a half-finished two-factor attempt is cleared, a working factor never is', () => {
  // The dead end this exists for: the secret was shown, the code never arrived, and Supabase then
  // refuses a second factor under the same friendly name — so the account can never enrol again.
  const listed = [
    { id: 'stale', factor_type: 'totp', status: 'unverified', friendly_name: 'MechaLab admin' },
    { id: 'real', factor_type: 'totp', status: 'verified', friendly_name: 'MechaLab admin' },
    { id: 'phone', factor_type: 'phone', status: 'unverified' },
  ];
  assert.deepEqual(staleTotpFactors(listed), [{ id: 'stale' }]);
  assert.deepEqual(staleTotpFactors([{ id: 'real', factor_type: 'totp', status: 'verified' }]), []);
  assert.deepEqual(staleTotpFactors([]), []);
  assert.deepEqual(staleTotpFactors(null), []);
  assert.deepEqual(staleTotpFactors(undefined), []);
});

console.log(`accounts: ${passed} checks passed`);
