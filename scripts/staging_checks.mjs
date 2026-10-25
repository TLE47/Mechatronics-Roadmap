#!/usr/bin/env node
/**
 * The staging pass (`npm run check:staging`), against a real Supabase project.
 *
 * Creates three confirmed test accounts (admin, learner, disposable) with generated passwords, then
 * exercises the things no unit test can answer: row-level security across accounts, the role gate on
 * the Edge Functions, the two-factor requirement (a real TOTP enrolment, computed here), settings
 * writes and the public read, the last-admin guard, the audit trail, export and account deletion, and
 * the curriculum function's 501 while its GitHub App secrets are absent.
 *
 * This writes to a live project, so it never runs in CI and never runs against production. Point it
 * at staging:
 *
 *   SUPABASE_ACCESS_TOKEN=… SUPABASE_PROJECT_REF=<ref> npm run check:staging
 *
 * The anon key is read from `.env.local` (the same file `npm run dev` uses); the access token may
 * also sit in `~/.staging-secrets/supabase-token`. Generated test-account passwords are written to
 * `~/.staging-secrets/staging-users.json` (0600) for `npm run test:e2e:two-factor`, and never
 * printed. Accounts left by an earlier run are deleted at the start, so the pass is repeatable.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HOME_SECRETS = process.env.STAGING_SECRETS_DIR ?? path.join(os.homedir(), '.staging-secrets');
const REF =
  process.env.SUPABASE_PROJECT_REF ??
  (fs.existsSync('.env.local')
    ? fs.readFileSync('.env.local', 'utf8').match(/VITE_SUPABASE_URL=https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1]
    : null) ??
  '';
if (!REF) {
  console.error('Set SUPABASE_PROJECT_REF (or VITE_SUPABASE_URL in .env.local) to the staging project.');
  process.exit(66);
}
const URL_BASE = `https://${REF}.supabase.co`;
const tokenFile = path.join(HOME_SECRETS, 'supabase-token');
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN?.trim() ||
  (fs.existsSync(tokenFile) ? fs.readFileSync(tokenFile, 'utf8').trim() : '');
if (!TOKEN) {
  console.error('Set SUPABASE_ACCESS_TOKEN (a personal access token) so the pass can manage the project.');
  process.exit(66);
}

const facts = [];
function check(name, ok, detail) {
  facts.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function manage(pathname, init = {}) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${REF}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null, text };
}

async function sql(query) {
  const result = await manage('/database/query', { method: 'POST', body: JSON.stringify({ query }) });
  if (result.status >= 300) throw new Error(`sql ${result.status}: ${result.text.slice(0, 300)}`);
  return result.body;
}

async function serviceKey() {
  const keys = await manage('/api-keys');
  const row = keys.body.find((entry) => entry.name === 'service_role');
  if (!row) throw new Error('no service_role key');
  return row.api_key;
}

const password = () => `Ml-${crypto.randomBytes(9).toString('hex')}-9`;

async function createUser(adminKey, email, pass) {
  const response = await fetch(`${URL_BASE}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: adminKey,
      Authorization: `Bearer ${adminKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password: pass, email_confirm: true }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`create user ${email} ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

async function signIn(email, pass) {
  const response = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: process.env.STAGING_ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pass }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`sign in ${email} ${response.status}: ${JSON.stringify(body)}`);
  return body.access_token;
}

/** RFC 6238, SHA-1, six digits, 30-second step. */
function totp(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of secret.replace(/=+$/, '').toUpperCase()) {
    bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
  }
  const key = Buffer.from(
    bits.match(/.{8}/g).map((byte) => parseInt(byte, 2)),
    'binary'
  );
  const counter = Buffer.alloc(8);
  counter.writeUInt32BE(Math.floor(Date.now() / 30000), 4);
  const digest = crypto.createHmac('sha1', key).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, '0');
}

