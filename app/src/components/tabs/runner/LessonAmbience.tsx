/**
 * The lesson runner's quiet technical grid (`runner/LessonAmbience.tsx`).
 *
 * The layer is one faint instrument grid behind the prose. It has no state and no text a
 * screen reader needs; the old aurora, orbit and HUD labels were decorative noise around the
 * lesson rather than part of it, so they no longer render.
 */
export function LessonAmbience() {
  return (
    <div
      aria-hidden="true"
      className="lesson-ambience pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      <span className="lesson-grid" />
    </div>
  );
}
