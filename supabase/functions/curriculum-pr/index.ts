/**
 * A curriculum edit leaves through a pull request, never through the database.
 *
 * The lesson Markdown in this repository is the source of truth: the generators rebuild the app's
 * lesson data from it, and CI is what decides whether a change ships. So the admin dashboard can
 * *propose* an edit, and this function turns it into a branch, one commit and a PR. Merging is still a
 * person pressing merge on something that passed the same checks as every other change.
 *
 * The GitHub App's private key stays here. A browser never holds a token that can write to the
 * repository, and this function refuses a caller who is not a signed-in admin with a two-factor
 * session.
 *
 * Secrets (Supabase → Edge Functions → Secrets):
 *   GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY (PEM), GITHUB_INSTALLATION_ID
 *   CURRICULUM_REPO (default TLE47/Mechatronics-Roadmap)
 *   CURRICULUM_BASE_BRANCH (default main)
 *
 * Deployment:
 *   supabase functions deploy curriculum-pr
 */

import { audit, json, preflight, requireAdmin } from '../_shared/http.ts';

const GITHUB_API = 'https://api.github.com';
const MAX_MARKDOWN = 400_000;
const MAX_SUMMARY = 120;

/** Only the course's own prose directories, only `.md`, no traversal. */
const LESSON_PATH =
  /^(modules|track-p|ramp|stage-0)\/[A-Za-z0-9._-]+\.md$|^[0-9]{2}-[A-Za-z0-9-]+\/[A-Za-z0-9._-]+\.md$/;

interface RequestBody {
  lessonPath?: string;
  markdown?: string;
  summary?: string;
}

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToDer(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** A ten-minute RS256 JWT, as a GitHub App authenticates itself. */
async function githubJwt(appId: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: unknown) => base64url(new TextEncoder().encode(JSON.stringify(value)));
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
    iat: now - 60,
    exp: now + 540,
    iss: appId,
  })}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(privateKey),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsigned)
  );
  return `${unsigned}.${base64url(new Uint8Array(signature))}`;
}

async function github(
  path: string,
  token: string,
  init: { method?: string; body?: unknown } = {}
): Promise<Response> {
  return fetch(`${GITHUB_API}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'mechalab-curriculum',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
}

function slug(text: string): string {
  const cleaned = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return cleaned || 'lesson-edit';
}

function b64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return preflight(req);
  if (req.method !== 'POST') return json(req, 405, { error: 'Use POST.' });

  const context = await requireAdmin(req);
  if (context instanceof Response) return context;
  const { user, service } = context;

  const appId = Deno.env.get('GITHUB_APP_ID');
  const privateKey = Deno.env.get('GITHUB_APP_PRIVATE_KEY');
  const installationId = Deno.env.get('GITHUB_INSTALLATION_ID');
  const repo = Deno.env.get('CURRICULUM_REPO') ?? 'TLE47/Mechatronics-Roadmap';
  const base = Deno.env.get('CURRICULUM_BASE_BRANCH') ?? 'main';
  if (!appId || !privateKey || !installationId) {
    return json(req, 501, { error: 'The curriculum pull-request workflow is not configured on this project.' });
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return json(req, 400, { error: 'The request body was not JSON.' });
  }

  const lessonPath = (body.lessonPath ?? '').trim();
  const markdown = body.markdown ?? '';
  const summary = (body.summary ?? '').trim();
  if (!LESSON_PATH.test(lessonPath)) {
    return json(req, 400, { error: 'That path is not a lesson page (modules/, track-p/, ramp/, stage-0/ or a 00-… chapter).' });
  }
  if (!markdown.trim()) return json(req, 400, { error: 'The proposed lesson is empty.' });
  if (markdown.length > MAX_MARKDOWN) return json(req, 400, { error: 'That lesson is too large for one commit.' });
  if (!summary || summary.length > MAX_SUMMARY) {
    return json(req, 400, { error: `Give the change a summary of 1–${MAX_SUMMARY} characters.` });
  }

  try {
    const jwt = await githubJwt(appId, privateKey);
    const tokenResponse = await github(`/app/installations/${installationId}/access_tokens`, jwt, {
      method: 'POST',
    });
    if (!tokenResponse.ok) {
      const detail = await tokenResponse.text();
      return json(req, 502, { error: `GitHub refused the app installation: ${detail.slice(0, 200)}` });
    }
    const { token } = (await tokenResponse.json()) as { token: string };

    const refResponse = await github(`/repos/${repo}/git/ref/heads/${base}`, token);
    if (!refResponse.ok) {
      return json(req, 502, { error: 'Could not read the base branch.' });
    }
    const head = (await refResponse.json()) as { object: { sha: string } };

    const branch = `curriculum/${slug(summary)}-${Date.now().toString(36)}`;
    const createRef = await github(`/repos/${repo}/git/refs`, token, {
      method: 'POST',
      body: { ref: `refs/heads/${branch}`, sha: head.object.sha },
    });
    if (!createRef.ok) {
      return json(req, 502, { error: 'Could not create the branch.' });
    }

    // Editing an existing page needs its blob sha; a new page is created without one.
    let existingSha: string | undefined;
    const existing = await github(`/repos/${repo}/contents/${lessonPath}?ref=${branch}`, token);
    if (existing.ok) {
      const file = (await existing.json()) as { sha?: string };
      existingSha = file.sha;
    } else if (existing.status !== 404) {
      return json(req, 502, { error: 'Could not read the lesson file.' });
    }

    const commit = await github(`/repos/${repo}/contents/${lessonPath}`, token, {
      method: 'PUT',
      body: {
        message: `Curriculum: ${summary}\n\nProposed from the MechaLab admin dashboard by ${user.email ?? user.id}.`,
        content: b64(markdown),
        branch,
        ...(existingSha ? { sha: existingSha } : {}),
      },
    });
    if (!commit.ok) {
      const detail = await commit.text();
      return json(req, 502, { error: `Could not commit the lesson: ${detail.slice(0, 200)}` });
    }

    const pull = await github(`/repos/${repo}/pulls`, token, {
      method: 'POST',
      body: {
        title: `Curriculum: ${summary}`,
        head: branch,
        base,
        body: [
          'Proposed from the MechaLab admin dashboard.',
          '',
          `- Lesson: \`${lessonPath}\``,
          `- By: ${user.email ?? user.id}`,
          '',
          'CI and the lesson generators are the publishing gate: merge only when the full check suite is green.',
        ].join('\n'),
      },
    });
    if (!pull.ok) {
      const detail = await pull.text();
      return json(req, 502, { error: `The commit exists on \`${branch}\`, but the pull request failed: ${detail.slice(0, 200)}` });
    }
    const pullData = (await pull.json()) as { html_url: string; number: number };

    await audit(service, user.id, 'curriculum.pr', {
      lessonPath,
      branch,
      number: pullData.number,
    });
    return json(req, 200, { url: pullData.html_url, number: pullData.number, branch });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown GitHub error.';
    return json(req, 502, { error: `The GitHub workflow failed: ${message}` });
  }
});
