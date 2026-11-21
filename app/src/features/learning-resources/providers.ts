/**
 * The resource layer's explicit provider allowlist (`providers.ts`).
 *
 * A URL is never enough to earn a frame. The host must be named in
 * `app/src/data/learningResourceProviders.json`, the provider must be approved for the mechanism it
 * asks for, and the build-time embed report must still say the host permits it. Unknown hosts are
 * external-only. The policy also carries the per-provider sandbox, allow list and licence record, so
 * a renderer cannot quietly widen a permission for one site.
 */

import policy from '../../data/learningResourceProviders.json' with { type: 'json' };
import type { LicenseCondition, LicenseReuse, ResourceType } from './registry';

export type ProviderMechanism = 'iframe' | 'native' | 'external';

export interface ProviderLicense {
  id: string;
  url: string;
  reuse: LicenseReuse;
  /** The per-source obligations recorded with the verdict; see `registry.ts`. */
  conditions: LicenseCondition[];
}

export interface ProviderPolicy {
  key: string;
  publisher: string;
  hosts: string[];
  kind: ResourceType;
  mechanism: ProviderMechanism;
  approved: boolean;
  sandbox?: string;
  allow?: string;
  license: ProviderLicense | null;
  evidence?: string;
}

export const PROVIDER_POLICIES = policy.providers as unknown as ProviderPolicy[];

const BY_HOST = new Map<string, ProviderPolicy>();
for (const provider of PROVIDER_POLICIES) {
  for (const host of provider.hosts) BY_HOST.set(host.toLowerCase(), provider);
}

/** The approved policy for a hostname, or null. www is an alias, never a second provider. */
export function providerForHost(hostname: string): ProviderPolicy | null {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return BY_HOST.get(host) ?? BY_HOST.get(host.replace(/^www\./, '')) ?? BY_HOST.get(`www.${host}`) ?? null;
}

export function providerForKey(key: string): ProviderPolicy | null {
  return PROVIDER_POLICIES.find((provider) => provider.key === key) ?? null;
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/**
 * The policy for a resource URL. The host is the authority; a generated key may only add the native
 * player fallback (whose URL parser names the video), never an iframe approval for another host.
 * Otherwise a hand-edited record could pair an approved key with an arbitrary URL and earn a frame.
 */
export function providerForUrl(url: string, key?: string): ProviderPolicy | null {
  const byHost = providerForHost(hostOf(url));
  if (byHost) return byHost;
  if (!key) return null;
  const byKey = providerForKey(key);
  return byKey?.mechanism === 'native' ? byKey : null;
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{6,20}$/;

/**
 * The privacy-enhanced player endpoint for a YouTube watch, short or embed URL, or null when the
 * address is not a video this layer can name. Only the official player is ever framed; a watch page
 * is not an embed and is deliberately refused.
 */
export function youtubeEmbedUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  let id = '';
  if (host === 'youtu.be') {
    id = url.pathname.split('/').filter(Boolean)[0] ?? '';
  } else if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v') ?? '';
    else if (url.pathname.startsWith('/embed/')) id = url.pathname.slice('/embed/'.length).split('/')[0] ?? '';
    else if (url.pathname.startsWith('/shorts/')) id = url.pathname.slice('/shorts/'.length).split('/')[0] ?? '';
  }
  if (!YOUTUBE_ID.test(id)) return null;
  return `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1`;
}
