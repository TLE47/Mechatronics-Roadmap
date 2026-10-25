#!/usr/bin/env node
/**
 * Two-factor through the real panel (`npm run test:e2e:two-factor`), against staging.
 *
 * Part one is a first-time admin: sign in, "Set up two-factor", take the secret the panel shows,
 * verify a code computed here, then open the admin area and save an announcement — panel → Supabase
 * MFA → aal2 → Edge Function, in one run.
 *
 * Part two is the same person on another device: a fresh browser context signs in, and the panel must
 * offer the code form (not enrolment again) and unlock admin actions a second time.
 *
 * Run `npm run check:staging` first: it writes the test admin to `~/.staging-secrets/staging-users.json`.
 * This clears any factor that earlier run left, so part one really is a first-time setup. The dev
 * server on :3000 must be built with the staging keys (E2E_BASE_URL overrides the address).
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { resolveChromiumExecutable } from '../scripts/e2e_browser_workbench.mjs';
import { seedTourSeen } from './tour_seed.mjs';

const SECRETS = process.env.STAGING_SECRETS_DIR ?? path.join(os.homedir(), '.staging-secrets');
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const saved = JSON.parse(fs.readFileSync(path.join(SECRETS, 'staging-users.json'), 'utf8'));
const { email, password } = saved.users.admin;
const adminId = saved.ids.admin;
const REF =
  process.env.SUPABASE_PROJECT_REF ??
  (fs.existsSync('.env.local')
    ? fs.readFileSync('.env.local', 'utf8').match(/VITE_SUPABASE_URL=https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1]
    : null) ??
  '';
const token =
  process.env.SUPABASE_ACCESS_TOKEN?.trim() ||
  fs.readFileSync(path.join(SECRETS, 'supabase-token'), 'utf8').trim();
if (!REF) {
  console.error('Set SUPABASE_PROJECT_REF (or VITE_SUPABASE_URL in .env.local) to the staging project.');
  process.exit(66);
}

/** Clear the factors an earlier run left, so the panel starts where a brand-new admin starts. */
async function clearFactors() {
  const keys = await (
    await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  ).json();
  const service = keys.find((entry) => entry.name === 'service_role')?.api_key;
  const headers = { apikey: service, Authorization: `Bearer ${service}` };
  const user = await (
    await fetch(`https://${REF}.supabase.co/auth/v1/admin/users/${adminId}`, { headers })
  ).json();
  for (const factor of user.factors ?? []) {
    await fetch(`https://${REF}.supabase.co/auth/v1/admin/users/${adminId}/factors/${factor.id}`, {
      method: 'DELETE',
      headers,
    });
  }
  return (user.factors ?? []).length;
}

function totp(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of secret.replace(/=+$/, '').toUpperCase()) {
    bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
  }
  const key = Buffer.from(bits.match(/.{8}/g).map((byte) => parseInt(byte, 2)), 'binary');
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

/** Fill the sign-in form, which must already be on screen, and wait for the signed-in view. */
async function submitSignIn(page) {
  await page.getByTestId('input-account-email').fill(email);
  await page.getByTestId('input-account-password').fill(password);
  await page.getByTestId('btn-password-sign-in').click();
  await page.getByTestId('btn-open-admin').waitFor({ state: 'visible', timeout: 20000 });
}

const cleared = await clearFactors();
console.log(`cleared ${cleared} factor(s) from an earlier run`);

const executablePath = resolveChromiumExecutable();
const browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}), headless: true });
try {
  const page = await browser.newPage();
  // The tour would open over the header this suite clicks; it has its own suite (`scripts/e2e_tour.mjs`).
  await seedTourSeen(page);
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('btn-account').click();
  await submitSignIn(page);
  console.log('PASS  the panel signs in and the admin entry point appears');

  await page.getByTestId('btn-enrol-totp').waitFor({ state: 'visible', timeout: 10000 });
  await page.getByTestId('btn-enrol-totp').click();
  const secretNode = page.getByTestId('totp-secret');
  await secretNode.waitFor({ state: 'visible', timeout: 20000 });
  const secret = (await secretNode.textContent())?.trim() ?? '';
  assert.match(secret, /^[A-Z2-7]{16,}$/, `unexpected secret: ${secret.slice(0, 4)}…`);
  const uri = await page.getByTestId('totp-uri').getAttribute('href');
  assert.ok(uri?.startsWith('otpauth://totp/'), `unexpected uri: ${uri}`);
  console.log('PASS  a first-time admin gets a base32 secret and an otpauth:// link');

  await page.getByTestId('input-totp-code').fill(totp(secret));
  await page.getByTestId('btn-verify-totp').click();
  await page.getByTestId('two-factor-on').waitFor({ state: 'visible', timeout: 20000 });
  assert.equal(await page.getByTestId('account-error').count(), 0);
  console.log('PASS  the code verifies and the session is aal2');

  await page.getByTestId('btn-close-account').click();
  await page.getByTestId('account-panel').waitFor({ state: 'hidden', timeout: 10000 });
  await page.getByTestId('btn-account').click();
  await page.getByTestId('btn-open-admin').click();
  await page.getByTestId('admin-dashboard').waitFor({ state: 'visible', timeout: 20000 });
  await page.getByLabel('Announcement text').fill('Two-factor check — saved from the admin area.');
  await page.getByTestId('btn-save-announcement').click();
  await page.getByTestId('admin-done').waitFor({ state: 'visible', timeout: 20000 });
  console.log('PASS  the aal2 session saves an announcement through admin-action');

  // Part two: another device tomorrow. A fresh context has no stored session, so signing in lands at
  // aal1 and the panel has to recognise that a factor already exists.
  const other = await browser.newContext();
  await seedTourSeen(other);
  const page2 = await other.newPage();
  await page2.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page2.getByTestId('btn-account').click();
  await page2.getByTestId('input-account-email').fill(email);
  await page2.getByTestId('input-account-password').fill(password);
  await page2.getByTestId('btn-password-sign-in').click();
  await page2.getByTestId('two-factor-prompt').waitFor({ state: 'visible', timeout: 20000 });
  assert.equal(await page2.getByTestId('btn-enrol-totp').count(), 0, 'no second enrolment is offered');
  assert.equal(await page2.getByTestId('totp-secret').count(), 0, 'the secret is not shown again');
  console.log('PASS  a returning admin is asked for a code, and the secret is not shown again');

  await page2.getByTestId('input-totp-code').fill(totp(secret));
  await page2.getByTestId('btn-verify-totp').click();
  await page2.getByTestId('two-factor-on').waitFor({ state: 'visible', timeout: 20000 });
  console.log('PASS  the second session reaches aal2 with a code');
  await other.close();
  console.log('all two-factor panel checks passed');
} finally {
  await browser.close();
}
