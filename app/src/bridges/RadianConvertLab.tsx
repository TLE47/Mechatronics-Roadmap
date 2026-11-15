import BridgeLab from './bridgeLabShell';
import { radianConvertLab } from './radianConvert';

/**
 * The Bridge Notes lab for Lesson P.10 (`app/src/bridges/RadianConvertLab.tsx`).
 *
 * All of the arithmetic, every number and every label lives in `radianConvert`; this is the React
 * boundary the lazy table names, so the card can be graded without a render and the model can be
 * graded without a browser. `React.lazy` gives this file its own chunk.
 */
export default function RadianConvertLab() {
  return <BridgeLab spec={radianConvertLab} />;
}
