import React, { useState, useEffect, useRef } from 'react';
import { MathView, MathPanel } from '../MathView';
import { Sparkles, Check, AlertTriangle } from 'lucide-react';
import { PresetRequest, claimPreset } from '../../demoPresets';

interface TabFOCProps {
  onLoadPreset: (presetId: string) => void;
  highlightedId: string | null;
  presetRequest: PresetRequest | null;
}

const FOC_PRESETS = ['foc_cobot_joint', 'foc_drone_prop', 'foc_qdd_jump'];

export const TabFOC: React.FC<TabFOCProps> = ({ onLoadPreset, highlightedId, presetRequest }) => {
  const [fbw, setFbw] = useState<number>(2500);
  const [iqRef, setIqRef] = useState<number>(8.0);
  const [rpm, setRpm] = useState<number>(2500);
  const [decouplingEnabled, setDecouplingEnabled] = useState<boolean>(true);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Apply Demo Preset: a cobot joint at low speed (decoupling on), or a 5500 RPM drone with decoupling off
  // so the rose i_d coupling error shows up.
  useEffect(() => {
    const id = claimPreset(presetRequest, FOC_PRESETS);
    if (id === 'foc_cobot_joint') {
      setFbw(2800); setIqRef(6.5); setRpm(1200); setDecouplingEnabled(true);
    } else if (id === 'foc_drone_prop') {
      setFbw(3200); setIqRef(14.0); setRpm(5500); setDecouplingEnabled(false);
    } else if (id === 'foc_qdd_jump') {
      // 24 A hopper jump at 2200 RPM, decoupling on: the high-current case, kept well-decoupled.
      setFbw(3500); setIqRef(24.0); setRpm(2200); setDecouplingEnabled(true);
    }
  }, [presetRequest]);

  const rs = 0.25;
  const ld = 0.12e-3;
  const lq = 0.12e-3;
  const lam = 0.008;
  const vBus = 48.0;
  const nPoles = 7;
  const wBw = 2 * Math.PI * fbw;
  const kp = ld * wBw;
  const ki = rs * wBw;

  const [riseTimeUs, setRiseTimeUs] = useState<number>(140);
  const [maxIdErr, setMaxIdErr] = useState<number>(0.02);

  const toggleDecoupling = () => {
    setDecouplingEnabled((prev) => !prev);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const dt = 40e-6; // 25 kHz
    const omegaE = nPoles * (rpm * 2 * Math.PI / 60.0);

    let id = 0, iq = 0, intD = 0, intQ = 0;
    const histId: number[] = [];
    const histIq: number[] = [];
    let riseStep: number | null = null;
    let peakId = 0;
    const steps = 60;

    for (let k = 0; k < steps; k++) {
      histId.push(id);
      histIq.push(iq);
      if (riseStep === null && iq >= 0.9 * iqRef) riseStep = k;
      peakId = Math.max(peakId, Math.abs(id));

      const ed = 0.0 - id;
      const eq = iqRef - iq;
      intD += ki * ed * dt;
      intQ += ki * eq * dt;

      const ffD = decouplingEnabled ? (-omegaE * lq * iq) : 0.0;
      const ffQ = decouplingEnabled ? (omegaE * (ld * id + lam)) : 0.0;

      let vd = kp * ed + intD + ffD;
      let vq = kp * eq + intQ + ffQ;
      const vMax = vBus / Math.sqrt(3);
      vd = Math.max(-vMax, Math.min(vMax, vd));
      const vqLim = Math.sqrt(Math.max(0, vMax * vMax - vd * vd));
      vq = Math.max(-vqLim, Math.min(vqLim, vq));

      for (let s = 0; s < 4; s++) {
        const sub = dt * 0.25;
        const did = (vd - rs * id + omegaE * lq * iq) / ld;
        const diq = (vq - rs * iq - omegaE * (ld * id + lam)) / lq;
        id += did * sub;
        iq += diq * sub;
      }
    }

    setRiseTimeUs((riseStep ?? steps) * 40);
    setMaxIdErr(peakId);

    const midH = H * 0.52;
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, midH); ctx.lineTo(W, midH); ctx.stroke();

    // Top Pane: iq(t) & id(t)
    const mapTopY = (val: number) => (midH - 25) - (val / Math.max(10, iqRef * 1.25)) * (midH - 50);

    // iq curve (Emerald)
    ctx.strokeStyle = '#34d399';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    for (let i = 0; i < steps; i++) {
      const x = 20 + (i / (steps - 1)) * (W - 40);
      const y = mapTopY(histIq[i]);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // id curve (Rose)
    ctx.strokeStyle = '#fb7185';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    for (let i = 0; i < steps; i++) {
      const x = 20 + (i / (steps - 1)) * (W - 40);
      const y = mapTopY(histId[i]);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Zero line and reference line
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    const refY = mapTopY(iqRef);
    ctx.moveTo(20, refY); ctx.lineTo(W - 20, refY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '12px monospace';
    ctx.fillText(`Top: Step i_q(t) (Emerald, Target = ${iqRef.toFixed(1)} A) vs Cross-Coupled i_d(t) Error (Rose, Decoupling: ${decouplingEnabled ? 'ON' : 'OFF!'})`, 20, 20);

    // Bottom Pane: SVPWM Duty cycles
    const svN = 180;
    const colors = ['#38bdf8', '#fbbf24', '#c084fc'];
    const phaseNames = ['Phase A', 'Phase B', 'Phase C'];

    for (let ph = 0; ph < 3; ph++) {
      ctx.strokeStyle = colors[ph];
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      for (let i = 0; i < svN; i++) {
        const th = (i / (svN - 1)) * 2 * Math.PI;
        const va = Math.cos(th);
        const vb = Math.cos(th - 2 * Math.PI / 3);
        const vc = Math.cos(th + 2 * Math.PI / 3);
        const vOff = -0.5 * (Math.max(va, vb, vc) + Math.min(va, vb, vc));
        const duties = [
          0.5 + (va + vOff) / Math.sqrt(3),
          0.5 + (vb + vOff) / Math.sqrt(3),
          0.5 + (vc + vOff) / Math.sqrt(3),
        ];
        const x = 20 + (i / (svN - 1)) * (W - 40);
        const y = H - 20 - duties[ph] * (H - midH - 45);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    ctx.fillStyle = '#cbd5e1';
    ctx.fillText('Bottom: 25 kHz Space Vector PWM (SVPWM) Saddle-Wave Phase Duties (da=Cyan, db=Amber, dc=Purple)', 20, midH + 20);
  }, [fbw, iqRef, rpm, decouplingEnabled, ki, kp]);

  return (
    <div className="space-y-4">
      {/* Beginner Intuition */}
      <div className="bg-accent/10 border border-accent/30 border-l-4 border-l-accent rounded-lg p-3.5 text-xs text-body leading-relaxed">
        <strong className="text-accent text-[0.85rem] block mb-1">
          Beginner's Intuition — What Is Field-Oriented Control (FOC)?
        </strong>
        A 3-phase brushless motor has three stationary coils (<MathView math="A, B, C" />) pushing a spinning permanent magnet. If you just apply fixed voltages, the magnetic push angle changes as the rotor spins. <strong>Clarke & Park transforms</strong> rotate our mathematical camera alongside the rotor so the 3 AC sine waves become two simple DC numbers: <MathView math="i_d" /> (pulls uselessly straight into the magnet like pulling on a wrench handle—keep <MathView math="i_d = 0" />!) and <MathView math="i_q" /> (pushes 90° sideways on the wrench for 100% pure torque).
      </div>

      {/* Equations */}
      <div className="bg-panel border border-line rounded-xl p-4">
        <h2 className="text-sm font-bold text-accent mb-2">
          Synchronous d-q Frame PMSM Equations & Pole-Zero Cancellation PI Law
        </h2>
        <MathPanel
          math="v_d = R_s i_d + L_d\frac{di_d}{dt} - \omega_e L_q i_q, \qquad v_q = R_s i_q + L_q\frac{di_q}{dt} + \omega_e(L_d i_d + \lambda_{pm}), \qquad K_{p,q} = L_q\omega_{bw}, \quad K_{i,q} = R_s\omega_{bw}, \qquad \sqrt{v_d^{*2}+v_q^{*2}} \le \frac{V_{\text{bus}}}{\sqrt{3}}"
        />
      </div>

      {/* Controls and Canvas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-5 bg-panel border border-line rounded-xl p-4 space-y-3.5">
          <h2 className="text-sm font-bold text-accent">25 kHz FOC Loop & SVPWM Controls</h2>
          <p className="text-xs text-muted">
            Toggle <MathView math="\omega_e L_{d,q}" /> cross-coupling decoupling to observe how rotor speed injects false d-axis flux current when feedforward decoupling is omitted.
          </p>

          <div className="space-y-1">
            <div className="flex justify-between text-xs text-body">
              <span>Current Loop Bandwidth <MathView math="f_{bw}" /> [Hz]</span>
              <span className="font-mono text-emerald font-bold">{fbw}</span>
            </div>
            <input
              type="range"
              min="500"
              max="4000"
              step="100"
              value={fbw}
              onChange={(e) => setFbw(parseFloat(e.target.value))}
              className="w-full accent-accent cursor-pointer h-1.5 bg-raise rounded-lg"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs text-body">
              <span>Step q-Axis Command <MathView math="i_q^*" /> [A]</span>
              <span className="font-mono text-emerald font-bold">{iqRef.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min="1.0"
              max="25.0"
              step="0.5"
              value={iqRef}
              onChange={(e) => setIqRef(parseFloat(e.target.value))}
              className="w-full accent-accent cursor-pointer h-1.5 bg-raise rounded-lg"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs text-body">
              <span>Mechanical Speed <MathView math="\omega_m" /> [RPM]</span>
              <span className="font-mono text-emerald font-bold">{rpm}</span>
            </div>
            <input
              type="range"
              min="0"
              max="6000"
              step="100"
              value={rpm}
              onChange={(e) => setRpm(parseFloat(e.target.value))}
              className="w-full accent-accent cursor-pointer h-1.5 bg-raise rounded-lg"
            />
          </div>

          <div className={`p-2.5 rounded-lg border border-line-soft bg-canvas space-y-2 ${highlightedId === 'btn-dec-toggle' ? 'ring-2 ring-amber bg-amber/10 shadow-[0_0_15px_rgba(251,191,36,0.3)]' : ''}`}>
            <div className="flex justify-between items-center text-xs">
              <span className="text-body font-medium">Decoupling (<MathView math="\pm \omega_e L i_{d,q}" />):</span>
              <span className={`font-mono text-xs font-bold flex items-center gap-1 ${decouplingEnabled ? 'text-emerald' : 'text-rose'}`}>
                {decouplingEnabled ? <Check className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                {decouplingEnabled ? 'ENABLED' : 'DISABLED (COUPLED)'}
              </span>
            </div>
            <button
              id="btn-dec-toggle"
              onClick={toggleDecoupling}
              className="w-full bg-accent/20 hover:bg-accent/30 text-accent border border-accent px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer shadow-sm flex items-center justify-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Toggle Decoupling Feedforward</span>
            </button>
          </div>

          <div className="pt-2 flex flex-wrap gap-2">
            <button
              onClick={() => { setFbw(2800); setIqRef(6.5); setRpm(1200); setDecouplingEnabled(true); }}
              className="bg-raise hover:bg-elevate text-ink border border-line px-2.5 py-1.5 rounded-md text-xs cursor-pointer font-medium"
            >
              Surgical Cobot (1200 RPM)
            </button>
            <button
              onClick={() => { setFbw(3200); setIqRef(14.0); setRpm(5500); setDecouplingEnabled(false); }}
              className="bg-raise hover:bg-elevate text-ink border border-line px-2.5 py-1.5 rounded-md text-xs cursor-pointer font-medium"
            >
              5500 RPM Drone
            </button>
            <button
              onClick={() => { setFbw(3500); setIqRef(24.0); setRpm(2200); setDecouplingEnabled(true); }}
              className="bg-raise hover:bg-elevate text-ink border border-line px-2.5 py-1.5 rounded-md text-xs cursor-pointer font-medium"
            >
              24A Hopper Jump
            </button>
          </div>
        </div>

        {/* Right: Plots & KPIs */}
        <div className="lg:col-span-7 bg-panel border border-line rounded-xl p-4 flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-bold text-accent mb-3 flex items-center justify-between flex-wrap gap-2">
              <span>Top: i_q / i_d Current Dynamics · Bottom: 3-Phase SVPWM Waveforms</span>
            </h2>

            {/* KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              <div className="bg-raise border border-line rounded-lg p-2.5">
                <div className="text-[0.7rem] text-muted">0–90% Rise Time</div>
                <div className="text-base font-bold font-mono text-emerald mt-0.5">{riseTimeUs} μs</div>
              </div>
              <div className="bg-raise border border-line rounded-lg p-2.5">
                <div className="text-[0.7rem] text-muted">Peak |i_d| Error</div>
                <div className={`text-base font-bold font-mono mt-0.5 ${maxIdErr < 0.2 ? 'text-emerald' : 'text-rose'}`}>
                  {maxIdErr.toFixed(2)} A
                </div>
              </div>
              <div className="bg-raise border border-line rounded-lg p-2.5">
                <div className="text-[0.7rem] text-muted">Kp / Ki Gains</div>
                <div className="text-base font-bold font-mono text-accent mt-0.5">{kp.toFixed(2)} / {ki.toFixed(0)}</div>
              </div>
              <div className="bg-raise border border-line rounded-lg p-2.5">
                <div className="text-[0.7rem] text-muted">SVPWM Boost</div>
                <div className="text-base font-bold font-mono text-emerald mt-0.5">+15.47%</div>
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
