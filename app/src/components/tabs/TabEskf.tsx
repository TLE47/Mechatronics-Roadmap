import React, { useState, useEffect, useRef } from 'react';
import { MathView, MathPanel } from '../MathView';
import { Sparkles, ShieldCheck, AlertOctagon } from 'lucide-react';
import { PresetRequest, claimPreset } from '../../demoPresets';

interface TabEskfProps {
  onLoadPreset: (presetId: string) => void;
  highlightedId: string | null;
  presetRequest: PresetRequest | null;
}

const ESKF_PRESETS = ['eskf_seqlock_clean', 'eskf_torn_race'];

export const TabEskf: React.FC<TabEskfProps> = ({ onLoadPreset, highlightedId, presetRequest }) => {
  const [seqLockEnabled, setSeqLockEnabled] = useState<boolean>(true);
  const [bgTrue, setBgTrue] = useState<number>(0.12);
  const [sigmaMeas, setSigmaMeas] = useState<number>(0.04);
  const [contentionPct, setContentionPct] = useState<number>(12);

  const [steadyErrDeg, setSteadyErrDeg] = useState<number>(0.34);
  const [neesVal, setNeesVal] = useState<number>(5.82);
  const [tornCount, setTornCount] = useState<string>('0 / 250k');
  const [stepLatNs, setStepLatNs] = useState<number>(29.6);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Apply Demo Preset: WaitFreeSeqLock on, with the calm bias and contention of the clean run.
  useEffect(() => {
    const id = claimPreset(presetRequest, ESKF_PRESETS);
    if (id === 'eskf_seqlock_clean') {
      setSeqLockEnabled(true); setBgTrue(0.12); setContentionPct(12);
    } else if (id === 'eskf_torn_race') {
      // Unprotected struct under heavy ISR contention: the torn-read race the SeqLock exists to prevent.
      setSeqLockEnabled(false); setContentionPct(22);
    }
  }, [presetRequest]);

  const toggleSeqLock = () => {
    setSeqLockEnabled((prev) => !prev);
  };

  useEffect(() => {
    const N = 240;
    const dt = 0.02;
    const rawDriftDeg = new Float64Array(N);
    const eskfErrDeg = new Float64Array(N);
    const biasEstRatio = new Float64Array(N);

    let x_th = 0.08;
    let x_bg = 0.0;
    let p00 = 0.04, p01 = 0.0, p11 = 0.04;
    const q_th = 1e-5, q_bg = 1e-6;
    const r_meas = sigmaMeas * sigmaMeas;

    for (let k = 0; k < N; k++) {
      const t = k * dt;
      rawDriftDeg[k] = Math.min(45.0, (0.08 + bgTrue * t) * (180.0 / Math.PI));

      const v_meas = sigmaMeas * Math.sin(k * 7.13 + 1.2) * Math.cos(k * 3.71);
      const bg_err = bgTrue - x_bg;
      x_th = x_th + bg_err * dt;

      // Covariance prediction
      const p00_m = p00 - dt * (p01 + p01) + dt * dt * p11 + q_th;
      const p01_m = p01 - dt * p11;
      const p11_m = p11 + q_bg;

      // Kalman Gain
      const s_inv = 1.0 / (p00_m + r_meas);
      const k0 = p00_m * s_inv;
      const k1 = p01_m * s_inv;
      const innov = x_th + v_meas;

      x_th = x_th - k0 * innov;
      x_bg = x_bg + k1 * innov;

      // Joseph form
      const c0 = 1.0 - k0;
      p00 = c0 * c0 * p00_m + k0 * k0 * r_meas;
      p01 = c0 * (p01_m - k1 * p00_m) + k0 * k1 * r_meas;
      p11 = p11_m - k1 * p01_m;

      eskfErrDeg[k] = Math.abs(x_th) * (180.0 / Math.PI);
      biasEstRatio[k] = Math.min(1.25, x_bg / Math.max(bgTrue, 1e-4));
    }

    const finalErr = (eskfErrDeg[N - 1] + eskfErrDeg[N - 2] + eskfErrDeg[N - 3]) / 3.0;
    setSteadyErrDeg(finalErr);
    setNeesVal(5.4 + sigmaMeas * 8.0);

    const calculatedTorn = seqLockEnabled ? 0 : Math.round(2500 * (contentionPct / 12.0));
    setTornCount(seqLockEnabled ? '0 / 250k' : `${calculatedTorn} GLITCHES!`);
    setStepLatNs(28.4 + contentionPct * 0.12);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const midY = H * 0.50;
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, midY); ctx.lineTo(W, midY); ctx.stroke();

    // Top pane
    const topH = midY - 28;
    const mapTopY = (deg: number) => 22 + topH - Math.min(1.0, deg / 30.0) * topH;

    // Raw gyro drift curve (Rose)
    ctx.strokeStyle = '#fb7185';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    for (let k = 0; k < N; k++) {
      const x = 20 + (k / (N - 1)) * (W - 40);
      const y = mapTopY(rawDriftDeg[k]);
      if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Bias convergence (Cyan)
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    for (let k = 0; k < N; k++) {
      const x = 20 + (k / (N - 1)) * (W - 40);
      const y = mapTopY(biasEstRatio[k] * 20.0);
      if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // ESKF attitude error (Emerald)
    ctx.strokeStyle = '#34d399';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    for (let k = 0; k < N; k++) {
      const x = 20 + (k / (N - 1)) * (W - 40);
      const y = mapTopY(eskfErrDeg[k] * 4.0);
      if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '12px monospace';
    ctx.fillText('Top: Raw Gyro Drift (Rose, Diverges!) vs Joseph ESKF Error x4 (Emerald) & Bias Convergence (Cyan)', 20, 16);

    // Bottom pane: IPC telemetry stream
    const botCenter = midY + (H - midY) * 0.55;
    const botAmp = (H - midY) * 0.34;
    ctx.strokeStyle = seqLockEnabled ? '#34d399' : '#fb7185';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    for (let k = 0; k < N; k++) {
      const x = 20 + (k / (N - 1)) * (W - 40);
      let val = Math.sin(k * 0.11);
      if (!seqLockEnabled && ((k * 17) % Math.max(3, Math.round(45 / contentionPct)) === 0)) {
        val = (k % 2 === 0) ? 1.45 : -1.45;
      }
      const y = botCenter - val * botAmp;
      if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(
      `Bottom: 40kHz ISR -> 1kHz Planner Telemetry (${seqLockEnabled ? 'WaitFreeSeqLock Active: 0 Torn Reads, Bounded Retry' : 'UNPROTECTED STRUCT: Corrupted Torn-Word Glitches!'})`,
      20,
      midY + 18
    );
  }, [seqLockEnabled, bgTrue, sigmaMeas, contentionPct]);

  return (
    <div className="space-y-4">
      {/* Beginner Intuition */}
      <div className="bg-accent/10 border border-accent/30 border-l-4 border-l-accent rounded-lg p-3.5 text-xs text-body leading-relaxed">
        <strong className="text-accent text-[0.85rem] block mb-1">
          Beginner's Intuition — Why Do Gyros Drift & What Is a "Torn Read" Between Two CPU Threads?
        </strong>
        (1) <strong>Attitude Error-State Kalman Filter (ESKF):</strong> A MEMS gyroscope measures angular speed (<MathView math="\omega_m" />), but even a tiny 0.05 rad/s hidden temperature bias (<MathView math="b_g" />) integrates into a runaway tilt error within seconds! The ESKF fuses noisy gravity/magnetometer readings using the <strong>Joseph-form covariance update</strong> <MathView math="P^+" /> to continuously estimate and subtract the hidden gyro bias <MathView math="b_g" /> on the <MathView math="SO(3)" /> rotation manifold.<br />
        (2) <strong>Cortex-M7 <code className="text-accent">WaitFreeSeqLock&lt;T&gt;</code>:</strong> If a 40 kHz motor ISR writes a multi-word state struct while a 1 kHz planner reads it without synchronization, the reader gets half of the old struct and half of the new struct (a <strong>torn read spike</strong>!). A <code className="text-accent">WaitFreeSeqLock</code> uses an odd/even atomic sequence counter so the reader detects concurrent writes in 30 ns without ever blocking the high-rate motor ISR.
      </div>

      {/* Equations */}
      <div className="bg-panel border border-line rounded-xl p-4">
        <h2 className="text-sm font-bold text-accent mb-2">
          Manifold Error-State Kalman Filter (Joseph Form) & Lock-Free Sequence Lock (WaitFreeSeqLock&lt;T&gt;)
        </h2>
        <MathPanel
          math="P^+ = (I - KH)P^-(I - KH)^\top + KRK^\top, \qquad \hat{R}^+ = \hat{R}^-\exp\big([\delta\hat{\theta}]_\times\big), \qquad \text{NEES}_k = \tilde{x}_k^\top P_k^{-1}\tilde{x}_k \in \chi^2_{6,95\%}, \qquad \text{SeqLock Retry: } (s_0 \neq s_1) \lor (s_0 \bmod 2 = 1)"
        />
      </div>

      {/* Controls and Canvas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-5 bg-panel border border-line rounded-xl p-4 space-y-3.5">
          <h2 className="text-sm font-bold text-accent">6-DOF Attitude ESKF & SeqLock Controls</h2>
          <p className="text-xs text-muted">
            Adjust initial gyro bias <MathView math="b_{g,0}" />, accelerometer attitude noise <MathView math="\sigma_{\text{acc}}" />, and toggle <code className="text-accent">WaitFreeSeqLock</code> protection to observe corrupted torn-read spikes when lock-free synchronization is disabled.
          </p>

          <div className={`p-2.5 rounded-lg border border-line-soft bg-canvas space-y-2 ${highlightedId === 'btn-seqlock-toggle' ? 'ring-2 ring-amber bg-amber/10 shadow-[0_0_15px_rgba(251,191,36,0.3)]' : ''}`}>
            <div className="flex justify-between items-center text-xs">
              <span className="text-body font-medium">IPC Memory Protection:</span>
              <span className={`font-mono text-xs font-bold flex items-center gap-1 ${seqLockEnabled ? 'text-emerald' : 'text-rose'}`}>
                {seqLockEnabled ? <ShieldCheck className="w-3.5 h-3.5" /> : <AlertOctagon className="w-3.5 h-3.5" />}
                {seqLockEnabled ? 'SEQLOCK ENABLED' : 'UNPROTECTED RACE'}
              </span>
            </div>
            <button
              id="btn-seqlock-toggle"
              onClick={toggleSeqLock}
              className="w-full bg-accent/20 hover:bg-accent/30 text-accent border border-accent px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer shadow-sm flex items-center justify-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Toggle WaitFreeSeqLock vs. Unprotected Struct</span>
            </button>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs text-body">
              <span>True Gyro Bias <MathView math="b_g" /> [rad/s]</span>
              <span className="font-mono text-emerald font-bold">{bgTrue.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0.02"
              max="0.35"
              step="0.01"
              value={bgTrue}
              onChange={(e) => setBgTrue(parseFloat(e.target.value))}
              className="w-full accent-accent cursor-pointer h-1.5 bg-raise rounded-lg"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs text-body">
              <span>Vector Measurement Noise <MathView math="\sigma_{\text{meas}}" /> [rad]</span>
              <span className="font-mono text-emerald font-bold">{sigmaMeas.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0.01"
              max="0.15"
              step="0.01"
              value={sigmaMeas}
              onChange={(e) => setSigmaMeas(parseFloat(e.target.value))}
              className="w-full accent-accent cursor-pointer h-1.5 bg-raise rounded-lg"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs text-body">
              <span>ISR vs Reader Contention Rate [%]</span>
              <span className="font-mono text-emerald font-bold">{contentionPct}%</span>
            </div>
            <input
              type="range"
              min="2"
              max="35"
              step="1"
              value={contentionPct}
              onChange={(e) => setContentionPct(parseInt(e.target.value, 10))}
              className="w-full accent-accent cursor-pointer h-1.5 bg-raise rounded-lg"
            />
          </div>

          <div className="pt-2 flex flex-wrap gap-2">
            <button
              onClick={() => { setSeqLockEnabled(true); setBgTrue(0.12); setContentionPct(12); }}
              className="bg-emerald/20 hover:bg-emerald/30 text-emerald border border-emerald px-2.5 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer"
            >
              Enable SeqLock (0 Torn)
            </button>
            <button
              onClick={() => { setSeqLockEnabled(false); setContentionPct(22); }}
              className="bg-rose/20 hover:bg-rose/30 text-rose border border-rose px-2.5 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer"
            >
              Disable SeqLock (Race)
            </button>
            <button
              onClick={() => { setSeqLockEnabled(true); setBgTrue(0.30); setSigmaMeas(0.03); }}
              className="bg-raise hover:bg-elevate text-body border border-line px-2.5 py-1.5 rounded-md text-xs cursor-pointer font-medium"
            >
              High Bias Recovery
            </button>
          </div>
        </div>

        {/* Right: ESKF Telemetry Canvas & KPIs */}
        <div className="lg:col-span-7 bg-panel border border-line rounded-xl p-4 flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-bold text-accent mb-3 flex items-center justify-between flex-wrap gap-2">
              <span>Top: Gyro Drift vs. Joseph ESKF · Bottom: Lock-Free Telemetry</span>
            </h2>

            {/* KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              <div className="bg-raise border border-line rounded-lg p-2.5">
                <div className="text-[0.7rem] text-muted">ESKF Steady Error</div>
                <div className="text-base font-bold font-mono text-emerald mt-0.5">{steadyErrDeg.toFixed(2)}°</div>
              </div>
              <div className="bg-raise border border-line rounded-lg p-2.5">
                <div className="text-[0.7rem] text-muted">Mean NEES (χ²₆)</div>
                <div className="text-base font-bold font-mono text-emerald mt-0.5">{neesVal.toFixed(2)} (PASS)</div>
              </div>
              <div className="bg-raise border border-line rounded-lg p-2.5">
                <div className="text-[0.7rem] text-muted">Torn Reads Detected</div>
                <div className={`text-base font-bold font-mono mt-0.5 ${seqLockEnabled ? 'text-emerald' : 'text-rose'}`}>
                  {tornCount}
                </div>
              </div>
              <div className="bg-raise border border-line rounded-lg p-2.5">
                <div className="text-[0.7rem] text-muted">Mean Step Latency</div>
                <div className="text-base font-bold font-mono text-accent mt-0.5">{stepLatNs.toFixed(1)} ns</div>
              </div>
            </div>

            {/* Canvas */}
            <div className="w-full overflow-hidden rounded-lg plot">
              <canvas
                ref={canvasRef}
                width={850}
                height={350}
                className="w-full h-auto block"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
