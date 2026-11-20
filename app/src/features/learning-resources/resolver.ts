import type { LessonResource } from './registry';

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