async function callFunction(name, jwt, body) {
  const response = await fetch(`${URL_BASE}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      apikey: process.env.STAGING_ANON,
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text.slice(0, 200) };
  }
  return { status: response.status, body: parsed };
}

async function rest(pathname, jwt, init = {}) {
  const response = await fetch(`${URL_BASE}/rest/v1/${pathname}`, {
    ...init,
    headers: {
      apikey: process.env.STAGING_ANON,
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function mfaSession(jwt, factorToken) {
  const enrol = await fetch(`${URL_BASE}/auth/v1/factors`, {
    method: 'POST',
    headers: {
      apikey: process.env.STAGING_ANON,
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ factor_type: 'totp', friendly_name: 'staging check' }),
  });
  const factor = await enrol.json();
  if (!enrol.ok) throw new Error(`enrol ${enrol.status}: ${JSON.stringify(factor)}`);

  const challengeResponse = await fetch(`${URL_BASE}/auth/v1/factors/${factor.id}/challenge`, {
    method: 'POST',
    headers: {
      apikey: process.env.STAGING_ANON,
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  const challenge = await challengeResponse.json();
  if (!challengeResponse.ok) throw new Error(`challenge ${challengeResponse.status}`);

  const verifyResponse = await fetch(`${URL_BASE}/auth/v1/factors/${factor.id}/verify`, {
    method: 'POST',
    headers: {
      apikey: process.env.STAGING_ANON,
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ challenge_id: challenge.id, code: totp(factor.totp.secret) }),
  });
  const verified = await verifyResponse.json();
  if (!verifyResponse.ok) throw new Error(`verify ${verifyResponse.status}: ${JSON.stringify(verified)}`);
  const session = verified.access_token ?? factorToken;
  const assurance = JSON.parse(Buffer.from(session.split('.')[1], 'base64url').toString()).aal;
  if (assurance !== 'aal2') {
    throw new Error(`verify returned ${assurance ?? 'no aal'}; keys ${Object.keys(verified).join(', ')}`);
  }
  return session;
}

const anonKey = fs
  .readFileSync('.env.local', 'utf8')
  .match(/VITE_SUPABASE_ANON_KEY=(\S+)/)[1];
process.env.STAGING_ANON = anonKey;

const adminKey = await serviceKey();

// A re-run starts clean: any account left by an earlier pass (or a pass that stopped early) goes.
const stale = await sql("select id from auth.users where email like '%@mechalab.test'");
for (const row of stale) {
  await fetch(`${URL_BASE}/auth/v1/admin/users/${row.id}`, {
    method: 'DELETE',
    headers: { apikey: adminKey, Authorization: `Bearer ${adminKey}` },
  });
}
if (stale.length) console.log(`removed ${stale.length} account(s) from an earlier pass`);

const stamp = Date.now().toString(36);
const users = {
  admin: { email: `staging-admin-${stamp}@mechalab.test`, password: password() },
  learner: { email: `staging-learner-${stamp}@mechalab.test`, password: password() },
  disposable: { email: `staging-delete-${stamp}@mechalab.test`, password: password() },
};
const created = {};
for (const [role, account] of Object.entries(users)) {
  created[role] = await createUser(adminKey, account.email, account.password);
}
fs.mkdirSync(HOME_SECRETS, { recursive: true, mode: 0o700 });
fs.writeFileSync(
  path.join(HOME_SECRETS, 'staging-users.json'),
  `${JSON.stringify({ users, ids: Object.fromEntries(Object.entries(created).map(([k, v]) => [k, v.id])) }, null, 2)}\n`,
  { mode: 0o600 }
);
console.log(`created ${Object.keys(created).length} confirmed test accounts`);

// The human admin (their own account) and the ids everything below is scoped by.
const humans = await sql(
  "select id from auth.users where email not like '%@mechalab.test' order by created_at limit 1"
);
const humanId = humans[0]?.id ?? null;
const adminId = created.admin.id;
const learnerId = created.learner.id;

await sql(
  `insert into public.mechalab_roles (user_id, role) values ('${adminId}','admin'), ('${learnerId}','learner')
   on conflict (user_id) do update set role = excluded.role`
);

const adminJwt = await signIn(users.admin.email, users.admin.password);
const learnerJwt = await signIn(users.learner.email, users.learner.password);
const disposableJwt = await signIn(users.disposable.email, users.disposable.password);

// ---- Row-level security: own row only, and no writing into somebody else's ----
await rest('mechalab_progress', learnerJwt, {
  method: 'POST',
  body: JSON.stringify({ user_id: learnerId, snapshot: { schema: 'mechalab.progress/1', lessons: {} } }),
  headers: { Prefer: 'return=representation' },
});
const ownRow = await rest(`mechalab_progress?select=user_id&user_id=eq.${learnerId}`, learnerJwt);
check('a learner can insert and read their own progress row', ownRow.status === 200 && ownRow.body.length === 1);

if (humanId) {
  const foreignRead = await rest(`mechalab_progress?select=user_id&user_id=eq.${humanId}`, learnerJwt);
  check(
    "a learner's JWT reads none of another account's progress",
    foreignRead.status === 200 && foreignRead.body.length === 0,
    `HTTP ${foreignRead.status}, ${JSON.stringify(foreignRead.body).slice(0, 80)}`
  );
  const foreignWrite = await rest('mechalab_progress', learnerJwt, {
    method: 'POST',
    body: JSON.stringify({ user_id: humanId, snapshot: {} }),
    headers: { Prefer: 'return=representation' },
  });
  check(
    "a learner cannot write into another account's progress row",
    foreignWrite.status === 403,
    `HTTP ${foreignWrite.status}`
  );
}

const roleWrite = await fetch(`${URL_BASE}/rest/v1/mechalab_roles?user_id=eq.${learnerId}`, {
  method: 'PATCH',
  headers: {
    apikey: process.env.STAGING_ANON,
    Authorization: `Bearer ${learnerJwt}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ role: 'admin' }),
});
check(
  'a learner cannot grant themselves a role through the browser API',
  roleWrite.status === 403 || roleWrite.status === 405,
  `HTTP ${roleWrite.status}`
);

