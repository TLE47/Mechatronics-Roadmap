import { Cpu, Gauge, GitBranch, TerminalSquare } from 'lucide-react';

/**
 * The lesson runner's atmosphere (`runner/LessonAmbience.tsx`).
 *
 * The lesson screen is mostly prose, cards and code, which is right for reading and wrong for the
 * feeling of a live bench. This layer sits behind everything with `pointer-events: none`: a slow
 * aurora, a faint instrument grid, an orbit ring and four HUD chips naming the loop. It has no state,
 * no measurement and no text a screen reader needs, so it cannot change what the runner does — only
 * how the space around it feels.
 */
export function LessonAmbience() {
  return (
    <div
      aria-hidden="true"
      className="lesson-ambience pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      <span className="lesson-aurora" />
      <span className="lesson-grid" />
      <span className="lesson-orbit" />
      <span className="lesson-hud lesson-hud--a">
        <TerminalSquare className="h-2.5 w-2.5" /> run
      </span>
      <span className="lesson-hud lesson-hud--b">
        <Cpu className="h-2.5 w-2.5" /> simulate
      </span>
      <span className="lesson-hud lesson-hud--c">
        <Gauge className="h-2.5 w-2.5" /> measure
      </span>
      <span className="lesson-hud lesson-hud--d">
        <GitBranch className="h-2.5 w-2.5" /> plan
      </span>
    </div>
  );
}
