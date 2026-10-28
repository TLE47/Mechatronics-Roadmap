import React, { useEffect, useRef } from 'react';
import { advanceArm, armFrame, armGeometry, targetPath } from '../heroArmModel';

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
 * - the canvas never exceeds 2x device pixels, and its backing store follows its own box
 *   (ResizeObserver) rather than only the window — so it is crisp on retina, cheap on a phone, and
 *   never stretched by a layout change that arrives without a `resize` event.
 *
 * The arm advances by **elapsed time**, not by a fixed step per frame: at a fixed 16 ms step a 120 Hz
 * screen ran the loop twice as fast as a 60 Hz one, and a stalled frame jumped the target. The path
 * and the kinematics live in `heroArmModel`, which the node suite also reads.
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

    // The trail is a window of *time*, so it covers the same arc on a 60 Hz and a 120 Hz screen.
    const trail: Array<{ x: number; y: number; at: number }> = [];
    let width = 0;
    let height = 0;
    let pixelRatio = 1;

    /**
     * Match the backing store to the canvas's own box.
     *
     * The box can change without a window `resize`: the introduction sizes the arm on `dvh`, and an
     * address bar settling or a panel resizing right after mount moves it on its own. While the backing
     * store kept the old height the drawing was stretched — a round joint became an ellipse — which is
     * why a ResizeObserver watches the element rather than the window. Points in the old space are not
     * meaningful in the new one, so a size change drops the trail instead of drawing it in the wrong place.
     */
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const nextWidth = Math.max(1, Math.round(rect.width));
      const nextHeight = Math.max(1, Math.round(rect.height));
      // Re-observing can report the same box: assigning again would clear a frame for nothing. The pixel
      // ratio is part of the answer, because moving to a different monitor changes it without the box.
      if (nextWidth === width && nextHeight === height && ratio === pixelRatio) return;
      if (width && height && (nextWidth !== width || nextHeight !== height)) trail.length = 0;
      width = nextWidth;
      height = nextHeight;
      pixelRatio = ratio;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    resize();
    const TRAIL_MS = 2200;
    let t = 0.9;
    let raf = 0;
    let last = 0;
    let visible = true;

    const drawFrame = (now = performance.now()) => {
      const geometry = armGeometry(width, height);
      const { ox, oy } = geometry;
      const { target, elbow, tip, q1, q2 } = armFrame(t, geometry);

      const previous = trail[trail.length - 1];
      if (!previous || Math.hypot(previous.x - tip.x, previous.y - tip.y) > 0.4) {
        trail.push({ x: tip.x, y: tip.y, at: now });
      }
      while (trail.length > 1 && now - trail[0].at > TRAIL_MS) trail.shift();
      if (trail.length > 600) trail.shift();

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

      // The path the tip is tracing — the same function the target comes from, so they cannot drift.
      const path = targetPath(geometry);
      ctx.setLineDash([4, 6]);
      ctx.strokeStyle = 'rgba(56,189,248,0.28)';
      ctx.beginPath();
      path.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.stroke();
      ctx.setLineDash([]);

      trail.forEach((point, i) => {
        ctx.globalAlpha = ((i + 1) / trail.length) * 0.7;
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 1.7, 0, Math.PI * 2);
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

      // The tip, glowing: this is the point the whole course is about. A faint ring on the target
      // shows how little the tip lags it.
      ctx.strokeStyle = 'rgba(56,189,248,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(target.x, target.y, 8, 0, Math.PI * 2);
      ctx.stroke();

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

    const tick = (now: number) => {
      if (!visible) return;
      // A capped elapsed step: a dropped frame advances the arm by at most 50 ms of travel instead of
      // teleporting it, and a 120 Hz screen no longer runs the loop twice as fast as a 60 Hz one.
      t = advanceArm(t, last ? (now - last) / 1000 : 1 / 60);
      last = now;
      drawFrame(now);
      raf = requestAnimationFrame(tick);
    };

    const start = () => {
      cancelAnimationFrame(raf);
      // Resuming after a pause must not count the pause as travel.
      last = 0;
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
    // One path for both size sources: the element's own box (ResizeObserver) and a device-pixel-ratio
    // change, which the box does not report (window `resize`).
    const remeasure = () => {
      const before = `${width}x${height}`;
      resize();
      if (!animate()) {
        drawFrame();
        return;
      }
      // Only an on-screen canvas may restart a loop; a resized one below the fold stays paused.
      if (visible && before !== `${width}x${height}`) start();
    };

    const sizeObserver = new ResizeObserver(remeasure);
    sizeObserver.observe(canvas);

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('resize', remeasure);
    // A page with its own switch passes `motion`, and the media query no longer decides for it.
    if (motion === undefined) reduced.addEventListener('change', start);
    start();

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      sizeObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', remeasure);
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