// ---- The function gate, before any second factor ----
const learnerAdminCall = await callFunction('admin-action', learnerJwt, { action: 'site_settings.list' });
check(
  "a learner's JWT is refused by admin-action",
  learnerAdminCall.status === 403 && /not an admin/i.test(learnerAdminCall.body?.error ?? ''),
  `HTTP ${learnerAdminCall.status} ${learnerAdminCall.body?.error ?? ''}`
);
const learnerPr = await callFunction('curriculum-pr', learnerJwt, {
  lessonPath: 'modules/00-foundations.T1.00a.md',
  markdown: '# nope\n',
  summary: 'should not open',
});
check("a learner's JWT is refused by curriculum-pr", learnerPr.status === 403, `HTTP ${learnerPr.status}`);

const aal1 = await callFunction('admin-action', adminJwt, { action: 'site_settings.list' });
check(
  'an admin without a second factor is refused, with the MFA sentence',
  aal1.status === 403 && /two-factor/i.test(aal1.body?.error ?? ''),
  `HTTP ${aal1.status} ${aal1.body?.error ?? ''}`
);

// ---- Real TOTP enrolment, then the same call at aal2 ----
const aal2Jwt = await mfaSession(adminJwt, adminJwt);
const atAal2 = await callFunction('admin-action', aal2Jwt, { action: 'site_settings.list' });
check(
  'the same admin at aal2 is allowed in',
  atAal2.status === 200 && Array.isArray(atAal2.body?.settings),
  `HTTP ${atAal2.status}`
);

// ---- Settings: write, public read, clear, all audited ----
const set = await callFunction('admin-action', aal2Jwt, {
  action: 'site_setting.set',
  key: 'announcement',
  value: 'Staging check — this banner is real.',
});
check('an admin can set the announcement', set.status === 200, `HTTP ${set.status}`);
const publicRead = await fetch(
  `${URL_BASE}/rest/v1/mechalab_site_settings?select=key,value&key=eq.announcement`,
  { headers: { apikey: anonKey } }
);
const publicRows = await publicRead.json();
check(
  'a signed-out reader sees it (public select)',
  publicRead.status === 200 && publicRows.length === 1,
  `HTTP ${publicRead.status}, ${publicRows.length} row(s)`
);
const clear = await callFunction('admin-action', aal2Jwt, {
  action: 'site_setting.clear',
  key: 'announcement',
});
const afterClear = await fetch(
  `${URL_BASE}/rest/v1/mechalab_site_settings?select=key&key=eq.announcement`,
  { headers: { apikey: anonKey } }
);
check(
  'clearing it removes the row, and the public read follows',
  clear.status === 200 && (await afterClear.json()).length === 0,
  `HTTP ${clear.status}`
);

