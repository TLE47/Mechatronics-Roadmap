import BridgeLab from './bridgeLabShell';
import { prefixShiftLab } from './prefixShift';

/**
 * The Bridge Notes lab for Lesson P.7 (`app/src/bridges/PrefixShiftLab.tsx`).
 *
 * All of the arithmetic, every number and every label lives in `prefixShift`; this is the React
 * boundary the lazy table names, so the card can be graded without a render and the model can be
 * graded without a browser. `React.lazy` gives this file its own chunk.
 */
export default function PrefixShiftLab() {
  return <BridgeLab spec={prefixShiftLab} />;
}
