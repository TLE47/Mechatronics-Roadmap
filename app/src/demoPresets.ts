// A preset request is created by App for every "Apply Demo Preset" or architecture-step click.
// The nonce only ever grows, so each click is claimed exactly once.
export interface PresetRequest {
  presetId: string;
  nonce: number;
}

// Highest nonce any simulator has already applied. Module scope on purpose: a tab that unmounts
// on a tab switch and mounts again must not replay a click it already handled.
let lastClaimedNonce = 0;

/**
 * Returns the request's presetId if this simulator handles it and it has not been claimed yet,
 * otherwise null. Only the simulator that lists the id in `handled` consumes the request.
 */
export function claimPreset(req: PresetRequest | null, handled: readonly string[]): string | null {
  if (!req || req.nonce <= lastClaimedNonce || !handled.includes(req.presetId)) return null;
  lastClaimedNonce = req.nonce;
  return req.presetId;
}
