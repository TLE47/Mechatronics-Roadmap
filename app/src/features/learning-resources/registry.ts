/**
 * The authored resource registry (`app/src/features/learning-resources/registry.ts`).
 *
 * The file is generated from the lesson Markdown by `scripts/generate_learning_resources.py` and
 * served from `public/`, not imported into the entry bundle: a lesson pays for the registry only
 * when it asks for its guides. The Markdown remains the source of truth; this is a read-only view of
 * what the page already says.
 */

export type ResourceRole = 'primary' | 'alternative';
export type ResourceKind = 'external' | 'local';

export interface ResourceGuide {
  /** The `What to read` / `What to complete` text, with the link-check annotation removed. */
  read: string;
  skip: string;
  takeaway: string;
}

export interface LessonResource {
  /** Stable per occurrence: lesson + role + normalized URL, with a suffix only for a true duplicate. */
  id: string;
  role: ResourceRole;
  idea: { number: number | null; title: string };
  title: string;
  url: string;
  provider: string;
  kind: ResourceKind;
  /** The bold targets authored in the guide (`Variables`, `The Shell`, …), for a future filter. */
  headings: string[];
  guide: ResourceGuide;
  sourceLine: number;
  verification: string;
}

export interface LessonResourceGroup {
  id: string;
  title: string;
  path: string;
  resources: LessonResource[];
}

export interface LearningResourceRegistry {
  version: number;
  generatedFrom: string[];
  lessonCount: number;
  lineCount: number;
  resourceCount: number;
  localResourceCount: number;
  lessons: Record<string, LessonResourceGroup>;
}

/**
 * Where the registry is served.
 *
 * `BASE_URL`, not `document.baseURI`: the file sits beside the built assets and moves with them
 * (`/Mechatronics-Roadmap/` on Pages, `/` in development). `import.meta.env` is read at call time so
 * the Node suite can import this module without a bundler.
 */
export function learningResourcesUrl(): string {
  const env = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env;
  return `${env?.BASE_URL ?? '/'}learning-resources.json`;
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isResource(value: unknown): value is LessonResource {
  if (!record(value)) return false;
  const guide = value.guide;
  return (
    typeof value.id === 'string' &&
    (value.role === 'primary' || value.role === 'alternative') &&
    (value.kind === 'external' || value.kind === 'local') &&
    typeof value.title === 'string' &&
    typeof value.url === 'string' &&
    typeof value.provider === 'string' &&
    Array.isArray(value.headings) &&
    value.headings.every((heading) => typeof heading === 'string') &&
    record(guide) &&
    typeof guide.read === 'string' &&
    typeof guide.skip === 'string' &&
    typeof guide.takeaway === 'string' &&
    typeof value.sourceLine === 'number' &&
    typeof value.verification === 'string' &&
    record(value.idea)
  );
}

function isRegistry(value: unknown): value is LearningResourceRegistry {
  if (!record(value)) return false;
  if (value.version !== 1 || !record(value.lessons)) return false;
  return Object.values(value.lessons).every((group) => {
    if (!record(group) || !Array.isArray(group.resources)) return false;
    return (
      typeof group.id === 'string' &&
      typeof group.title === 'string' &&
      typeof group.path === 'string' &&
      group.resources.every(isResource)
    );
  });
}

let cached: Promise<LearningResourceRegistry> | null = null;

/** Forget the fetched registry. The suite's door; a visit never needs it. */
export function clearLearningResourceCache(): void {
  cached = null;
}

/**
 * Fetch the registry once.
 *
 * A failed request is forgotten rather than cached, so the panel's Retry tries again; two readers
 * asking at once share one request. A 200 whose body is the SPA fallback is a failure too: painting
 * an HTML document as a resource registry would be worse than saying the guides are unavailable.
 */
export function loadLearningResources(
  options: { fetch?: typeof fetch } = {}
): Promise<LearningResourceRegistry> {
  if (cached) return cached;

  const fetcher = options.fetch ?? (typeof fetch === 'function' ? fetch : null);
  if (!fetcher) return Promise.reject(new Error('this browser cannot fetch the resource guides'));

  const attempt = (async (): Promise<LearningResourceRegistry> => {
    const response = await fetcher(learningResourcesUrl());
    if (!response.ok) throw new Error(`the resource guides answered ${response.status}`);
    const contentType = response.headers?.get?.('content-type') ?? '';
    if (contentType.includes('text/html')) throw new Error('the resource guides were not found');
    const payload: unknown = await response.json();
    if (!isRegistry(payload)) throw new Error('the resource guides are in a format this build cannot read');
    return payload;
  })();

  const guarded = attempt.catch((error: unknown) => {
    cached = null;
    throw error;
  });
  cached = guarded;
  return guarded;
}
