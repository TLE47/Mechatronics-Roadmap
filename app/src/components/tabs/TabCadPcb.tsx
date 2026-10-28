import React, { useState, useEffect, useRef } from 'react';
import { MathView, MathPanel } from '../MathView';
import { Sparkles } from 'lucide-react';
import { BomItem } from '../../types';
import { PresetRequest, claimPreset } from '../../demoPresets';
import { PlotExpander } from '../PlotExpander';

interface TabCadPcbProps {
  onLoadPreset: (presetId: string) => void;
  highlightedId: string | null;
  presetRequest: PresetRequest | null;
}

const PCB_PRESETS = ['pcb_6layer_opt', 'pcb_2layer_bad', 'pcb_peak_30a', 'cad_flexure_stage', 'cad_qdd_carrier'];

// Steady-state junction-to-ambient resistance of the whole stack (K/W), as the solver below uses it.
const R_THJA_K_W = 8.2;
// Transient Cauer ladder (Track 01 Tier 3 module): the die rung and the housing rung sum to R_THJA_K_W,
// so the steady state is unchanged. 0.45 K/W with 5 ms and 2.5 K/W with 30 s are the module's worked values.
const R_DIE_K_W = 0.45;
const TAU_DIE_S = 0.005;
const TAU_HOUSING_S = 30.0;
const R_HOUSING_K_W = R_THJA_K_W - R_DIE_K_W;
// The pulse starts from the 15 A continuous design point (the Capstone I operating point).
const DESIGN_I_A = 15.0;

// Coupled electro-thermal steady state at a continuous phase current (A_rms).
function solveThermal(iRms: number, fKhz: number) {
  const f_pwm = fKhz * 1e3;
  const i_avg = (2.0 * Math.SQRT2 / Math.PI) * iRms;
  const p_sw_fet = 0.5 * 48.0 * i_avg * (26e-9) * f_pwm;
  const p_rr = 3.0 * 48.0 * 42e-9 * f_pwm;
  const p_dt = 3.0 * 0.82 * i_avg * (200e-9 * f_pwm);
  const p_shunt = 3.0 * iRms * iRms * 0.001;

  let tj = 55.0;
  for (let k = 0; k < 25; k++) {
    const rds = 0.0025 * (1.0 + 0.0042 * (tj - 25.0));
    const p_cond = 3.0 * iRms * iRms * rds;
    const p_tot = p_cond + 6.0 * p_sw_fet + p_rr + p_dt + p_shunt + 0.85;
    tj = 40.0 + p_tot * R_THJA_K_W;
  }
  const rds_hot = 0.0025 * (1.0 + 0.0042 * (tj - 25.0));
  const p_cond = 3.0 * iRms * iRms * rds_hot;
  const p_sw_all = 6.0 * p_sw_fet + p_rr + p_dt;
  const p_loss = p_cond + p_sw_all + p_shunt + 0.85;
  const p_out = Math.sqrt(3.0) * (48.0 / Math.SQRT2) * 0.85 * iRms * 0.92;
  const eff = 100.0 * p_out / (p_out + p_loss);
  return { tj, p_cond, p_sw_all, p_shunt, p_loss, eff };
}

// Junction temperature at the end of a rectangular pulse of iPulse (A_rms) lasting tpS seconds, starting from
// the design point: T_j(t_p) = T_design + dP * Z(t_p). The pulse power is the steady loss at iPulse, which is an
// upper bound because a short burst never reaches that steady temperature.
function transientPulseTj(iPulse: number, tpS: number, fKhz: number): number {
  const design = solveThermal(DESIGN_I_A, fKhz);
  const pulse = solveThermal(iPulse, fKhz);
  const dP = Math.max(0, pulse.p_loss - design.p_loss);
  const z = R_DIE_K_W * (1 - Math.exp(-tpS / TAU_DIE_S)) + R_HOUSING_K_W * (1 - Math.exp(-tpS / TAU_HOUSING_S));
  return design.tj + dP * z;
}

