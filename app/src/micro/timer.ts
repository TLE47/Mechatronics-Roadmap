/**
 * The two clocks of a micro activity (`app/src/micro/timer.ts`).
 *
 * `visibleSeconds` is wall time while the activity is on screen. `adjustedSeconds` is the same time
 * with every inactivity gap capped at 90 seconds: a learner who is called away is not punished, but
 * a learner who reads for two minutes is credited for reading. Only the adjusted clock drives the
 * live target; only the visible clock feeds the >180 s design check.
 */

import { MICRO_INACTIVITY_CAP_MS } from './types.ts';

export const MICRO_OVER_TARGET_SECONDS = 120;
export const MICRO_VISIBLE_ALERT_SECONDS = 180;

export interface ClockSnapshot {
  startedAt: number;
  lastTickAt: number;
  visibleMs: number;
  adjustedMs: number;
  paused: boolean;
}

export interface ClockReading {
  visibleSeconds: number;
  adjustedSeconds: number;
  overTarget: boolean;
  visibleOverLimit: boolean;
}

export function clampGap(gapMs: number): number {
  if (!Number.isFinite(gapMs) || gapMs <= 0) return 0;
  return Math.min(gapMs, MICRO_INACTIVITY_CAP_MS);
}

export class ActivityClock {
  private startedAt: number;
  private lastTickAt: number;
  private visibleMs = 0;
  private adjustedMs = 0;
  private paused = false;

  constructor(now = Date.now(), snapshot?: ClockSnapshot | null) {
    if (snapshot) {
      this.startedAt = snapshot.startedAt;
      this.lastTickAt = snapshot.lastTickAt;
      this.visibleMs = Math.max(0, snapshot.visibleMs);
      this.adjustedMs = Math.max(0, snapshot.adjustedMs);
      this.paused = snapshot.paused;
    } else {
      this.startedAt = now;
      this.lastTickAt = now;
    }
  }

  tick(now = Date.now()): ClockReading {
    if (!this.paused) {
      const gap = Math.max(0, now - this.lastTickAt);
      this.visibleMs += gap;
      this.adjustedMs += clampGap(gap);
      this.lastTickAt = now;
    }
    return this.reading();
  }

  pause(now = Date.now()): ClockReading {
    this.tick(now);
    this.paused = true;
    return this.reading();
  }

  resume(now = Date.now()): ClockReading {
    this.paused = false;
    this.lastTickAt = now;
    return this.reading();
  }

  reading(): ClockReading {
    const visibleSeconds = Math.round(this.visibleMs / 1000);
    const adjustedSeconds = Math.round(this.adjustedMs / 1000);
    return {
      visibleSeconds,
      adjustedSeconds,
      overTarget: adjustedSeconds >= MICRO_OVER_TARGET_SECONDS,
      visibleOverLimit: visibleSeconds > MICRO_VISIBLE_ALERT_SECONDS,
    };
  }

  snapshot(): ClockSnapshot {
    return {
      startedAt: this.startedAt,
      lastTickAt: this.lastTickAt,
      visibleMs: this.visibleMs,
      adjustedMs: this.adjustedMs,
      paused: this.paused,
    };
  }
}

export function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

const SESSION_PREFIX = 'mechalab_micro_session_v1:';

export function readClockSnapshot(key: string): ClockSnapshot | null {
  try {
    const raw = typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(SESSION_PREFIX + key);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<ClockSnapshot>;
    if (
      !Number.isFinite(value.startedAt) ||
      !Number.isFinite(value.lastTickAt) ||
      !Number.isFinite(value.visibleMs) ||
      !Number.isFinite(value.adjustedMs)
    ) {
      return null;
    }
    return {
      startedAt: Number(value.startedAt),
      lastTickAt: Number(value.lastTickAt),
      visibleMs: Math.max(0, Number(value.visibleMs)),
      adjustedMs: Math.max(0, Number(value.adjustedMs)),
      paused: value.paused === true,
    };
  } catch {
    return null;
  }
}

export function writeClockSnapshot(key: string, snapshot: ClockSnapshot): void {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(SESSION_PREFIX + key, JSON.stringify(snapshot));
    }
  } catch {
    // A session snapshot is a convenience, not the evidence store.
  }
}

export function clearClockSnapshot(key: string): void {
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(SESSION_PREFIX + key);
  } catch {
    // ignore
  }
}
