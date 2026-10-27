import React, { useEffect, useRef } from 'react';

/**
 * The arm the course builds, running on the landing screen before anyone signs up.
 *
 * A still image would say "here is a robot"; this says "the thing works, in your browser,
 * right now". It is the same figure-8 the capstone tracks: the tip follows a Lissajous path,
 * inverse kinematics turns each target into two joint angles, and the trail is where the tip
 * has been - so the picture is the course's actual claim, not an illustration of it.
 *
 * Three constraints keep it from costing what it looks like:
 * - it pauses when scrolled out of view (IntersectionObserver) and when the tab is hidden;
 * - `prefers-reduced-motion` draws one still frame;
 * - the canvas never exceeds 2x device pixels and resizes from the container, so it is crisp on
 *   retina and cheap on a phone.
 */
/**
 * `motion` overrides the system preference when a page has its own switch (the introduction does):
 * the arm is the most obviously animated thing on the page, so it has to obey the same switch as
 * everything else rather than the media query alone.
 */
export const HeroArm: React.FC<{ className?: string; motion?: boolean }> = ({ className, motion }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const css = (name: string, fallback: string) => {
      const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return value || fallback;
    };
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const animate = () => (motion === undefined ? !reduced.matches : motion);

    let width = 0;
    let height = 0;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(240, Math.round(rect.width));
      height = Math.max(180, Math.round(rect.height));
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const trail: Array<[number, number]> = [];
    let t = 0.9;
    let raf = 0;
    let visible = true;

    const drawFrame = () => {
      const L1 = Math.min(width, height) * 0.34;
      const L2 = L1 * 0.82;
      const ox = width / 2;
      const oy = height * 0.58;

      // Target on a figure-8, scaled to the panel.
      const spanX = Math.min(width * 0.3, L1 + L2 - 14);
      const spanY = Math.min(height * 0.2, L1 + L2 - 14);
      const tx = spanX * Math.sin(t);
      const ty = spanY * Math.sin(2 * t);

      // Two-link inverse kinematics (elbow up).
      const clamped = Math.min(1, Math.max(-1, (tx * tx + ty * ty - L1 * L1 - L2 * L2) / (2 * L1 * L2)));
      const q2 = -Math.acos(clamped);
      const q1 = Math.atan2(ty, tx) - Math.atan2(L2 * Math.sin(q2), L1 + L2 * Math.cos(q2));
      const elbow = { x: ox + L1 * Math.cos(q1), y: oy - L1 * Math.sin(q1) };
      const tip = { x: elbow.x + L2 * Math.cos(q1 + q2), y: elbow.y - L2 * Math.sin(q1 + q2) };

      trail.push([tip.x, tip.y]);
      if (trail.length > 150) trail.shift();

      const accent = css('--accent', '#38bdf8');
      const dimLine = css('--border-soft', '#182436');
      const ink = css('--dim', '#6d7f99');

      ctx.clearRect(0, 0, width, height);

      // Bench grid.
      ctx.strokeStyle = dimLine;
      ctx.lineWidth = 1;
      const step = 26;
      for (let x = (ox % step) - step; x < width; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = (oy % step) - step; y < height; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // The path the tip is tracing, plus where it has just been.
      ctx.setLineDash([4, 6]);
      ctx.strokeStyle = 'rgba(56,189,248,0.28)';
      ctx.beginPath();
      for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.05) {
        const px = ox + spanX * Math.sin(a);
        const py = oy - spanY * Math.sin(2 * a);
        if (a === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      trail.forEach(([x, y], i) => {
        ctx.globalAlpha = (i / trail.length) * 0.7;
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(x, y, 1.7, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      // The arm: a wide dark casing with the lit link inside it.
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#0b1522';
      ctx.lineWidth = 13;
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(elbow.x, elbow.y);
      ctx.lineTo(tip.x, tip.y);
      ctx.stroke();

      ctx.strokeStyle = accent;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(elbow.x, elbow.y);
      ctx.lineTo(tip.x, tip.y);
      ctx.stroke();

      // Joints.
      for (const [x, y, r] of [
        [ox, oy, 6.5],
        [elbow.x, elbow.y, 5.5],
      ] as const) {
        ctx.fillStyle = '#0b1522';
        ctx.beginPath();
        ctx.arc(x, y, r + 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = accent;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // The tip, glowing: this is the point the whole course is about.
      ctx.shadowBlur = 18;
      ctx.shadowColor = accent;
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Base label, in the instrument voice the rest of the page uses.
      ctx.fillStyle = ink;
      ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.fillText('2-DOF · FIGURE-8', 14, height - 14);
      ctx.textAlign = 'right';
      ctx.fillText(`q₁ ${((q1 * 180) / Math.PI).toFixed(0)}°  q₂ ${((q2 * 180) / Math.PI).toFixed(0)}°`, width - 14, height - 14);
      ctx.textAlign = 'left';
    };

    const tick = () => {
      if (!visible) return;
      t += 0.016;
      drawFrame();
      raf = requestAnimationFrame(tick);
    };

    const start = () => {
      cancelAnimationFrame(raf);
      if (!animate()) {
        drawFrame();
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        visible = entries[0]?.isIntersecting ?? true;
        if (visible) start();
        else cancelAnimationFrame(raf);
      },
      { threshold: 0.15 }
    );
    observer.observe(canvas);

    const onVisibility = () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else if (visible) start();
    };
    const onResize = () => {
      resize();
      if (!animate()) drawFrame();
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('resize', onResize);
    // A page with its own switch passes `motion`, and the media query no longer decides for it.
    if (motion === undefined) reduced.addEventListener('change', start);
    start();

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', onResize);
      if (motion === undefined) reduced.removeEventListener('change', start);
    };
  }, [motion]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      role="img"
      aria-label="A simulated two-joint robot arm tracing a figure-eight path, with its joints and tip trail drawn as it moves."
    />
  );
};
