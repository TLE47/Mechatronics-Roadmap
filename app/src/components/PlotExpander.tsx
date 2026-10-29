import React, { useState } from 'react';
import { Maximize2 } from 'lucide-react';
import { Sheet } from './Sheet';

/**
 * A lab canvas at full size (`components/PlotExpander.tsx`).
 *
 * Below the split threshold a plot is a 320 px card, and a Bode phase margin or a PID response's
 * overshoot is read off the drawing, not guessed from it. The old answer was to pinch: a pinch zooms
 * the page's text with the trace and loses the axis you were reading. This takes the canvas's own
 * pixels — `toDataURL` of the live element, so it is the plot that is on screen, not a redraw that
 * could disagree with it — and shows them in a sheet that scrolls in both directions.
 *
 * The snapshot is taken when the sheet opens, because the canvas is redrawn on every animation
 * frame and a live `<img>` would either be stale or be a second copy of the draw loop.
 */
export interface PlotExpanderProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  /** The plot's name, used as the sheet title and the image's alt text. */
  title: string;
  /** A short slug for the test hooks: `bode`, `foc`, `pendulum`… */
  slug: string;
}

export const PlotExpander: React.FC<PlotExpanderProps> = ({ canvasRef, title, slug }) => {
  const [open, setOpen] = useState(false);
  const [src, setSrc] = useState<string | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [error, setError] = useState('');

  const openSheet = () => {
    const canvas = canvasRef.current;
    if (!canvas) {
      setError('The plot is not drawn yet — press Play or wait for its first frame.');
      setSrc(null);
      setSize(null);
      setOpen(true);
      return;
    }
    try {
      const snapshot = canvas.toDataURL('image/png');
      setSrc(snapshot);
      setSize({ width: canvas.width, height: canvas.height });
      setError('');
    } catch {
      setError('This browser would not let the plot be copied. Try a screenshot instead.');
      setSrc(null);
      setSize(null);
    }
    setOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={openSheet}
        data-testid={`btn-plot-expand-${slug}`}
        aria-haspopup="dialog"
        title={`Open ${title} at full size`}
        className="btn h-9 gap-1.5 px-2.5 text-[12px]"
      >
        <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="hidden min-[360px]:inline">Expand</span>
      </button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={`${title} · full size`}
        testId={`plot-sheet-${slug}`}
        size="lg"
      >
        <div className="p-3">
          {error ? (
            <p data-testid={`plot-sheet-${slug}-error`} className="text-[12.5px] text-muted">
              {error}
            </p>
          ) : (
            src &&
            size && (
              <div
                data-testid={`plot-sheet-${slug}-scroller`}
                className="max-h-[70dvh] overflow-auto rounded-lg border border-line bg-[var(--plot)] p-1"
              >
                <img
                  data-testid={`plot-sheet-${slug}-image`}
                  src={src}
                  width={size.width}
                  height={size.height}
                  alt={`${title}, full size`}
                  className="block h-auto max-w-none"
                />
              </div>
            )
          )}
          <p className="mt-2 text-[11.5px] text-faint">
            The drawing at its own resolution. Drag or swipe inside the frame to read a label; close
            the sheet to return to the lab where you left it.
          </p>
        </div>
      </Sheet>
    </>
  );
};
