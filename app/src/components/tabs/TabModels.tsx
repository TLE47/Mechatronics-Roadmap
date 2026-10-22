import React, { useState, useEffect, useRef } from 'react';
import { MathView, MathPanel } from '../MathView';
import { ShieldAlert, ShieldCheck, RefreshCw, Zap } from 'lucide-react';
import { PresetRequest, claimPreset } from '../../demoPresets';

interface TabModelsProps {
  onLoadPreset: (presetId: string) => void;
  highlightedId: string | null;
  presetRequest: PresetRequest | null;
}

const MODELS_PRESETS = ['sto_desat_short', 'sto_enc_crc', 'robot_hopper_crouch', 'robot_arm_polish', 'robot_furuta_bal'];

export const TabModels: React.FC<TabModelsProps> = ({ onLoadPreset, highlightedId, presetRequest }) => {
  const [selectedModel, setSelectedModel] = useState<'hopper' | 'arm6' | 'furuta'>('hopper');
  const [q1, setQ1] = useState<number>(20);
  const [q2, setQ2] = useState<number>(-55);
  const [q3, setQ3] = useState<number>(65);

  const [stoState, setStoState] = useState<string>('ACTIVE (PWM ON)');
  const [stoReactionUs, setStoReactionUs] = useState<string>('0.65 μs');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const modelMeta = {
    hopper: { name: '3-DOF QDD Hopper', mass: '11.69 kg' },
    arm6: { name: '6-DOF Serial Arm', mass: '12.99 kg' },
    furuta: { name: 'Furuta Pendulum', mass: '2.98 kg' },
  }[selectedModel];

  const triggerSTOFault = (cmd: 'RUN' | 'OC_SHORT' | 'ENC_CRC' | 'RESET') => {
    if (cmd === 'RUN') {
      setStoState('ACTIVE (PWM ON)');
      setStoReactionUs('0.65 μs');
    } else if (cmd === 'OC_SHORT') {
      setStoState('FAULT: OC DESAT');
      setStoReactionUs('0.65 μs (<1μs)');
    } else if (cmd === 'ENC_CRC') {
      setStoState('FAULT: ENC CRC');
      setStoReactionUs('50.0 μs (2 cyc)');
    } else {
      setStoState('SAFE STANDBY');
      setStoReactionUs('0.00 μs');
    }
  };

  // Apply Demo Preset: hopper under a 42 A overcurrent short, or an encoder CRC break, so the STO trips.
  useEffect(() => {
    const id = claimPreset(presetRequest, MODELS_PRESETS);
    if (id === 'sto_desat_short') {
      setSelectedModel('hopper');
      triggerSTOFault('OC_SHORT');
    } else if (id === 'sto_enc_crc') {
      setSelectedModel('hopper');
      triggerSTOFault('ENC_CRC');
    } else if (id === 'robot_hopper_crouch') {
      // Hopper in a deep crouch: knee joint q2 bent well past its neutral pose.
      setSelectedModel('hopper');
      setQ2(-100);
    } else if (id === 'robot_arm_polish') {
      setSelectedModel('arm6');
    } else if (id === 'robot_furuta_bal') {
      setSelectedModel('furuta');
    }
  }, [presetRequest]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const rad1 = (q1 * Math.PI) / 180;
    const rad2 = (q2 * Math.PI) / 180;
    const rad3 = (q3 * Math.PI) / 180;

    const ox = W * 0.30, oy = H * 0.45;
    const l1 = 85, l2 = 80, l3 = 65;
    const x1 = ox + l1 * Math.sin(rad1);
    const y1 = oy + l1 * Math.cos(rad1);
    const x2 = x1 + l2 * Math.sin(rad1 + rad2);
    const y2 = y1 + l2 * Math.cos(rad1 + rad2);
    const x3 = x2 + l3 * Math.sin(rad1 + rad2 + rad3);
    const y3 = y2 + l3 * Math.cos(rad1 + rad2 + rad3);

    // Ground plane
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(20, H - 30); ctx.lineTo(W * 0.60, H - 30); ctx.stroke();

    // Ground hatch lines
    for (let hx = 25; hx < W * 0.60; hx += 16) {
      ctx.beginPath(); ctx.moveTo(hx, H - 30); ctx.lineTo(hx - 8, H - 18); ctx.stroke();
    }

    // Kinematic links
    const linkColor = stoState.startsWith('FAULT') ? '#fb7185' : '#38bdf8';
    ctx.strokeStyle = linkColor;
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3);
    ctx.stroke();

    // Joints & CoM markers
    const joints: [number, number, number, string][] = [
      [ox, oy, 11, '#f59e0b'],
      [x1, y1, 9, '#34d399'],
      [x2, y2, 8, '#34d399'],
      [x3, y3, 8, '#c084fc'],
    ];
    joints.forEach(([jx, jy, r, col]) => {
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(jx, jy, r, 0, 2 * Math.PI); ctx.fill();
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(jx, jy, r, 0, 2 * Math.PI); ctx.stroke();
    });

    // Right Side Telemetry inside Canvas
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.fillRect(W * 0.60, 16, W * 0.38, H - 32);
    ctx.strokeRect(W * 0.60, 16, W * 0.38, H - 32);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '12px monospace';
    const tx = W * 0.62;
    ctx.fillText('URDF <-> MuJoCo Parity: PASS', tx, 42);
    ctx.fillText('Sylvester SPD Check: PASS', tx, 70);
    ctx.fillText('Triangle Ineq I1+I2>=I3: PASS', tx, 98);
    ctx.fillText('Distal Shank Mass: 0.150 kg', tx, 126);

    ctx.fillStyle = stoState.startsWith('FAULT') ? '#fb7185' : '#34d399';
    ctx.fillText(`STO Ch A/B: ${stoState.startsWith('ACTIVE') ? 'ENERGIZED' : 'SAFE HIGH-Z'}`, tx, 160);

    ctx.fillStyle = '#38bdf8';
    const tcpX = ((x3 - ox) / 100).toFixed(2);
    const tcpY = ((oy - y3) / 100).toFixed(2);
    ctx.fillText(`TCP End-Effector: (${tcpX}m, ${tcpY}m)`, tx, 190);
  }, [q1, q2, q3, selectedModel, stoState]);

  return (
    <div className="space-y-4">
      {/* Beginner Intuition */}
      <div className="bg-accent/10 border border-accent/30 border-l-4 border-l-accent rounded-lg p-3.5 text-xs text-body leading-relaxed">
        <strong className="text-accent text-[0.85rem] block mb-1">
          Beginner's Intuition — Why Physics Simulators Crash & How Hardware STO Saves Lives:
        </strong>
        (1) In a 3D physics engine (MuJoCo/URDF), every link has a 3×3 inertia matrix <MathView math="I" />. For a real physical object, the sum of any two principal inertias must be at least as large as the third (<MathView math="I_1 + I_2 \ge I_3" />, the <strong>triangle inequality</strong>). Violating this creates "negative mass density" in certain directions and blows up the simulator.<br />
        (2) <strong>Dual-Channel Safe Torque Off (STO):</strong> Never trust software (<code className="text-rose">if (fault) pwm = 0</code>) to stop a 48V robot if the CPU freezes! Hardware STO uses two independent physical logic paths (<MathView math="\text{STO}_A" /> and <MathView math="\text{STO}_B" />) that directly cut power to the MOSFET gate drivers in &lt;1 μs.
      </div>

      {/* Equations */}
      <div className="bg-panel border border-line rounded-xl p-4">
        <h2 className="text-sm font-bold text-accent mb-2">
          Validated URDF & MuJoCo MJCF Inertia Tensor Invariants + IEC 61800-5-2 Dual-Channel STO
        </h2>
        <MathPanel
          math="\text{Sylvester SPD: } I_{xx} > 0,\ \det\begin{bmatrix}I_{xx}&I_{xy}\\I_{xy}&I_{yy}\end{bmatrix} > 0,\ \det(I) > 0, \qquad \text{Triangle Inequality: } I_1 + I_2 \ge I_3, \qquad V_{\text{bus,peak}} = \sqrt{V_{\text{nom}}^2 + \frac{\eta J\omega_0^2}{C_{\text{bus}}}}"
        />
      </div>

      {/* Controls and Canvas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-5 bg-panel border border-line rounded-xl p-4 space-y-3.5">
          <h2 className="text-sm font-bold text-accent">Robot Articulation & Model Selection</h2>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedModel('hopper')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${selectedModel === 'hopper' ? 'bg-accent/25 border border-accent text-accent' : 'bg-raise border border-line text-muted'}`}
            >
              Capstone IV: 3-DOF Hopper
            </button>
            <button
              onClick={() => setSelectedModel('arm6')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${selectedModel === 'arm6' ? 'bg-accent/25 border border-accent text-accent' : 'bg-raise border border-line text-muted'}`}
            >
              Capstone III: 6-DOF Arm
            </button>
            <button
              onClick={() => setSelectedModel('furuta')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${selectedModel === 'furuta' ? 'bg-accent/25 border border-accent text-accent' : 'bg-raise border border-line text-muted'}`}
            >
              Capstone II: Furuta
            </button>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs text-body">
              <span>Joint <MathView math="q_1" /> [deg]</span>
              <span className="font-mono text-emerald font-bold">{q1}°</span>
            </div>
            <input
              type="range"
              aria-label="Joint 1, degrees"
              min="-90"
              max="90"
              step="1"
              value={q1}
              onChange={(e) => setQ1(parseFloat(e.target.value))}
              className="w-full accent-accent cursor-pointer h-1.5 bg-raise rounded-lg"
            />
          </div>

          <div className={`space-y-1 p-2 rounded-lg transition-all ${highlightedId === 'sl-rq2' ? 'ring-2 ring-amber bg-amber/10 shadow-[0_0_15px_rgba(251,191,36,0.3)]' : ''}`}>
            <div className="flex justify-between text-xs text-body">
              <span className="text-amber font-semibold">Joint <MathView math="q_2" /> [deg]</span>
              <span className="font-mono text-emerald font-bold">{q2}°</span>
            </div>
            <input
              id="sl-rq2"
              type="range"
              aria-label="Joint 2, degrees"
              min="-120"
              max="90"
              step="1"
              value={q2}
              onChange={(e) => setQ2(parseFloat(e.target.value))}
              className="w-full accent-accent cursor-pointer h-1.5 bg-raise rounded-lg"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs text-body">
              <span>Joint <MathView math="q_3" /> [deg]</span>
              <span className="font-mono text-emerald font-bold">{q3}°</span>
            </div>
            <input
              type="range"
              aria-label="Joint 3, degrees"
              min="-135"
              max="135"
              step="1"
              value={q3}
              onChange={(e) => setQ3(parseFloat(e.target.value))}
              className="w-full accent-accent cursor-pointer h-1.5 bg-raise rounded-lg"
            />
          </div>

          <h2 className="text-sm font-bold text-accent pt-2 border-t border-line-soft">
            Lab 07 HIL Fault-Injection & Dual-Channel STO
          </h2>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => triggerSTOFault('RUN')}
              className="bg-emerald/20 hover:bg-emerald/30 text-emerald border border-emerald px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Enable Closed-Loop</span>
            </button>
            <button
              onClick={() => triggerSTOFault('OC_SHORT')}
              className="bg-rose/20 hover:bg-rose/30 text-rose border border-rose px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Inject 42A Short (&lt;1μs)</span>
            </button>
            <button
              onClick={() => triggerSTOFault('ENC_CRC')}
              className="bg-rose/20 hover:bg-rose/30 text-rose border border-rose px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Encoder Wire Break</span>
            </button>
            <button
              onClick={() => triggerSTOFault('RESET')}
              className="bg-raise hover:bg-elevate text-body border border-line px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer flex items-center gap-1"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Manual STO Reset</span>
            </button>
          </div>
        </div>

        {/* Right: Kinematics Canvas & KPIs */}
        <div className="lg:col-span-7 bg-panel border border-line rounded-xl p-4 flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-bold text-accent mb-3 flex items-center justify-between flex-wrap gap-2">
              <span>Kinematic Chain Pose & Validated URDF/MJCF Telemetry</span>
            </h2>

            {/* KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              <div className="bg-raise border border-line rounded-lg p-2.5">
                <div className="text-[0.7rem] text-muted">Selected Model</div>
                <div className="text-base font-bold font-mono text-accent mt-0.5">{modelMeta.name}</div>
              </div>
              <div className="bg-raise border border-line rounded-lg p-2.5">
                <div className="text-[0.7rem] text-muted">Total Mass <MathView math="\sum m_i" /></div>
                <div className="text-base font-bold font-mono text-emerald mt-0.5">{modelMeta.mass}</div>
              </div>
              <div className="bg-raise border border-line rounded-lg p-2.5">
                <div className="text-[0.7rem] text-muted">STO Safety State</div>
                <div className={`text-base font-bold font-mono mt-0.5 ${stoState.startsWith('ACTIVE') ? 'text-emerald' : 'text-rose'}`}>
                  {stoState}
                </div>
              </div>
              <div className="bg-raise border border-line rounded-lg p-2.5">
                <div className="text-[0.7rem] text-muted">Gate Reaction Time</div>
                <div className="text-base font-bold font-mono text-amber mt-0.5">{stoReactionUs}</div>
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
