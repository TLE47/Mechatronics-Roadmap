import BridgeLab from './bridgeLabShell';
import { clampFunctionLab } from './clampFunction';

/**
 * The Bridge Notes lab for Lesson P.5 (`app/src/bridges/ClampFunctionLab.tsx`).
 *
 * All of the arithmetic, every number and every label lives in `clampFunction`; this is the React
 * boundary the lazy table names, so the card can be graded without a render and the model can be
 * graded without a browser. `React.lazy` gives this file its own chunk.
 */
export default function ClampFunctionLab() {
  return <BridgeLab spec={clampFunctionLab} />;
}
