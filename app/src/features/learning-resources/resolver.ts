import type { LessonResource, LicenseCondition } from './registry';
import { providerForUrl, youtubeEmbedUrl } from './providers.ts';

export const EMBED_MAX_AGE_DAYS = 45;

/** A checked-at timestamp is only usable while it is recent enough to mean something. */
export function embedIsFresh(checkedAt: string, now: Date = new Date()): boolean {
  if (!checkedAt) return false;
  const checked = Date.parse(checkedAt);
  if (!Number.isFinite(checked)) return false;
  const age = now.getTime() - checked;
  // A report stamp a little ahead of this machine's clock is treated as fresh; a future date years
  // away is not a verification, it is a broken file.
  return age >= -24 * 60 * 60 * 1000 && age <= EMBED_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * What the Resources panel can do with one authored entry
 * (`app/src/features/learning-resources/resolver.ts`).
 *
 * The workbench is cross-origin isolated with `COEP: require-corp` so Pyodide can be interrupted in
 * place. A cross-origin frame without a compatible CORP header is therefore an empty box, and the
 * P.1 providers do not send one. External resources are outbound links; a local Markdown link that
 * names a lesson opens that lesson's own `?lesson=` address; a local file that the app does not
 * serve stays visible with a reason instead of disappearing.
 *
 * The resolver is pure: it reads the generated record and the caller's lesson path map, and returns
 * a value. It never touches the DOM, storage, or the network.
 */
export type ResolvedResource =
  | { kind: 'external'; url: string }
  | { kind: 'internal'; url: string; lessonId: string }
  | { kind: 'unavailable'; reason: string };

/**
 * The renderer choice for a workspace (`resolvePresentation`). The reading guide is not in this
 * union: it is rendered beside whichever presentation wins, because the guide is the part that stays
 * useful when a provider refuses a frame.
 */
export type ResolvedPresentation =
  | {
      kind: 'native-embed';
      embedUrl: string;
      fallbackUrl: string;
      providerKey: string;
      sandbox: string;
      allow: string;
      reason: string;
    }
  | {
      kind: 'iframe';
      url: string;
      fallbackUrl: string;
      providerKey: string;
      sandbox: string;
      allow: string;
      /** The frame has no credentials or shared storage; the app stays COEP-isolated. */
      credentialless: boolean;
      reason: string;
    }
  | {
      kind: 'reader';
      snapshotPath: string;
      fallbackUrl: string;
      reason: string;
    }
  | { kind: 'external'; url: string; fallbackUrl: string; reason: string }
  | { kind: 'internal'; url: string; lessonId: string; reason: string }
  | { kind: 'unavailable'; reason: string };

export interface ReaderRights {
  /** The conditions a snapshot build has actually satisfied; every recorded condition must be here. */
  satisfied: readonly LicenseCondition[];
}

/**
 * The obligations this build's text-only reader can meet.
 *
 * `permission-required`, `code-only` and `no-download` are deliberately absent: those sources are
 * not text-snapshot candidates, even when a provider record says `reuse: allowed` for some assets.
 */
export const READER_CONDITIONS: readonly LicenseCondition[] = [
  'notice',
  'attribution',
  'share-alike',
  'non-commercial',
  'indicate-changes',
  'no-trademark',
  'per-asset-check',
];

/**
 * The rights a caller may claim for a resource. A snapshot is required, the licence must allow
 * reuse, and every recorded condition must be one this reader actually implements. The caller then
 * passes the result to the resolver; the resolver checks the list again rather than trusting it.
 */
export function readerRightsFor(resource: LessonResource): ReaderRights | null {
  const license = resource.license;
  if (!resource.snapshot?.path || !license || license.reuse !== 'allowed') return null;
  if (!license.conditions.every((condition) => READER_CONDITIONS.includes(condition))) return null;
  return { satisfied: license.conditions };
}

export interface PresentationContext {
  now?: Date;
  sourcePath?: string;
  lessonByPath?: ReadonlyMap<string, string>;
  /** Reader Mode is opt-in and only exists for a licence-cleared, build-time snapshot. */
  readerEnabled?: boolean;
  /** A reader snapshot must name every obligation the build has satisfied; absent means no reader. */
  readerRights?: ReaderRights;
  /** Choose the snapshot ahead of an otherwise usable frame (the workspace's Reader toggle). */
  preferReader?: boolean;
}

function externalFailure(resource: LessonResource, reason: string): ResolvedPresentation {
  const safe = resource.kind === 'external' ? safeExternalUrl(resource.url) : null;
  return safe
    ? { kind: 'external', url: safe, fallbackUrl: safe, reason }
    : { kind: 'unavailable', reason: safe === null && resource.kind === 'external' ? 'This resource URL is not a safe http(s) link.' : reason };
}

/**
 * Choose a presentation for one authored resource.
 *
 * Order: author override, official native player, verified iframe, licensed reader snapshot, external
 * fallback. A stale verification is not a licence to guess: it falls back exactly like a blocked one.
 */
export function resolvePresentation(
  resource: LessonResource,
  context: PresentationContext = {}
): ResolvedPresentation {
  if (resource.kind === 'local') {
    const local = resolveResource(resource, {
      sourcePath: context.sourcePath,
      lessonByPath: context.lessonByPath,
    });
    if (local.kind === 'internal') {
      return { ...local, reason: 'This local link names a lesson in this build.' };
    }
    return local.kind === 'external'
      ? { ...local, fallbackUrl: local.url, reason: 'This local link is an external address.' }
      : local;
  }

  const fallbackUrl = safeExternalUrl(resource.url);
  if (!fallbackUrl) {
    return { kind: 'unavailable', reason: 'This resource URL is not a safe http(s) link.' };
  }
  if (resource.presentation === 'external') {
    return { kind: 'external', url: fallbackUrl, fallbackUrl, reason: 'The author chose to open this resource outside MechaLab.' };
  }

  const provider = providerForUrl(resource.url, resource.providerKey);
  if (provider?.mechanism === 'native') {
    const embedUrl = provider.key === 'youtube' ? youtubeEmbedUrl(resource.url) : null;
    if (embedUrl) {
      return {
        kind: 'native-embed',
        embedUrl,
        fallbackUrl,
        providerKey: provider.key,
        sandbox: provider.sandbox ?? 'allow-scripts allow-same-origin allow-presentation',
        allow: provider.allow ?? 'fullscreen',
        reason: 'The official privacy-enhanced player is available after a click.',
      };
    }
    return externalFailure(resource, 'The provider is native-embed only, but this address is not one of its official player URLs.');
  }

  // Reader Mode is build-time content, not a fetch. The resolver demands all four facts: an
  // explicit opt-in, an allowed licence, a validated snapshot path and a rights list naming every
  // recorded condition. A missing or incomplete list falls back to the original instead of guessing.
  const reader = readerPresentation(resource, fallbackUrl, context);
  if (context.preferReader && reader?.kind === 'reader') return reader;

  const method = resource.embed.method;
  if (
    provider?.approved &&
    provider.mechanism === 'iframe' &&
    resource.embed.status === 'embeddable' &&
    (method === 'corp' || method === 'credentialless') &&
    embedIsFresh(resource.embed.checkedAt, context.now) &&
    fallbackUrl.startsWith('https://') &&
    provider.sandbox
  ) {
    return {
      kind: 'iframe',
      url: fallbackUrl,
      fallbackUrl,
      providerKey: provider.key,
      sandbox: provider.sandbox,
      allow: provider.allow ?? '',
      credentialless: method === 'credentialless',
      reason:
        method === 'credentialless'
          ? 'Framed credentialless: no credentials or shared storage, so the app stays COEP-isolated.'
          : 'The provider sends the CORP header an ordinary isolated frame requires.',
    };
  }

  if (!provider) return reader ?? externalFailure(resource, 'This host is not on the provider allowlist; open the original in a new tab.');
  if (!provider.approved || provider.mechanism === 'external') {
    return reader ?? externalFailure(resource, `The provider is link-only in MechaLab. ${provider.evidence ?? ''}`.trim());
  }
  if (resource.embed.status === 'blocked') {
    return reader ?? externalFailure(resource, `The provider refuses framing: ${resource.embed.evidence}. Open the original instead.`);
  }
  if (!embedIsFresh(resource.embed.checkedAt, context.now)) {
    return reader ?? externalFailure(resource, 'The embedding verdict is stale or missing; MechaLab does not guess at a frame.');
  }
  return reader ?? externalFailure(resource, `This provider is not embeddable right now: ${resource.embed.evidence}.`);
}

/** The licensed reader path, or the reason a snapshot-shaped resource still has to stay external. */
function readerPresentation(
  resource: LessonResource,
  fallbackUrl: string,
  context: PresentationContext
): ResolvedPresentation | null {
  if (!context.readerEnabled || resource.license?.reuse !== 'allowed' || !resource.snapshot?.path) {
    return null;
  }
  const satisfied = new Set(context.readerRights?.satisfied ?? []);
  if (!resource.license.conditions.every((condition) => satisfied.has(condition))) {
    return externalFailure(
      resource,
      'The build has not satisfied every recorded licence condition for this snapshot; open the original instead.'
    );
  }
  return {
    kind: 'reader',
    snapshotPath: resource.snapshot.path,
    fallbackUrl,
    reason: 'A licence-cleared, text-only build-time snapshot is rendered in MechaLab typography.',
  };
}

export interface ResourceContext {
  /** The source lesson page's repository path; relative local links are resolved against it. */
  sourcePath?: string;
  /** Lesson repository path -> lesson id, supplied by the panel from the authoritative lesson data. */
  lessonByPath?: ReadonlyMap<string, string>;
}

/**
 * An http(s) URL that is safe to put in an anchor, or null.
 *
 * The generated registry is trusted build output, but the guard still earns its place: a hand-edited
 * JSON file, a future provider field or a test fixture should not be able to turn a link into
 * `javascript:` or `data:`. Credentials in the authority are refused too, because they would be
 * shown in the URL and are never part of a course citation.
 */
export function safeExternalUrl(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  // Resource URLs are authored as absolute citations. Refuse a bare word before `new URL` can
  // resolve it against a base; otherwise "not a url" becomes a valid same-site path.
  if (!/^https?:\/\//i.test(raw.trim())) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  return url.href;
}

function splitPath(raw: string): { path: string; fragment: string } {
  const cut = raw.search(/[?#]/);
  if (cut === -1) return { path: raw, fragment: '' };
  const suffix = raw.slice(cut);
  return { path: raw.slice(0, cut), fragment: suffix.startsWith('#') ? suffix : '' };
}

function decodedPath(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** Resolve a resource's relative path against the page that authored it. */
function normalizeRelativePath(sourcePath: string, targetPath: string): string | null {
  const target = decodedPath(targetPath).replace(/\\/g, '/');
  const parts = target.startsWith('/') ? [] : sourcePath.split('/').slice(0, -1);
  for (const segment of target.replace(/^\/+/, '').split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (!parts.length) return null;
      parts.pop();
      continue;
    }
    parts.push(segment);
  }
  return parts.length ? parts.join('/') : null;
}

function internalLesson(lessonId: string, fragment = ''): ResolvedResource {
  return { kind: 'internal', url: `?lesson=${encodeURIComponent(lessonId)}${fragment}`, lessonId };
}

function unavailableLocal(resource: LessonResource): ResolvedResource {
  return {
    kind: 'unavailable',
    reason: `This local link (${resource.url}) is not an app page or a lesson in this build. MechaLab cannot open it here; use the course repository to open the file.`,
  };
}

/**
 * Resolve one authored resource. The context supplies the source page path and the authoritative
 * lesson path map; without the map a local path is reported as unavailable rather than guessed.
 */
export function resolveResource(resource: LessonResource, context: ResourceContext = {}): ResolvedResource {
  const { sourcePath = '', lessonByPath } = context;

  if (resource.kind === 'external') {
    const url = safeExternalUrl(resource.url);
    return url
      ? { kind: 'external', url }
      : { kind: 'unavailable', reason: 'This resource URL is not a safe http(s) link.' };
  }

  const raw = resource.url.trim();
  if (raw.startsWith('?')) {
    const lessonId = new URLSearchParams(raw).get('lesson');
    const known = lessonId && lessonByPath ? new Set(lessonByPath.values()).has(lessonId) : false;
    return known && lessonId
      ? internalLesson(lessonId)
      : {
          kind: 'unavailable',
          reason: 'This local app link does not name a lesson in this build.',
        };
  }

  const { path, fragment } = splitPath(raw);
  const normalized = path ? normalizeRelativePath(sourcePath, path) : null;
  const lessonId = normalized ? lessonByPath?.get(normalized) : undefined;
  return lessonId ? internalLesson(lessonId, fragment) : unavailableLocal(resource);
}
