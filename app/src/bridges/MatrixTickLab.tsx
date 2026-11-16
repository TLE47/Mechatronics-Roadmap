import BridgeLab from './bridgeLabShell';
import { matrixTickLab } from './matrixTick';

/**
 * The Bridge Notes lab for Lesson R.4 (`app/src/bridges/MatrixTickLab.tsx`).
 *
 * All of the arithmetic, every number and every label lives in `matrixTick`; this is the React
 * boundary the lazy table names, so the card can be graded without a render and the model can be
 * graded without a browser. `React.lazy` gives this file its own chunk.
 */
export default function MatrixTickLab() {
  return <BridgeLab spec={matrixTickLab} />;
}
