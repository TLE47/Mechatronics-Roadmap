import BridgeLab from './bridgeLabShell';
import { arrowMultiplyLab } from './arrowMultiply';

/**
 * The Bridge Notes lab for Lesson R.5 (`app/src/bridges/ArrowMultiplyLab.tsx`).
 *
 * All of the arithmetic, every number and every label lives in `arrowMultiply`; this is the React
 * boundary the lazy table names, so the card can be graded without a render and the model can be
 * graded without a browser. `React.lazy` gives this file its own chunk.
 */
export default function ArrowMultiplyLab() {
  return <BridgeLab spec={arrowMultiplyLab} />;
}
