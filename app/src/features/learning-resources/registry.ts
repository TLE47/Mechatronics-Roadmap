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
export type ResourceType = 'article' | 'video' | 'documentation' | 'interactive' | 'simulator' | 'local';
export type EmbedStatus = 'embeddable' | 'blocked' | 'unknown';
export type EmbedMethod = 'corp' | 'credentialless' | null;
export type PresentationChoice = 'auto' | 'external';
export type LicenseReuse = 'allowed' | 'unknown' | 'no';

/** The obligations a Reader Mode snapshot must carry; `reuse` is only the permission verdict. */
export const LICENSE_CONDITIONS = [
  'notice',
  'attribution',
  'share-alike',
  'non-commercial',
  'indicate-changes',
  'no-trademark',
  'per-asset-check',
  'permission-required',
  'code-only',
  'no-download',
] as const;

export type LicenseCondition = (typeof LICENSE_CONDITIONS)[number];

export interface ResourceGuide {
  /** The `What to read` / `What to complete` text, with the link-check annotation removed. */
  read: string;
  skip: string;
  takeaway: string;
}

export interface ResourceEmbed {
  status: EmbedStatus;
  method: EmbedMethod;
  /** The header or network fact the verdict came from, shown in the diagnostics card. */
  evidence: string;
  /** ISO timestamp of the build-time probe; '' when the host was never probed. */
  checkedAt: string;
}

export interface ResourceLicense {
  id: string;
  url: string;
  reuse: LicenseReuse;
  /** Notice, attribution, share-alike, non-commercial and the other per-source obligations. */
  conditions: LicenseCondition[];
}

/** A build-time, text-only snapshot attached only to a licence-cleared resource. */
export interface ResourceSnapshotRef {
  /** Path relative to the app's public directory. */
  path: string;
}

export type SnapshotBlock =
  | { kind: 'heading'; level: 1 | 2 | 3 | 4; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'code'; text: string }
  | { kind: 'quote'; text: string };

export interface ResourceSnapshot {
  version: 1;
  title: string;
  sourceTitle: string;
  sourceUrl: string;
  provider: string;
  providerKey: string;
  retrievedAt: string;
  license: ResourceLicense;
  attribution: { publisher: string; originalUrl: string };
  /** The visible attribution, licence and change notice. */
  notice: string;
  truncated: boolean;
  blocks: SnapshotBlock[];
}

