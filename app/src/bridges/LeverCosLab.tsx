import BridgeLab from './bridgeLabShell';
import { leverCosLab } from './leverCos';

/**
 * The Bridge Notes lab for Lesson P.12 (`app/src/bridges/LeverCosLab.tsx`).
 *
 * All of the arithmetic, every number and every label lives in `leverCos`; this is the React
 * boundary the lazy table names, so the card can be graded without a render and the model can be
 * graded without a browser. `React.lazy` gives this file its own chunk.
 */
export default function LeverCosLab() {
  return <BridgeLab spec={leverCosLab} />;
}
