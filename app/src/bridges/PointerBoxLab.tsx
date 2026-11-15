import BridgeLab from './bridgeLabShell';
import { pointerBoxLab } from './pointerBox';

/**
 * The Bridge Notes lab for Lesson 04.3 (`app/src/bridges/PointerBoxLab.tsx`).
 *
 * All of the arithmetic, every number and every label lives in `pointerBox`; this is the React
 * boundary the lazy table names, so the card can be graded without a render and the model can be
 * graded without a browser. `React.lazy` gives this file its own chunk.
 */
export default function PointerBoxLab() {
  return <BridgeLab spec={pointerBoxLab} />;
}