const BOM_DATA: BomItem[] = [
  { refDes: 'U1', mpn: 'STM32G474RET6', functionDesc: '170MHz M4F + CORDIC', rating: '3.3V, 5x 4MSPS ADC' },
  { refDes: 'U2', mpn: 'DRV8353RSRGZR', functionDesc: '100V 3-Ph Gate Driver', rating: '48V bus (53V peak)' },
  { refDes: 'Q1–Q6', mpn: 'ISC030N08NM6', functionDesc: '80V 2.5mΩ OptiMOS 6', rating: '53.1V peak < 60V gate' },
  { refDes: 'U3–U5', mpn: 'INA240A2PWR', functionDesc: '80V Inline PWM CSA', rating: '48V CM, 50 V/V gain' },
  { refDes: 'R_SH', mpn: 'CSS2H-2512R-1L00F', functionDesc: '1.0mΩ 3W Kelvin Shunt', rating: '0.23W @ 15A_rms' },
  { refDes: 'U6 / U7', mpn: 'MA732 / TCAN1044V', functionDesc: '16-bit SPI Enc + CAN-FD', rating: '16MHz SPI / 5Mbps' },
];

export const TabCadPcb: React.FC<TabCadPcbProps> = ({ onLoadPreset, highlightedId, presetRequest }) => {
  const [activeCadPart, setActiveCadPart] = useState<'flexure' | 'kelvin' | 'carrier'>('flexure');
  const [tMm, setTMm] = useState<number>(0.50);
  const [iRms, setIRms] = useState<number>(15.0);
  const [fKhz, setFKhz] = useState<number>(40);
  const [lNh, setLNh] = useState<number>(1.6);
  const [pulseMs, setPulseMs] = useState<number>(1000);

  const [flexureK, setFlexureK] = useState<number>(6.84);
  const [tjDeg, setTjDeg] = useState<number>(90.9);
  const [vdsPeak, setVdsPeak] = useState<number>(53.1);
  const [efficiency, setEfficiency] = useState<number>(99.11);
  const [pulseTjDeg, setPulseTjDeg] = useState<number>(90.9);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Apply Demo Preset: the 6-layer layout at 1.6 nH loop inductance, or a 4.5 nH layout that pushes V_DS past 60 V.
  useEffect(() => {
    const id = claimPreset(presetRequest, PCB_PRESETS);
    if (id === 'pcb_6layer_opt') setLNh(1.6);
    else if (id === 'pcb_2layer_bad') setLNh(4.5);
    else if (id === 'pcb_peak_30a') setIRms(30.0);
    else if (id === 'cad_flexure_stage') setActiveCadPart('flexure');
    else if (id === 'cad_qdd_carrier') setActiveCadPart('carrier');
  }, [presetRequest]);

  useEffect(() => {
    // Paros-Weisbord flexure rotational stiffness
    const k_theta = (2.0 * 114e9 * 0.012 * Math.pow(tMm * 1e-3, 2.5)) / (9.0 * Math.PI * Math.sqrt(0.006));
    setFlexureK(k_theta);

    // Coupled electro-thermal iterative solve (steady state at iRms), then the transient burst at pulseMs
    const { tj, p_cond, p_sw_all, p_shunt, p_loss, eff } = solveThermal(iRms, fKhz);
    const peakV = 48.0 + lNh * 3.2;

    setTjDeg(tj);
    setVdsPeak(peakV);
    setEfficiency(eff);
    setPulseTjDeg(transientPulseTj(iRms, pulseMs / 1000, fKhz));

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Left Half: 3D CAD Wireframe
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    const cx = W * 0.25, cy = H * 0.52;

    if (activeCadPart === 'flexure') {
      const gap = Math.max(4, tMm * 16);
      ctx.strokeRect(cx - 110, cy - 65, 220, 130);
      ctx.fillStyle = '#070a12';
      ctx.beginPath(); ctx.arc(cx, cy - 65, 65 - gap / 2, 0, Math.PI); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy + 65, 65 - gap / 2, Math.PI, 2 * Math.PI); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#34d399'; ctx.font = '11px monospace';
      ctx.fillText('Part: notch_flexure_hinge.step / .stl', 20, 24);
      ctx.fillText(`Web t = ${tMm.toFixed(2)} mm | R = 6.0 mm | Ti-6Al-4V`, 20, H - 15);
    } else if (activeCadPart === 'kelvin') {
      ctx.beginPath(); ctx.arc(cx, cy, 80, 0, 2 * Math.PI); ctx.stroke();
      [0, 120, 240].forEach((deg, idx) => {
        const rad = (deg * Math.PI) / 180;
        const sx = cx + 52 * Math.cos(rad), sy = cy + 52 * Math.sin(rad);
        ctx.fillStyle = ['#fb7185', '#fbbf24', '#34d399'][idx];
        ctx.beginPath(); ctx.arc(sx, sy, 11, 0, 2 * Math.PI); ctx.fill();
      });
      ctx.fillStyle = '#34d399'; ctx.font = '11px monospace';
      ctx.fillText('Part: kelvin_kinematic_coupling.step (3+2+1)', 20, 24);
      ctx.fillText('Tetrahedron(3) + V-Groove(2) + Flat(1) = 6 DOF locked', 20, H - 15);
    } else {
      ctx.beginPath(); ctx.arc(cx, cy, 80, 0, 2 * Math.PI); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, 25, 0, 2 * Math.PI); ctx.stroke();
      [0, 120, 240].forEach((deg) => {
        const rad = (deg * Math.PI) / 180;
        const px = cx + 52 * Math.cos(rad), py = cy + 52 * Math.sin(rad);
        ctx.fillStyle = '#c084fc';
        ctx.beginPath(); ctx.arc(px, py, 10, 0, 2 * Math.PI); ctx.fill();
      });
      ctx.fillStyle = '#34d399'; ctx.font = '11px monospace';
      ctx.fillText('Part: qdd_planetary_carrier.step (Toroid)', 20, 24);
      ctx.fillText('Ratio N = 8.0:1 | Double-Shear Pin SF = 82.9x', 20, H - 15);
    }

    // Right Half: Power Loss Budget Bar Chart
    const bx = W * 0.54, bw = W * 0.40;
    ctx.fillStyle = '#cbd5e1'; ctx.font = '12px monospace';
    ctx.fillText(`Capstone I 48V PCB Loss Budget (Total: ${p_loss.toFixed(2)} W)`, bx, 26);

    const bars: [string, number, string][] = [
      ['MOSFET Conduction (3*I^2*Rds(Tj))', p_cond, '#38bdf8'],
      ['Switching + Qrr + Deadtime', p_sw_all, '#c084fc'],
      ['3x 1mΩ Kelvin Shunts', p_shunt, '#34d399'],
      ['Gate Driver + MCU Quiescent', 0.85, '#fbbf24'],
    ];

    bars.forEach(([label, val, col], idx) => {
      const y = 52 + idx * 62;
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(`${label}: ${val.toFixed(2)} W`, bx, y);
      ctx.fillStyle = col;
      const barLen = Math.min(bw, (val / 12.0) * bw);
      ctx.fillRect(bx, y + 6, Math.max(6, barLen), 20);
    });
  }, [activeCadPart, tMm, iRms, fKhz, lNh, pulseMs]);

  return (
    <div className="space-y-4">
      {/* Beginner Intuition */}
      <div className="bg-accent/10 border border-accent/30 border-l-4 border-l-accent rounded-lg p-3.5 text-xs text-body leading-relaxed">
        <strong className="text-accent text-[0.85rem] block mb-1">
          Beginner's Intuition — Why Monolithic Flexures, Kelvin Couplings & 4-Terminal Kelvin Shunts Matter:
        </strong>
        (1) <strong>Notch Flexure Hinge:</strong> Instead of ball bearings that have friction and play (backlash), we carve a thin 0.5 mm Titanium bridge that bends elastically with <em>zero friction and infinite resolution</em>.<br />
        (2) <strong>Kelvin 3-2-1 Kinematic Coupling:</strong> Three hard steel balls rest in a tetrahedral pocket (3 points), a V-groove (2 points), and a flat pad (1 point). Since 3+2+1=6, it locks all 6 3D degrees of freedom without ever binding when the metal heats up.<br />
        (3) <strong>4-Terminal Kelvin Shunt & Coupled Thermal Loop:</strong> Measuring 30A across a 1 mΩ resistor produces just 30 mV. Four-terminal Kelvin routing taps the voltage directly inside the resistor pads so heavy copper solder voltage drops don't corrupt the ADC reading!
      </div>

      {/* Equations */}
      <div className="bg-panel border border-line rounded-xl p-4">
        <h2 className="text-sm font-bold text-accent mb-2">
          Paros-Weisbord Flexure Stiffness, Hertzian Contact Stress & Coupled MOSFET Electro-Thermal Loop
        </h2>
        <MathPanel
          math="k_\theta = \frac{2 E b t^{5/2}}{9\pi\sqrt{R}}, \qquad p_0 = \left(\frac{6 F_{\text{ball}} E^{*2}}{\pi^3 R_{\text{sphere}}^2}\right)^{\!1/3}, \qquad R_{DS(\text{on})}(T_j) = R_{25}\big(1 + \alpha(T_j - 25^\circ\text{C})\big), \qquad V_{DS,\text{peak}} = V_{\text{bus}} + L_{\text{loop}}\frac{dI}{dt}"
        />
      </div>

      {/* Controls and Canvas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="order-2 lg:order-none lg:col-span-5 bg-panel border border-line rounded-xl p-4 space-y-3.5">
          <h2 className="text-sm font-bold text-accent">3D CAD & 48V/30A PCB Thermal Controls</h2>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setActiveCadPart('flexure')}
              aria-pressed={activeCadPart === 'flexure'}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${activeCadPart === 'flexure' ? 'bg-accent/25 border border-accent text-accent' : 'bg-raise border border-line text-muted'}`}
            >
              Ti Notch Flexure
            </button>
            <button
              onClick={() => setActiveCadPart('kelvin')}
              aria-pressed={activeCadPart === 'kelvin'}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${activeCadPart === 'kelvin' ? 'bg-accent/25 border border-accent text-accent' : 'bg-raise border border-line text-muted'}`}
            >
              Kelvin 3-2-1
            </button>
            <button
              onClick={() => setActiveCadPart('carrier')}
              aria-pressed={activeCadPart === 'carrier'}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${activeCadPart === 'carrier' ? 'bg-accent/25 border border-accent text-accent' : 'bg-raise border border-line text-muted'}`}
            >
              8:1 QDD Carrier
            </button>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs text-body">
              <span>Flexure Min Web Thickness <MathView math="t" /> [mm]</span>
              <span className="font-mono text-emerald font-bold">{tMm.toFixed(2)}</span>
            </div>
            <input
              type="range"
              aria-label="Flexure minimum web thickness, millimetres"
              min="0.30"
              max="1.20"
              step="0.05"
              value={tMm}
              onChange={(e) => setTMm(parseFloat(e.target.value))}
              className="w-full accent-accent cursor-pointer h-1.5 bg-raise rounded-lg"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs text-body">
              <span>Capstone I Phase Current <MathView math="I_{\text{rms}}" /> [A]</span>
              <span className="font-mono text-emerald font-bold">{iRms.toFixed(1)}</span>
            </div>
            <input
              type="range"
              aria-label="Capstone I phase current, amperes RMS"
              min="5.0"
              max="30.0"
              step="1.0"
              value={iRms}
              onChange={(e) => setIRms(parseFloat(e.target.value))}
              className="w-full accent-accent cursor-pointer h-1.5 bg-raise rounded-lg"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs text-body">
              <span>SVPWM Frequency <MathView math="f_{\text{pwm}}" /> [kHz]</span>
              <span className="font-mono text-emerald font-bold">{fKhz}</span>
            </div>
            <input
              type="range"
              aria-label="SVPWM frequency, kilohertz"
              min="16"
              max="80"
              step="4"
              value={fKhz}
              onChange={(e) => setFKhz(parseFloat(e.target.value))}
              className="w-full accent-accent cursor-pointer h-1.5 bg-raise rounded-lg"
            />
          </div>

          <div className={`space-y-1 p-2 rounded-lg transition-all ${highlightedId === 'sl-pcbl' ? 'ring-2 ring-amber bg-amber/10 shadow-[0_0_15px_rgba(251,191,36,0.3)]' : ''}`}>
            <div className="flex justify-between text-xs text-body">
              <span className="text-amber font-semibold flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                Loop Inductance <MathView math="L_{\text{loop}}" /> [nH]
              </span>
              <span className="font-mono text-emerald font-bold">{lNh.toFixed(1)}</span>
            </div>
            <input
              id="sl-pcbl"
              type="range"
              aria-label="Loop inductance, nanohenries"
              min="0.8"
              max="6.0"
              step="0.2"
              value={lNh}
              onChange={(e) => setLNh(parseFloat(e.target.value))}
              className="w-full accent-accent cursor-pointer h-1.5 bg-raise rounded-lg"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs text-body">
              <span>Burst length <MathView math="t_p" /> [ms] at this current</span>
              <span className="font-mono text-emerald font-bold">{pulseMs}</span>
            </div>
            <input
              type="range"
              aria-label="Burst length, milliseconds at this current"
              min="5"
              max="10000"
              step="5"
              value={pulseMs}
              onChange={(e) => setPulseMs(parseFloat(e.target.value))}
              className="w-full accent-accent cursor-pointer h-1.5 bg-raise rounded-lg"
            />
          </div>

          {/* BOM Table */}
          <div className="pt-2">
            <h3 className="text-xs font-bold text-accent uppercase mb-1.5">
              Capstone I 48V / 30A FOC Smart Actuator BOM ($40.47 Total)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-[0.72rem] text-left border-collapse">
                <thead>
                  <tr className="border-b border-line text-accent bg-canvas">
                    <th className="p-1.5">RefDes</th>
                    <th className="p-1.5">MPN</th>
                    <th className="p-1.5">Function</th>
                    <th className="p-1.5">Rating</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-raise text-body">
                  {BOM_DATA.map((item) => (
                    <tr key={item.refDes} className="hover:bg-raise/50">
                      <td className="p-1.5 font-mono text-emerald font-bold">{item.refDes}</td>
                      <td className="p-1.5 font-mono">{item.mpn}</td>
                      <td className="p-1.5">{item.functionDesc}</td>
                      <td className="p-1.5 text-muted">{item.rating}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right: 3D Wireframe & Loss Chart */}
        <div className="order-1 lg:order-none lg:col-span-7 bg-panel border border-line rounded-xl p-4 flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-bold text-accent mb-3 flex items-center justify-between flex-wrap gap-2">
              <span>3D CAD Projection & Coupled PCB Thermal Budget</span>
              <PlotExpander canvasRef={canvasRef} title="CAD projection and thermal budget" slug="cadpcb" />
            </h2>

            {/* KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-3">
              <div className="bg-raise border border-line rounded-lg p-2.5">
                <div className="text-[0.7rem] text-muted">Flexure <MathView math="k_\theta" /></div>
                <div className="text-base font-bold font-mono text-emerald mt-0.5">{flexureK.toFixed(2)} N·m/rad</div>
              </div>
              <div className="bg-raise border border-line rounded-lg p-2.5">
                <div className="text-[0.7rem] text-muted">MOSFET <MathView math="T_j" /> (Hot)</div>
                <div className={`text-base font-bold font-mono mt-0.5 ${tjDeg < 110 ? 'text-emerald' : 'text-rose'}`}>
                  {tjDeg.toFixed(1)} °C
                </div>
              </div>
              <div className="bg-raise border border-line rounded-lg p-2.5">
                <div className="text-[0.7rem] text-muted">Turn-Off <MathView math="V_{DS,\text{peak}}" /></div>
                <div className={`text-base font-bold font-mono mt-0.5 ${vdsPeak < 60 ? 'text-emerald' : 'text-rose'}`}>
                  {vdsPeak.toFixed(1)} V
                </div>
              </div>
              <div className="bg-raise border border-line rounded-lg p-2.5">
                <div className="text-[0.7rem] text-muted">Inverter Efficiency</div>
                <div className="text-base font-bold font-mono text-emerald mt-0.5">{efficiency.toFixed(2)}%</div>
              </div>
              <div className="bg-raise border border-line rounded-lg p-2.5">
                <div className="text-[0.7rem] text-muted">Pulse <MathView math="T_j" /> (peak)</div>
                <div className={`text-base font-bold font-mono mt-0.5 ${pulseTjDeg < 110 ? 'text-emerald' : 'text-rose'}`}>
                  {pulseTjDeg.toFixed(1)} °C
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
