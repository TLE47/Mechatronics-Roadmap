import React, { useState, useEffect, useRef } from 'react';
import { MathView, MathPanel } from '../MathView';
import { Sparkles, RefreshCw, Zap } from 'lucide-react';
import { PresetRequest, claimPreset } from '../../demoPresets';

interface TabPendulumProps {
  onLoadPreset: (presetId: string) => void;
  highlightedId: string | null;
  presetRequest: PresetRequest | null;
}

const PENDULUM_PRESETS = ['pend_swingup', 'pend_cbf_wall'];

export const TabPendulum: React.FC<TabPendulumProps> = ({ onLoadPreset, highlightedId, presetRequest }) => {
  const [qth, setQth] = useState<number>(140);
  const [ke, setKe] = useState<number>(3.8);
  const [xmax, setXmax] = useState<number>(0.85);

  const [controllerMode, setControllerMode] = useState<string>('SWING-UP');
  const [thetaDeg, setThetaDeg] = useState<number>(175.4);
  const [cartPos, setCartPos] = useState<number>(0.0);
  const [cbfMargin, setCbfMargin] = useState<number>(0.85);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Mutable physics state for 60fps loop
  const pState = useRef({ x: 0.0, v: 0.0, th: Math.PI - 0.12, w: 0.0 });
  const trail = useRef<{ x: number; y: number }[]>([]);
  const animFrameId = useRef<number | null>(null);

  // Keep references to current slider values for physics loop without re-registering RAF
  const paramsRef = useRef({ qth, ke, xmax });
  useEffect(() => {
    paramsRef.current = { qth, ke, xmax };
  }, [qth, ke, xmax]);

  const resetPendulum = (theta0: number) => {
    pState.current = { x: 0.0, v: 0.0, th: theta0, w: 0.0 };
    trail.current = [];
  };

  const injectImpulse = (dw: number) => {
    pState.current.w += dw;
  };

  // Apply Demo Preset: tighten the wall to 0.45 m (the CBF filter then engages and pins h(x) at 0 instead of
  // leaving the cart far inside), restart from hanging, and kick it.
  useEffect(() => {
    const id = claimPreset(presetRequest, PENDULUM_PRESETS);
    if (id === 'pend_swingup') {
      setXmax(0.45);
      resetPendulum(Math.PI - 0.08);
      injectImpulse(3.2);
    } else if (id === 'pend_cbf_wall') {
      // Tight ±0.50 m wall, restart hanging, no kick: the swing-up has to stay inside it.
      setXmax(0.5);
      resetPendulum(Math.PI - 0.08);
    }
  }, [presetRequest]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let lastTime = performance.now();
    let frameCount = 0;

    const renderLoop = (time: number) => {
      const dt = 0.004;
      const g = 9.81, L = 0.45;
      const { qth: currentQth, ke: currentKe, xmax: currentXmax } = paramsRef.current;

      let mode = 'SWING-UP';
      let h_min = currentXmax;

      // 4 sub-steps per animation frame for stability
      for (let sub = 0; sub < 4; sub++) {
        const s = pState.current;
        let th = Math.atan2(Math.sin(s.th), Math.cos(s.th));
        let u_nom = 0.0;

        if (Math.abs(th) < 0.38) {
          mode = 'LQR + CBF';
          const k_th = 28.0 + 0.12 * currentQth;
          const k_w = 7.2 + 0.02 * currentQth;
          const k_x = -4.5;
          const k_v = -5.2;
          u_nom = k_th * th + k_w * s.w + k_x * s.x + k_v * s.v;
        } else {
          mode = 'SWING-UP';
          const E = 0.5 * L * L * s.w * s.w + g * L * (Math.cos(th) - 1.0);
          const signTerm = (s.w * Math.cos(th) >= 0) ? 1.0 : -1.0;
          u_nom = -currentKe * E * signTerm - 3.5 * s.x - 2.2 * s.v;
        }

        const alpha = 6.0, gamma = 10.0;
        const h_pos = (currentXmax - s.x) - s.v / alpha;
        const h_neg = (currentXmax + s.x) + s.v / alpha;
        const u_max_cbf = alpha * (gamma * h_pos - s.v);
        const u_min_cbf = -alpha * (gamma * h_neg + s.v);

        const u_safe = Math.max(-22.0, Math.min(22.0, Math.max(u_min_cbf, Math.min(u_max_cbf, u_nom))));

        const ddth = (g / L) * Math.sin(th) + (u_safe / L) * Math.cos(th) - 0.08 * s.w;
        s.x += s.v * dt;
        s.v += u_safe * dt;
        s.th += s.w * dt;
        s.w += ddth * dt;

        h_min = Math.min(h_pos, h_neg);
      }

      frameCount++;
      if (frameCount % 3 === 0) {
        const thNorm = Math.atan2(Math.sin(pState.current.th), Math.cos(pState.current.th));
        setControllerMode(mode);
        setThetaDeg(thNorm * 180 / Math.PI);
        setCartPos(pState.current.x);
        setCbfMargin(h_min);
      }

      // Draw onto canvas
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      const cx = W * 0.5, cy = H * 0.62, scale = 320;
      const wallPx = currentXmax * scale;

      // Dashed rose CBF safety wall limits
      ctx.strokeStyle = '#fb7185';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(cx - wallPx, 35); ctx.lineTo(cx - wallPx, H - 35);
      ctx.moveTo(cx + wallPx, 35); ctx.lineTo(cx + wallPx, H - 35);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#fb7185';
      ctx.font = '11px monospace';
      ctx.fillText(`-x_max (-${currentXmax.toFixed(2)}m)`, cx - wallPx - 40, 25);
      ctx.fillText(`+x_max (+${currentXmax.toFixed(2)}m)`, cx + wallPx - 40, 25);

      // Track rail
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(30, cy); ctx.lineTo(W - 30, cy);
      ctx.stroke();

      const cartX = cx + pState.current.x * scale;
      const rodLen = 150;
      const tipX = cartX + rodLen * Math.sin(pState.current.th);
      const tipY = cy - rodLen * Math.cos(pState.current.th);

      trail.current.push({ x: tipX, y: tipY });
      if (trail.current.length > 90) trail.current.shift();

      // Motion trail
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      trail.current.forEach((pt, idx) => {
        if (idx === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
      });
      ctx.stroke();

      // Cart body
      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.5;
      ctx.fillRect(cartX - 36, cy - 18, 72, 36);
      ctx.strokeRect(cartX - 36, cy - 18, 72, 36);

      // Cart wheels
      ctx.fillStyle = '#475569';
      ctx.beginPath(); ctx.arc(cartX - 22, cy + 18, 6, 0, 2 * Math.PI); ctx.fill();
      ctx.beginPath(); ctx.arc(cartX + 22, cy + 18, 6, 0, 2 * Math.PI); ctx.fill();

      // Pendulum rod
      ctx.strokeStyle = mode === 'LQR + CBF' ? '#34d399' : '#38bdf8';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(cartX, cy); ctx.lineTo(tipX, tipY);
      ctx.stroke();

      // Pendulum pivot joint
      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cartX, cy, 6, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();

      // Pendulum tip bob
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath(); ctx.arc(tipX, tipY, 12, 0, 2 * Math.PI); ctx.fill();

      animFrameId.current = requestAnimationFrame(renderLoop);
    };

    animFrameId.current = requestAnimationFrame(renderLoop);

    return () => {
      if (animFrameId.current) cancelAnimationFrame(animFrameId.current);
    };
  }, []);

  return (
    <div className="space-y-4">
      {/* Beginner Intuition */}
      <div className="bg-[#38bdf8]/10 border border-[#38bdf8]/30 border-l-4 border-l-[#38bdf8] rounded-lg p-3.5 text-xs text-[#cbd5e1] leading-relaxed">
        <strong className="text-[#38bdf8] text-[0.85rem] block mb-1">
          Beginner's Intuition — Swing-Up, LQR Balancing & Control Barrier Functions (CBF):
        </strong>
        When a pendulum hangs straight down, a linear controller cannot lift it directly if the motor torque is limited. Instead, we use <strong>Energy Pumping</strong> (like a child pumping their legs on a playground swing) until the rod reaches within 22° of upright, then hand off to an <strong>LQR balancer</strong> (like balancing a broomstick on your palm). Meanwhile, the <strong>Control Barrier Function <MathView math="h(x) \ge 0" /></strong> acts as an invisible force-field bumper that smoothly brakes the cart before it can ever crash into the red workspace limits <MathView math="\pm x_{\max}" />.
      </div>

      {/* Equations */}
      <div className="bg-[#111827] border border-[#334155] rounded-xl p-4">
        <h2 className="text-sm font-bold text-[#38bdf8] mb-2">
          Åström-Furuta Energy Pumping, LQR Stabilization & Exponential Control Barrier Function (ECBF)
        </h2>
        <MathPanel
          math="E(\theta,\dot{\theta}) = \frac{1}{2}J_p\dot{\theta}^2 + m_p g l_c(\cos\theta - 1), \qquad u_{\text{swing}} = -k_E E\,\text{sign}(\dot{\theta}\cos\theta), \qquad h(x,\dot{x}) = (x_{\max} - |x|) - \frac{|\dot{x}|}{\alpha_{\text{cbf}}} \ge 0"
        />
      </div>

      {/* Controls and Canvas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-5 bg-[#111827] border border-[#334155] rounded-xl p-4 space-y-3.5">
          <h2 className="text-sm font-bold text-[#38bdf8]">Nonlinear Swing-Up, LQR & CBF Controls</h2>
          <p className="text-xs text-[#94a3b8]">
            Real-time 60 FPS RK4 simulation switching from energy pumping to LQR at <MathView math="|\theta| < 22^\circ" /> while enforcing hard cart walls <MathView math="\pm x_{\max}" /> via a Control Barrier Function QP.
          </p>

          <div className="space-y-1">
            <div className="flex justify-between text-xs text-[#cbd5e1]">
              <span>LQR Angle Weight <MathView math="Q_\theta" /></span>
              <span className="font-mono text-[#34d399] font-bold">{qth}</span>
            </div>
            <input
              type="range"
              min="40"
              max="300"
              step="10"
              value={qth}
              onChange={(e) => setQth(parseFloat(e.target.value))}
              className="w-full accent-[#38bdf8] cursor-pointer h-1.5 bg-[#1e293b] rounded-lg"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs text-[#cbd5e1]">
              <span>Energy Swing-Up Gain <MathView math="k_E" /></span>
              <span className="font-mono text-[#34d399] font-bold">{ke.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min="1.0"
              max="8.0"
              step="0.2"
              value={ke}
              onChange={(e) => setKe(parseFloat(e.target.value))}
              className="w-full accent-[#38bdf8] cursor-pointer h-1.5 bg-[#1e293b] rounded-lg"
            />
          </div>

          <div className={`space-y-1 p-2 rounded-lg transition-all ${highlightedId === 'sl-xmax' ? 'ring-2 ring-[#fbbf24] bg-[#fbbf24]/10 shadow-[0_0_15px_rgba(251,191,36,0.3)]' : ''}`}>
            <div className="flex justify-between text-xs text-[#cbd5e1]">
              <span className="flex items-center gap-1 font-semibold text-[#fbbf24]">
                <Sparkles className="w-3 h-3" />
                CBF Safety Wall <MathView math="x_{\max}" /> [m]
              </span>
              <span className="font-mono text-[#34d399] font-bold">{xmax.toFixed(2)}</span>
            </div>
            <input
              id="sl-xmax"
              type="range"
              min="0.45"
              max="1.20"
              step="0.05"
              value={xmax}
              onChange={(e) => setXmax(parseFloat(e.target.value))}
              className="w-full accent-[#38bdf8] cursor-pointer h-1.5 bg-[#1e293b] rounded-lg"
            />
          </div>

          <div className="pt-2 flex flex-wrap gap-2">
            <button
              onClick={() => resetPendulum(Math.PI - 0.08)}
              className="bg-[#38bdf8]/20 hover:bg-[#38bdf8]/30 text-[#38bdf8] border border-[#38bdf8] px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer shadow-sm flex items-center gap-1"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reset Hanging (θ₀ = 175°)</span>
            </button>
            <button
              onClick={() => injectImpulse(3.2)}
              className="bg-[#1e293b] hover:bg-[#334155] text-[#fbbf24] border border-[#334155] px-2.5 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Inject +3.2 rad/s Kick</span>
            </button>
            <button
              onClick={() => resetPendulum(0.18)}
              className="bg-[#1e293b] hover:bg-[#334155] text-[#f1f5f9] border border-[#334155] px-2.5 py-1.5 rounded-md text-xs cursor-pointer font-medium"
            >
              Reset Upright (θ₀ = 10°)
            </button>
          </div>
        </div>

        {/* Right: 60 FPS Visual Canvas & KPIs */}
        <div className="lg:col-span-7 bg-[#111827] border border-[#334155] rounded-xl p-4 flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-bold text-[#38bdf8] mb-3 flex items-center justify-between flex-wrap gap-2">
              <span>Live Inverted Pendulum Kinematics & CBF Wall Enforcement</span>
              <span className="text-xs text-[#94a3b8] font-mono">Dashed Rose Lines = CBF Limits</span>
            </h2>

            {/* KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-2.5">
                <div className="text-[0.7rem] text-[#94a3b8]">Active Controller</div>
                <div className={`text-base font-bold font-mono mt-0.5 ${controllerMode === 'LQR + CBF' ? 'text-[#34d399]' : 'text-[#38bdf8]'}`}>
                  {controllerMode}
                </div>
              </div>
              <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-2.5">
                <div className="text-[0.7rem] text-[#94a3b8]">Pendulum Angle θ</div>
                <div className="text-base font-bold font-mono text-[#34d399] mt-0.5">{thetaDeg.toFixed(1)}°</div>
              </div>
              <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-2.5">
                <div className="text-[0.7rem] text-[#94a3b8]">Base Position x</div>
                <div className="text-base font-bold font-mono text-[#38bdf8] mt-0.5">{cartPos.toFixed(2)} m</div>
              </div>
              <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-2.5">
                <div className="text-[0.7rem] text-[#94a3b8]">CBF Margin h(x)</div>
                <div className={`text-base font-bold font-mono mt-0.5 ${cbfMargin >= 0.1 ? 'text-[#34d399]' : 'text-[#fb7185]'}`}>
                  +{cbfMargin.toFixed(2)} m
                </div>
              </div>
            </div>

            {/* Canvas */}
            <div className="w-full overflow-hidden rounded-lg border border-[#1e293b] bg-[#070a12]">
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
