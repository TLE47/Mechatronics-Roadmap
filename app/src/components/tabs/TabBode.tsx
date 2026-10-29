import React, { useState, useEffect, useRef, useId } from 'react';
import { MathView, MathPanel } from '../MathView';
import { Sparkles } from 'lucide-react';
import { PresetRequest, claimPreset } from '../../demoPresets';
import { PlotExpander } from '../PlotExpander';

interface TabBodeProps {
  onLoadPreset: (presetId: string) => void;
  highlightedId: string | null;
  presetRequest: PresetRequest | null;
}

const J_M = 4.5e-5; // motor-side inertia [kg·m²]

// Resonance of the two-mass plant [Hz]: the notch centre that cancels its peak. Same formula as f_r below.
const resonanceHz = (ks: number, jl: number) => Math.sqrt(ks * (1 / J_M + 1 / (jl * 1e-4))) / (2 * Math.PI);

const BODE_PRESETS = ['wafer_scanner', 'cnc_ballscrew', 'surgical_cable'];

export const TabBode: React.FC<TabBodeProps> = ({ onLoadPreset, highlightedId, presetRequest }) => {
  const [ks, setKs] = useState<number>(120);
  const [jl, setJl] = useState<number>(1.8);
  const [bs, setBs] = useState<number>(0.002);
  const [fn, setFn] = useState<number>(291);
  const [qn, setQn] = useState<number>(5.0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Apply Demo Preset: set the plant and tune the notch onto its resonance, so the vibration peak is cancelled.
  useEffect(() => {
    const id = claimPreset(presetRequest, BODE_PRESETS);
    if (id === 'wafer_scanner') {
      setKs(340); setJl(0.8); setBs(0.001); setQn(6.5); setFn(Math.round(resonanceHz(340, 0.8)));
    } else if (id === 'cnc_ballscrew') {
      setKs(120); setJl(1.8); setBs(0.002); setQn(5.0); setFn(Math.round(resonanceHz(120, 1.8)));
    } else if (id === 'surgical_cable') {
      // Da Vinci-style low-stiffness cable drive: notch tuned to its (lower) resonance.
      setKs(45); setJl(2.6); setBs(0.0015); setQn(4.0); setFn(Math.round(resonanceHz(45, 2.6)));
    }
  }, [presetRequest]);

  const jlVal = jl * 1e-4;
  const w_ar = Math.sqrt(ks / jlVal);
  const w_r = Math.sqrt(ks * (1.0 / J_M + 1.0 / jlVal));
  const f_ar = w_ar / (2 * Math.PI);
  const f_r = w_r / (2 * Math.PI);

  const [peakDb, setPeakDb] = useState<number>(24.2);
  const [attDb, setAttDb] = useState<number>(-28.4);

  const snapNotch = () => {
    setFn(Math.round(f_r));
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Draw grid
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let i = 1; i < 6; i++) {
      const y = (H / 6) * i;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    for (let i = 1; i < 8; i++) {
      const x = (W / 8) * i;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }

    const N = 450;
    const fMin = 20, fMax = 600;
    const collocatedDB: number[] = [];
    const loadDB: number[] = [];
    const filteredDB: number[] = [];
    let maxPeak = -999;
    let notchAtt = 0;

    for (let i = 0; i < N; i++) {
      const f = fMin + (fMax - fMin) * (i / (N - 1));
      const w = 2 * Math.PI * f;
      const zl_re = 1e-4, zl_im = w * jlVal;
      const zs_re = bs, zs_im = -ks / w;
      const sum_re = zl_re + zs_re, sum_im = zl_im + zs_im;
      const denom_mag2 = sum_re * sum_re + sum_im * sum_im;
      const prod_re = zl_re * zs_re - zl_im * zs_im;
      const prod_im = zl_re * zs_im + zl_im * zs_re;
      const par_re = (prod_re * sum_re + prod_im * sum_im) / denom_mag2;
      const par_im = (prod_im * sum_re - prod_re * sum_im) / denom_mag2;

      const zeq_re = 1e-4 + par_re;
      const zeq_im = w * J_M + par_im;
      const mag_wm = 1.0 / Math.hypot(zeq_re, zeq_im);
      const ratio_mag = Math.hypot(zs_re, zs_im) / Math.sqrt(denom_mag2);
      const mag_wl = mag_wm * ratio_mag;

      const w0 = 2 * Math.PI * fn;
      const n_re = w0 * w0 - w * w;
      const n_im_den = (w0 * w) / qn;
      const mag_notch = Math.abs(n_re) / Math.hypot(n_re, n_im_den);

      const norm_scale = (J_M + jlVal) * (2 * Math.PI * 100);
      const db_m = 20 * Math.log10(mag_wm * norm_scale + 1e-12);
      const db_l = 20 * Math.log10(mag_wl * norm_scale + 1e-12);
      const db_f = 20 * Math.log10(mag_wm * mag_notch * norm_scale + 1e-12);

      if (db_m > maxPeak) maxPeak = db_m;
      if (Math.abs(f - f_r) < 1.0) notchAtt = db_f - db_m;

      collocatedDB.push(db_m);
      loadDB.push(db_l);
      filteredDB.push(db_f);
    }

    setPeakDb(maxPeak);
    setAttDb(notchAtt);

    const mapY = (db: number) => H * 0.52 - db * 5.0;
    const drawCurve = (arr: number[], color: string, width: number) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      for (let i = 0; i < N; i++) {
        const x = (i / (N - 1)) * (W - 40) + 20;
        const y = Math.max(10, Math.min(H - 10, mapY(arr[i])));
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };

    drawCurve(loadDB, '#fbbf24', 1.8);
    drawCurve(collocatedDB, '#38bdf8', 2.2);
    drawCurve(filteredDB, '#34d399', 2.8);

    // Axis labels
    ctx.fillStyle = '#64748b';
    ctx.font = '11px monospace';
    ctx.fillText('20 Hz', 20, H - 8);
    ctx.fillText('200 Hz', W * 0.33, H - 8);
    ctx.fillText('400 Hz', W * 0.66, H - 8);
    ctx.fillText('600 Hz', W - 45, H - 8);
    ctx.fillText('+30 dB', 4, 30);
    ctx.fillText('0 dB', 4, H * 0.52);
    ctx.fillText('-30 dB', 4, H - 25);
  }, [ks, jl, bs, fn, qn, jlVal, f_r]);

  return (
    <div className="space-y-4">
      {/* Beginner Intuition */}
      <div className="bg-accent/10 border border-accent/30 border-l-4 border-l-accent rounded-lg p-3.5 text-xs text-body leading-relaxed">
        <strong className="text-accent text-[0.85rem] block mb-1">
          Beginner's Intuition — Why Do Robot Joints Whistle and Vibrate?
        </strong>
        Imagine spinning a heavy bowling ball (<MathView math="J_L" />) connected to your hand (<MathView math="J_m" />) through a slightly stretchy rubber rod (<MathView math="k_s" />). At one specific frequency (<MathView math="f_r" />, the <strong>resonance peak</strong>), the rod twists violently and amplifies vibrations by +24 dB (16×!). A <strong>Digital Biquad Notch Filter</strong> <MathView math="H_{\text{notch}}(s)" /> acts like a surgical graphic-equalizer dip tuned to <MathView math="f_{\text{notch}} = f_r" />, canceling out that exact whistling frequency so your PID controller can run fast without shaking the machine apart.
      </div>

      {/* Equations */}
      <div className="bg-panel border border-line rounded-xl p-4">
        <h2 className="text-sm font-bold text-accent mb-2">
          Collocated vs. Non-Collocated Two-Mass Transfer Functions & Pre-Warped Tustin Notch
        </h2>
        <MathPanel
          math="\frac{\omega_m(s)}{\tau_m(s)} = \frac{1}{(J_m + J_L)s}\cdot\frac{s^2 + 2\zeta_{ar}\omega_{ar}s + \omega_{ar}^2}{s^2 + 2\zeta_r\omega_r s + \omega_r^2}, \qquad \omega_{ar} = \sqrt{\frac{k_s}{J_L}}, \qquad \omega_r = \omega_{ar}\sqrt{1 + \frac{J_L}{J_m}}, \qquad H_{\text{notch}}(s) = \frac{s^2 + \omega_n^2}{s^2 + \frac{\omega_n}{Q_n}s + \omega_n^2}"
        />
      </div>

      {/* Controls and Canvas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: Sliders & Presets */}
        <div className="order-2 lg:order-none lg:col-span-5 bg-panel border border-line rounded-xl p-4 space-y-3.5">
          <h2 className="text-sm font-bold text-accent flex justify-between items-center">
            <span>Plant & Digital Biquad Parameters</span>
          </h2>
          <p className="text-xs text-muted">
            Adjust torsional shaft stiffness <MathView math="k_s" />, load inertia <MathView math="J_L" />, notch frequency <MathView math="f_{\text{notch}}" />, and quality factor <MathView math="Q_n" />.
          </p>

          <div className="space-y-1">
            <div className="flex justify-between text-xs text-body">
              <span>Shaft Stiffness <MathView math="k_s" /> [N·m/rad]</span>
              <span className="font-mono text-emerald font-bold">{ks.toFixed(0)}</span>
            </div>
            <input
              type="range"
              aria-label="Shaft stiffness, newton-metres per radian"
              min="30"
              max="400"
              step="5"
              value={ks}
              onChange={(e) => setKs(parseFloat(e.target.value))}
              className="w-full accent-accent cursor-pointer h-1.5 bg-raise rounded-lg"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs text-body">
              <span>Load Inertia <MathView math="J_L" /> [×10⁻⁴ kg·m²]</span>
              <span className="font-mono text-emerald font-bold">{jl.toFixed(2)}</span>
            </div>
            <input
              type="range"
              aria-label="Load inertia, times ten to the minus four kilogram metres squared"
              min="0.5"
              max="5.0"
              step="0.1"
              value={jl}
              onChange={(e) => setJl(parseFloat(e.target.value))}
              className="w-full accent-accent cursor-pointer h-1.5 bg-raise rounded-lg"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs text-body">
              <span>Shaft Damping <MathView math="b_s" /> [N·m·s/rad]</span>
              <span className="font-mono text-emerald font-bold">{bs.toFixed(4)}</span>
            </div>
            <input
              type="range"
              aria-label="Shaft damping, newton-metre seconds per radian"
              min="0.0005"
              max="0.02"
              step="0.0005"
              value={bs}
              onChange={(e) => setBs(parseFloat(e.target.value))}
              className="w-full accent-accent cursor-pointer h-1.5 bg-raise rounded-lg"
            />
          </div>

          <div className={`space-y-1 p-2 rounded-lg transition-all ${highlightedId === 'sl-fn' ? 'ring-2 ring-amber bg-amber/10 shadow-[0_0_15px_rgba(251,191,36,0.3)]' : ''}`}>
            <div className="flex justify-between text-xs text-body">
              <span className="flex items-center gap-1 font-semibold text-amber">
                <Sparkles className="w-3 h-3" />
                Notch Center <MathView math="f_{\text{notch}}" /> [Hz]
              </span>
              <span className="font-mono text-emerald font-bold">{fn.toFixed(1)}</span>
            </div>
            <input
              id="sl-fn"
              type="range"
              aria-label="Notch centre frequency, hertz"
              min="100"
              max="550"
              step="1"
              value={fn}
              onChange={(e) => setFn(parseFloat(e.target.value))}
              className="w-full accent-accent cursor-pointer h-1.5 bg-raise rounded-lg"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs text-body">
              <span>Notch Quality Factor <MathView math="Q_n" /></span>
              <span className="font-mono text-emerald font-bold">{qn.toFixed(1)}</span>
            </div>
            <input
              type="range"
              aria-label="Notch quality factor"
              min="1.0"
              max="15.0"
              step="0.5"
              value={qn}
              onChange={(e) => setQn(parseFloat(e.target.value))}
              className="w-full accent-accent cursor-pointer h-1.5 bg-raise rounded-lg"
            />
          </div>

          <div className="pt-2 flex flex-wrap gap-2">
            <button
              onClick={snapNotch}
              className="bg-accent/20 hover:bg-accent/30 text-accent border border-accent px-3 py-1.5 rounded-md text-xs font-bold cursor-pointer transition-all shadow-sm"
            >
              Auto-Tune <MathView math="f_{\text{notch}} \leftarrow f_r" />
            </button>
            <button
              onClick={() => { setKs(340); setJl(0.8); setBs(0.001); setQn(6.5); setFn(422); }}
              className="bg-raise hover:bg-elevate text-ink border border-line px-2.5 py-1.5 rounded-md text-xs cursor-pointer font-medium"
            >
              ASML Wafer
            </button>
            <button
              onClick={() => { setKs(45); setJl(2.6); setBs(0.0015); setQn(4.0); setFn(142); }}
              className="bg-raise hover:bg-elevate text-ink border border-line px-2.5 py-1.5 rounded-md text-xs cursor-pointer font-medium"
            >
              Da Vinci Cable
            </button>
            <button
              onClick={() => { setKs(120); setJl(1.8); setBs(0.002); setQn(5.0); setFn(291); }}
              className="bg-raise hover:bg-elevate text-ink border border-line px-2.5 py-1.5 rounded-md text-xs cursor-pointer font-medium"
            >
              CNC Ballscrew
            </button>
          </div>
        </div>

        {/* Right: Bode Magnitude Plot & KPIs */}
        <div className="order-1 lg:order-none lg:col-span-7 bg-panel border border-line rounded-xl p-4 flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-bold text-accent mb-3 flex items-center justify-between flex-wrap gap-2">
              <span>Bode Magnitude Frequency Response</span>
              <div className="flex flex-wrap items-center gap-3 text-xs font-normal">
                <span className="flex items-center gap-1 text-accent"><span className="w-2.5 h-0.5 bg-accent"></span> Collocated <MathView math="\omega_m/\tau" /></span>
                <span className="flex items-center gap-1 text-amber"><span className="w-2.5 h-0.5 bg-amber"></span> Load <MathView math="\omega_L/\tau" /></span>
                <span className="flex items-center gap-1 text-emerald"><span className="w-2.5 h-0.5 bg-emerald"></span> Notch Filtered</span>
                <PlotExpander canvasRef={canvasRef} title="Bode magnitude response" slug="bode" />
              </div>
            </h2>

            {/* KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              <div className="bg-raise border border-line rounded-lg p-2.5">
                <div className="text-[0.7rem] text-muted">Anti-Resonance <MathView math="f_{ar}" /></div>
                <div className="text-base font-bold font-mono text-emerald mt-0.5">{f_ar.toFixed(1)} Hz</div>
              </div>
              <div className="bg-raise border border-line rounded-lg p-2.5">
                <div className="text-[0.7rem] text-muted">Resonance Peak <MathView math="f_r" /></div>
                <div className="text-base font-bold font-mono text-emerald mt-0.5">{f_r.toFixed(1)} Hz</div>
              </div>
              <div className="bg-raise border border-line rounded-lg p-2.5">
                <div className="text-[0.7rem] text-muted">Unfiltered Peak</div>
                <div className="text-base font-bold font-mono text-amber mt-0.5">{peakDb >= 0 ? '+' : ''}{peakDb.toFixed(1)} dB</div>
              </div>
              <div className="bg-raise border border-line rounded-lg p-2.5">
                <div className="text-[0.7rem] text-muted">Notch Gain @ <MathView math="f_r" /></div>
                <div className="text-base font-bold font-mono text-emerald mt-0.5">{attDb.toFixed(1)} dB</div>
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
