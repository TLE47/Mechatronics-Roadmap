import { TabId } from './types';

// A preset request is created by App for every "Apply Demo Preset" or architecture-step click.
// The nonce only ever grows, so each click is claimed exactly once.
export interface PresetRequest {
  presetId: string;
  nonce: number;
}

/**
 * The tab a preset actually opens. The roadmap shows this name beside its button instead of a
 * hand-typed "(Brushless Motor Control Lab)", and App uses the same function to switch tabs, so the label and the
 * destination cannot disagree.
 */
export function tabForPreset(presetId: string): TabId | null {
  if (presetId.startsWith('wafer') || presetId.startsWith('surgical') || presetId.startsWith('cnc')) {
    return 'tab-bode';
  }
  if (presetId.startsWith('foc_')) return 'tab-foc';
  if (presetId.startsWith('pend_')) return 'tab-pend';
  if (presetId.startsWith('robot_') || presetId.startsWith('sto_')) return 'tab-models';
  if (presetId.startsWith('pcb_') || presetId.startsWith('cad_')) return 'tab-cadpcb';
  if (presetId.startsWith('sysid_')) return 'tab-sysid';
  if (presetId.startsWith('eskf_')) return 'tab-eskf';
  return null;
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
