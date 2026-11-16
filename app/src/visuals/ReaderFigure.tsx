import { Diagram } from './Diagram';
import { sceneFor } from './scenes';
import type { DiagramSpec } from './scenes';

/**
 * One picture in the lesson text, drawn (`app/src/visuals/ReaderFigure.tsx`).
 *
 * The reader is on the first-paint chunk, and the scene library (`visuals/scenes.ts`) and the SVG
 * renderer (`visuals/Diagram.tsx`) are 5.6 kB gzipped of that chunk for pictures that only appear
 * once a lesson is open. So the reader reaches them through this module with `React.lazy`: the
 * entry keeps the boundary and nothing else, and `IntroPage` — already a lazy chunk of its own —
 * keeps its gallery as it was.
 *
 * The three figure-shaped blocks of a page come through here: a `figure` names a scene, while
 * `route` and `graph` carry their own spec, because the page's own steps and nodes are the data.
 */
export default function ReaderFigure({
  id,
  caption,
  live,
  spec,
}: {
  id: string;
  caption?: string;
  live?: boolean;
  spec?: DiagramSpec;
}) {
  const resolved = spec ?? sceneFor(id);
  if (!resolved) {
    return (
      <p
        data-testid="reader-figure-missing"
        className="my-3 rounded-lg border border-amber/40 bg-amber/5 px-3 py-2 text-[13px] text-body"
      >
        This build has no figure called <code className="font-mono text-ink">{id}</code>.
        The page asks for one; the picture is missing rather than the paragraph that explains it.
      </p>
    );
  }
  return <Diagram id={id} live={live} spec={caption ? { ...resolved, caption } : resolved} />;
}