export interface LessonResource {
  /** Stable per occurrence: lesson + role + normalized URL, with a suffix only for a true duplicate. */
  id: string;
  /** Stable across occurrences of the same URL, for a future "one resource, several uses" view. */
  resourceKey: string;
  role: ResourceRole;
  idea: { number: number | null; title: string };
  title: string;
  url: string;
  provider: string;
  /** The explicit provider allowlist key, or `unknown`/`mechalab`. */
  providerKey: string;
  /** Whether the address is external or a local course link. */
  kind: ResourceKind;
  /** What the provider is, for the card and the renderer choice. */
  resourceKind: ResourceType;
  attribution: { publisher: string; originalUrl: string };
  embed: ResourceEmbed;
  license: ResourceLicense | null;
  /** Present only when a validated snapshot exists for a licence-cleared resource. */
  snapshot?: ResourceSnapshotRef;
  /** An author override; `auto` lets the resolver choose. */
  presentation: PresentationChoice;
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
  /** Authored occurrences with a checked-in Reader Mode snapshot (not unique files). */
  snapshotCount: number;
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

/** Resolve a snapshot path against the deployed base, so GitHub Pages subpaths work too. */
export function learningResourceSnapshotUrl(path: string): string {
  const env = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env;
  return `${env?.BASE_URL ?? '/'}${path.replace(/^\/+/, '')}`;
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isResource(value: unknown): value is LessonResource {
  if (!record(value)) return false;
  const guide = value.guide;
  const embed = value.embed;
  const attribution = value.attribution;
  const license = value.license;
  return (
    typeof value.id === 'string' &&
    typeof value.resourceKey === 'string' &&
    (value.role === 'primary' || value.role === 'alternative') &&
    (value.kind === 'external' || value.kind === 'local') &&
    typeof value.title === 'string' &&
    typeof value.url === 'string' &&
    typeof value.provider === 'string' &&
    typeof value.providerKey === 'string' &&
    ['article', 'video', 'documentation', 'interactive', 'simulator', 'local'].includes(
      String(value.resourceKind)
    ) &&
    record(attribution) &&
    typeof attribution.publisher === 'string' &&
    typeof attribution.originalUrl === 'string' &&
    record(embed) &&
    (embed.status === 'embeddable' || embed.status === 'blocked' || embed.status === 'unknown') &&
    (embed.method === null || embed.method === 'corp' || embed.method === 'credentialless') &&
    typeof embed.evidence === 'string' &&
    typeof embed.checkedAt === 'string' &&
    (license === null ||
      (record(license) &&
        typeof license.id === 'string' &&
        typeof license.url === 'string' &&
        (license.reuse === 'allowed' || license.reuse === 'unknown' || license.reuse === 'no') &&
        Array.isArray(license.conditions) &&
        license.conditions.length > 0 &&
        license.conditions.every(
          (condition) =>
            typeof condition === 'string' &&
            (LICENSE_CONDITIONS as readonly string[]).includes(condition)
        ))) &&
    (value.snapshot === undefined ||
      (record(value.snapshot) &&
        typeof value.snapshot.path === 'string' &&
        value.snapshot.path.startsWith('learning-resource-snapshots/') &&
        !value.snapshot.path.includes('..'))) &&
    (value.presentation === 'auto' || value.presentation === 'external') &&
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
  if (value.version !== 2 || !record(value.lessons)) return false;
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
let cachedSnapshots = new Map<string, Promise<ResourceSnapshot>>();

/** Forget the fetched registry and snapshots. The suite's door; a visit never needs it. */
export function clearLearningResourceCache(): void {
  cached = null;
  cachedSnapshots = new Map();
}

function isSnapshotBlock(value: unknown): value is SnapshotBlock {
  if (!record(value)) return false;
  if (value.kind === 'heading') {
    return (
      (value.level === 1 || value.level === 2 || value.level === 3 || value.level === 4) &&
      typeof value.text === 'string'
    );
  }
  if (value.kind === 'paragraph' || value.kind === 'code' || value.kind === 'quote') {
    return typeof value.text === 'string';
  }
  return (
    value.kind === 'list' &&
    typeof value.ordered === 'boolean' &&
    Array.isArray(value.items) &&
    value.items.length > 0 &&
    value.items.every((item) => typeof item === 'string')
  );
}

/** Validate a fetched snapshot before it can reach the reader. */
export function isResourceSnapshot(value: unknown): value is ResourceSnapshot {
  if (!record(value)) return false;
  const license = value.license;
  const attribution = value.attribution;
  return (
    value.version === 1 &&
    typeof value.title === 'string' &&
    typeof value.sourceTitle === 'string' &&
    typeof value.sourceUrl === 'string' &&
    typeof value.provider === 'string' &&
    typeof value.providerKey === 'string' &&
    typeof value.retrievedAt === 'string' &&
    record(license) &&
    typeof license.id === 'string' &&
    typeof license.url === 'string' &&
    license.reuse === 'allowed' &&
    Array.isArray(license.conditions) &&
    license.conditions.length > 0 &&
    license.conditions.every(
      (condition) =>
        typeof condition === 'string' && (LICENSE_CONDITIONS as readonly string[]).includes(condition)
    ) &&
    record(attribution) &&
    typeof attribution.publisher === 'string' &&
    typeof attribution.originalUrl === 'string' &&
    typeof value.notice === 'string' &&
    typeof value.truncated === 'boolean' &&
    Array.isArray(value.blocks) &&
    value.blocks.length > 0 &&
    value.blocks.every(isSnapshotBlock)
  );
}

/**
 * Fetch one snapshot once. The reader asks for a path, not a provider; a failed fetch is forgotten
 * so the retry can try again. The response is validated here, before React sees it.
 */
export function loadResourceSnapshot(
  path: string,
  options: { fetch?: typeof fetch } = {}
): Promise<ResourceSnapshot> {
  const existing = cachedSnapshots.get(path);
  if (existing) return existing;
  const fetcher = options.fetch ?? (typeof fetch === 'function' ? fetch : null);
  if (!fetcher) return Promise.reject(new Error('this browser cannot fetch the reader snapshot'));

  const attempt = (async (): Promise<ResourceSnapshot> => {
    const response = await fetcher(learningResourceSnapshotUrl(path));
    if (!response.ok) throw new Error(`the reader snapshot answered ${response.status}`);
    const contentType = response.headers?.get?.('content-type') ?? '';
    if (contentType.includes('text/html')) throw new Error('the reader snapshot was not found');
    const payload: unknown = await response.json();
    if (!isResourceSnapshot(payload)) {
      throw new Error('the reader snapshot is in a format this build cannot read');
    }
    return payload;
  })();

  const guarded = attempt.catch((error: unknown) => {
    cachedSnapshots.delete(path);
    throw error;
  });
  cachedSnapshots.set(path, guarded);
  return guarded;
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