// ---- Roles, the last-admin guard, and the audit trail ----
const promote = await callFunction('admin-action', aal2Jwt, {
  action: 'role.assign',
  userId: learnerId,
  role: 'admin',
});
const demote = await callFunction('admin-action', aal2Jwt, {
  action: 'role.assign',
  userId: learnerId,
  role: 'learner',
});
check(
  'an admin can promote and demote another account',
  promote.status === 200 && demote.status === 200,
  `HTTP ${promote.status}/${demote.status}`
);

const audit = await callFunction('admin-action', aal2Jwt, { action: 'audit.list', limit: 20 });
const actions = (audit.body?.entries ?? []).map((entry) => entry.action);
check(
  'every write left an audit entry',
  actions.includes('site_setting.set') && actions.includes('site_setting.clear') && actions.includes('role.assign'),
  [...new Set(actions)].join(', ')
);

// Demote the human admin, expect the guard to refuse demoting the last admin, then put them back
// in a finally, so an interrupt between the two cannot leave the project without its owner.
let guard = { status: 0, body: null };
if (humanId) {
  await callFunction('admin-action', aal2Jwt, {
    action: 'role.assign',
    userId: humanId,
    role: 'learner',
  });
  try {
    guard = await callFunction('admin-action', aal2Jwt, {
      action: 'role.assign',
      userId: adminId,
      role: 'learner',
    });
  } finally {
    await callFunction('admin-action', aal2Jwt, {
      action: 'role.assign',
      userId: humanId,
      role: 'admin',
    });
  }
}
check(
  'demoting the last admin is refused with 409',
  guard.status === 409,
  `HTTP ${guard.status} ${guard.body?.error ?? ''}`
);
const restored = await sql(
  `select user_id, role from public.mechalab_roles where user_id = '${humanId}'`
);
check(
  'the human admin still holds the role afterwards',
  !humanId || restored[0]?.role === 'admin',
  JSON.stringify(restored)
);

// ---- Export and delete, against throwaway and learner accounts ----
const exportResult = await callFunction('account-action', learnerJwt, { action: 'export' });
check(
  'export returns the account, progress and workspace as one document',
  exportResult.status === 200 &&
    typeof exportResult.body?.account?.id === 'string' &&
    'progress' in (exportResult.body ?? {}) &&
    'workspace' in (exportResult.body ?? {}),
  `HTTP ${exportResult.status}, keys ${Object.keys(exportResult.body ?? {}).join(', ')}`
);

await rest('mechalab_progress', disposableJwt, {
  method: 'POST',
  body: JSON.stringify({
    user_id: created.disposable.id,
    snapshot: { schema: 'mechalab.progress/1', lessons: {} },
  }),
});
const deleted = await callFunction('account-action', disposableJwt, {
  action: 'delete',
  confirmation: 'DELETE',
});
const gone = await fetch(`${URL_BASE}/auth/v1/admin/users/${created.disposable.id}`, {
  headers: { apikey: adminKey, Authorization: `Bearer ${adminKey}` },
});
const goneRows = await rest(
  `mechalab_progress?select=user_id&user_id=eq.${created.disposable.id}`,
  adminKey
);
check(
  'delete removes the auth user and their rows',
  deleted.status === 200 && gone.status === 404 && goneRows.body.length === 0,
  `delete ${deleted.status}, user ${gone.status}, rows ${goneRows.body.length}`
);

// ---- The function without its GitHub App secrets ----
const pr = await callFunction('curriculum-pr', aal2Jwt, {
  lessonPath: 'modules/00-foundations.T1.00a.md',
  markdown: '# staging check\n',
  summary: 'staging check',
});
check(
  'curriculum-pr answers 501 until its GitHub App secrets are set',
  pr.status === 501,
  `HTTP ${pr.status}`
);

const failed = facts.filter((fact) => !fact.ok);
console.log(
  `\n${facts.length - failed.length}/${facts.length} staging checks passed` +
    (failed.length ? `; failed: ${failed.map((fact) => fact.name).join(' | ')}` : '')
);
console.log(
  `cleanup when done:\n  delete from auth.users where email like '%@mechalab.test';\n  (test accounts: ${Object.values(users).map((u) => u.email).join(', ')})`
);
process.exit(failed.length ? 1 : 0);
