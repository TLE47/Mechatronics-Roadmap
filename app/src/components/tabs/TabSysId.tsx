import React, { useState, useEffect, useRef } from 'react';
import { MathView, MathPanel } from '../MathView';
import { Sparkles } from 'lucide-react';
import { PresetRequest, claimPreset } from '../../demoPresets';
import { PlotExpander } from '../PlotExpander';

interface TabSysIdProps {
  onLoadPreset: (presetId: string) => void;
  highlightedId: string | null;
  presetRequest: PresetRequest | null;
}

const SYSID_PRESETS = ['sysid_schroeder_clean', 'sysid_zero_clip'];

export const TabSysId: React.FC<TabSysIdProps> = ({ onLoadPreset, highlightedId, presetRequest }) => {
  const [useSchroeder, setUseSchroeder] = useState<boolean>(true);
  const [harmonicM, setHarmonicM] = useState<number>(32);
  const [noiseSigma, setNoiseSigma] = useState<number>(0.05);
  const [nPeriods, setNPeriods] = useState<number>(8);

  const [activeCF, setActiveCF] = useState<number>(1.66);
  const [zeroCF, setZeroCF] = useState<number>(8.00);
  const [rmsErrDb, setRmsErrDb] = useState<number>(0.38);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Apply Demo Preset: Schroeder phasing with 32 harmonics: CF 1.71 vs. 8.00 for zero-phase (48 harmonics gives 1.74).
  useEffect(() => {
    const id = claimPreset(presetRequest, SYSID_PRESETS);
    if (id === 'sysid_schroeder_clean') {
      setUseSchroeder(true); setHarmonicM(32); setNoiseSigma(0.04); setNPeriods(12);
    } else if (id === 'sysid_zero_clip') {
      // Zero-phase cosines: the t = 0 spike that clips the actuator (CF 8.00 at 32 harmonics).
      setUseSchroeder(false); setHarmonicM(32); setNoiseSigma(0.04); setNPeriods(8);
    }
  }, [presetRequest]);

  const togglePhaseMode = () => {
    setUseSchroeder((prev) => !prev);
  };

  useEffect(() => {
    const N = 512;
    const sigSchroeder = new Float64Array(N);
    const sigZero = new Float64Array(N);
    const amp = Math.sqrt(2.0 / harmonicM);

    for (let k = 1; k <= harmonicM; k++) {
      const phiSch = -Math.PI * k * (k - 1) / harmonicM;
      for (let n = 0; n < N; n++) {
        const theta = (2.0 * Math.PI * k * n) / N;
        sigSchroeder[n] += amp * Math.cos(theta + phiSch);
        sigZero[n] += amp * Math.cos(theta);
      }
    }

    const computeCF = (arr: Float64Array) => {
      let pk = 0, sumSq = 0;
      for (let i = 0; i < arr.length; i++) {
        const v = Math.abs(arr[i]);
        if (v > pk) pk = v;
        sumSq += v * v;
      }
      return pk / Math.sqrt(sumSq / arr.length);
    };

    const cfSch = computeCF(sigSchroeder);
    const cfZeroVal = computeCF(sigZero);
    const curCF = useSchroeder ? cfSch : cfZeroVal;
    const activeWave = useSchroeder ? sigSchroeder : sigZero;

    setActiveCF(curCF);
    setZeroCF(cfZeroVal);

    // True velocity + resonance actuator plant P(s) across f in [2 Hz, 180 Hz]
    const evalTruePlantDB = (fHz: number) => {
      const mag1 = 28.0 / Math.hypot(1.0, fHz / 22.0);
      const r = fHz / 95.0;
      const magRes = 1.0 / Math.hypot(1.0 - r * r, 2.0 * 0.08 * r);
      return 20.0 * Math.log10(mag1 * magRes);
    };

    let errSqSum = 0.0;
    const idPts: { fHz: number; trueDB: number; estDB: number }[] = [];
    for (let k = 1; k <= harmonicM; k++) {
      const fHz = 2.5 * k;
      const trueDB = evalTruePlantDB(fHz);
      const clipBias = useSchroeder ? 0.0 : 2.6 * Math.sin(k * 0.7);
      const noiseDB = (noiseSigma * 14.0 / Math.sqrt(nPeriods)) * Math.sin(k * 12.9898 + 4.1414);
      const estDB = trueDB + clipBias + noiseDB;
      const diff = estDB - trueDB;
      errSqSum += diff * diff;
      idPts.push({ fHz, trueDB, estDB });
    }
    const computedRms = Math.sqrt(errSqSum / harmonicM);
    setRmsErrDb(computedRms);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const midY = H * 0.44;
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, midY); ctx.lineTo(W, midY); ctx.stroke();

    // Top pane: Excitation waveform d_exc(t)
    const topCenter = midY * 0.52;
    const yScale = (midY * 0.40) / Math.max(3.2, curCF * 0.65);
    ctx.strokeStyle = useSchroeder ? '#34d399' : '#fb7185';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (let n = 0; n < N; n++) {
      const x = (n / (N - 1)) * (W - 40) + 20;
      const y = topCenter - activeWave[n] * yScale;
      if (n === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '12px monospace';
    ctx.fillText(
      `Excitation Waveform d_exc(t) — Crest Factor CF = ${curCF.toFixed(2)} (${useSchroeder ? 'Uniform Energy, Zero Saturation' : 'Impulse Spike @ t=0 -> Clipping!'})`,
      20,
      18
    );

    // Bottom pane: True Bode magnitude |P(jw)| vs Identified spectral estimates
    const botTop = midY + 24, botH = H - botTop - 22;
    const fMax = Math.max(170.0, 2.5 * harmonicM + 10.0);
    const mapF = (f: number) => 20 + ((f - 2.0) / (fMax - 2.0)) * (W - 40);
    const mapDB = (db: number) => botTop + botH - ((db + 15.0) / 60.0) * botH;

    // True plant cyan curve
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    for (let i = 0; i <= 300; i++) {
      const f = 2.0 + (fMax - 2.0) * (i / 300);
      const x = mapF(f), y = mapDB(evalTruePlantDB(f));
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Identified harmonic dots
    idPts.forEach((pt) => {
      const x = mapF(pt.fHz), y = mapDB(pt.estDB);
      ctx.fillStyle = useSchroeder ? '#34d399' : '#fbbf24';
      ctx.beginPath(); ctx.arc(x, y, 3.8, 0, 2 * Math.PI); ctx.fill();
    });

    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(
      `Closed-Loop Spectral Estimate P_hat = S_{yd}/S_{ud} (Dots) vs True Plant |P(jw)| (Cyan) — RMS Error = ${computedRms.toFixed(2)} dB`,
      20,
      midY + 18
    );
  }, [useSchroeder, harmonicM, noiseSigma, nPeriods]);

  return (
    <div className="space-y-4">
      {/* Beginner Intuition */}
      <div className="bg-accent/10 border border-accent/30 border-l-4 border-l-accent rounded-lg p-3.5 text-xs text-body leading-relaxed">
        <strong className="text-accent text-[0.85rem] block mb-1">
          Beginner's Intuition — Why Do Naive Sines Blow Up Actuators, and How Does Schroeder Phasing Fix It?
        </strong>
        To measure a robot's true transfer function <MathView math="P(j\omega)" /> quickly, we inject <MathView math="M" /> sine waves at once (a <strong>multisine</strong>). If all <MathView math="M" /> sine waves start with phase <MathView math="\phi_k = 0" />, they add up into a violent spike at <MathView math="t = 0" /> (high <strong>Crest Factor</strong> <MathView math="\text{CF} = \|d\|_\infty / d_{\text{rms}} > 4.0" />) that saturates your amplifier or trips over-current protection! <strong>Manfred Schroeder's quadratic phase formula</strong> <MathView math="\phi_k = -\frac{\pi k(k-1)}{M}" /> staggers the starting phase of each harmonic like an arpeggio chord on a piano—spreading the exact same frequency energy evenly over time (<MathView math="\text{CF} \approx 1.65" />) so we can identify the plant safely inside a closed feedback loop.
      </div>

      {/* Equations */}
      <div className="bg-panel border border-line rounded-xl p-4">
        <h2 className="text-sm font-bold text-accent mb-2">
          Schroeder Quadratic Phase Law, Crest Factor & Unbiased Closed-Loop Spectral Estimator
        </h2>
        <MathPanel
          math="d_{\text{exc}}(t) = \sum_{k=1}^{M} A_k \cos(2\pi f_k t + \phi_k), \qquad \phi_k^{\text{Schroeder}} = -\frac{\pi k(k-1)}{M}, \qquad \text{CF} = \frac{\|d_{\text{exc}}\|_\infty}{d_{\text{exc,rms}}}, \qquad \hat{P}(j\omega_k) = \frac{\hat{S}_{y d_{\text{exc}}}(j\omega_k)}{\hat{S}_{u d_{\text{exc}}}(j\omega_k)}"
        />
      </div>

      {/* Controls and Canvas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="order-2 lg:order-none lg:col-span-5 bg-panel border border-line rounded-xl p-4 space-y-3.5">
          <h2 className="text-sm font-bold text-accent">Schroeder Multisine & SysID Controls</h2>
          <p className="text-xs text-muted">
            Toggle between Schroeder quadratic phasing and naive zero-phase cosines (<MathView math="\phi_k = 0" />), adjust harmonic count <MathView math="M" /> and sensor noise <MathView math="\sigma_v" />, and observe the crest factor and identification accuracy.
          </p>

          <div className={`p-2.5 rounded-lg border border-line-soft bg-canvas space-y-2 ${highlightedId === 'btn-sysmode-toggle' ? 'ring-2 ring-amber bg-amber/10 shadow-[0_0_15px_rgba(251,191,36,0.3)]' : ''}`}>
            <div className="flex justify-between items-center text-xs">
              <span className="text-body font-medium">Phase Schedule Mode:</span>
              <span className={`font-mono text-xs font-bold ${useSchroeder ? 'text-emerald' : 'text-rose'}`}>
                {useSchroeder ? 'SCHROEDER' : 'ZERO-PHASE (SPIKE!)'}
              </span>
            </div>
            <button
              id="btn-sysmode-toggle"
              onClick={togglePhaseMode}
              className="w-full bg-accent/20 hover:bg-accent/30 text-accent border border-accent px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer shadow-sm flex items-center justify-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Toggle Schroeder vs. Zero-Phase (φₖ=0)</span>
            </button>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs text-body">
              <span>Excited Harmonics <MathView math="M" /></span>
              <span className="font-mono text-emerald font-bold">{harmonicM}</span>
            </div>
            <input
              type="range"
              aria-label="Excited harmonics"
              min="8"
              max="64"
              step="4"
              value={harmonicM}
              onChange={(e) => setHarmonicM(parseInt(e.target.value, 10))}
              className="w-full accent-accent cursor-pointer h-1.5 bg-raise rounded-lg"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs text-body">
              <span>Measurement Noise Level <MathView math="\sigma_v" /></span>
              <span className="font-mono text-emerald font-bold">{noiseSigma.toFixed(2)}</span>
            </div>
            <input
              type="range"
              aria-label="Measurement noise level"
              min="0.00"
              max="0.35"
              step="0.01"
              value={noiseSigma}
              onChange={(e) => setNoiseSigma(parseFloat(e.target.value))}
              className="w-full accent-accent cursor-pointer h-1.5 bg-raise rounded-lg"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs text-body">
              <span>Averaged Periods <MathView math="P_{\text{avg}}" /></span>
              <span className="font-mono text-emerald font-bold">{nPeriods}</span>
            </div>
            <input
              type="range"
              aria-label="Averaged periods"
              min="1"
              max="24"
              step="1"
              value={nPeriods}
              onChange={(e) => setNPeriods(parseInt(e.target.value, 10))}
              className="w-full accent-accent cursor-pointer h-1.5 bg-raise rounded-lg"
            />
          </div>

          <div className="pt-2 flex flex-wrap gap-2">
            <button
              onClick={() => { setUseSchroeder(true); setHarmonicM(48); setNoiseSigma(0.04); setNPeriods(12); }}
              className="bg-accent/20 hover:bg-accent/30 text-accent border border-accent px-2.5 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer"
            >
              48-Tone Schroeder
            </button>
            <button
              onClick={() => { setUseSchroeder(false); setHarmonicM(48); setNoiseSigma(0.04); setNPeriods(8); }}
              className="bg-rose/20 hover:bg-rose/30 text-rose border border-rose px-2.5 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer"
            >
              Zero-Phase Clipping
            </button>
            <button
              onClick={() => { setUseSchroeder(true); setHarmonicM(32); setNoiseSigma(0.25); setNPeriods(20); }}
              className="bg-raise hover:bg-elevate text-body border border-line px-2.5 py-1.5 rounded-md text-xs cursor-pointer font-medium"
            >
              Noisy 20-Period Avg
            </button>
          </div>
        </div>

        {/* Right: Waveform Canvas & KPIs */}
        <div className="order-1 lg:order-none lg:col-span-7 bg-panel border border-line rounded-xl p-4 flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-bold text-accent mb-3 flex items-center justify-between flex-wrap gap-2">
              <span>Top: Time-Domain Excitation · Bottom: True vs. Identified Plant Bode</span>
              <PlotExpander canvasRef={canvasRef} title="Excitation and identified plant" slug="sysid" />
            </h2>

            {/* KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              <div className="bg-raise border border-line rounded-lg p-2.5">
                <div className="text-[0.7rem] text-muted">Active Phasing</div>
                <div className={`text-base font-bold font-mono mt-0.5 ${useSchroeder ? 'text-emerald' : 'text-rose'}`}>
                  {useSchroeder ? 'SCHROEDER' : 'ZERO-PHASE'}
                </div>
              </div>
              <div className="bg-raise border border-line rounded-lg p-2.5">
                <div className="text-[0.7rem] text-muted">Crest Factor (CF)</div>
                <div className={`text-base font-bold font-mono mt-0.5 ${activeCF < 2.2 ? 'text-emerald' : 'text-rose'}`}>
                  {activeCF.toFixed(2)}
                </div>
              </div>
              <div className="bg-raise border border-line rounded-lg p-2.5">
                <div className="text-[0.7rem] text-muted">Zero-Phase CF</div>
                <div className="text-base font-bold font-mono text-rose mt-0.5">{zeroCF.toFixed(2)}</div>
              </div>
              <div className="bg-raise border border-line rounded-lg p-2.5">
                <div className="text-[0.7rem] text-muted">SysID RMS Error</div>
                <div className={`text-base font-bold font-mono mt-0.5 ${rmsErrDb < 1.0 ? 'text-emerald' : 'text-amber'}`}>
                  {rmsErrDb.toFixed(2)} dB
                </div>
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
