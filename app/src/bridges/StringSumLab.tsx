import BridgeLab from './bridgeLabShell';
import { stringSumLab } from './stringSum';

/**
 * The Bridge Notes lab for Lesson P.1 (`app/src/bridges/StringSumLab.tsx`).
 *
 * All of the arithmetic, every number and every label lives in `stringSum`; this is the React
 * boundary the lazy table names, so the card can be graded without a render and the model can be
 * graded without a browser. `React.lazy` gives this file its own chunk.
 */
export default function StringSumLab() {
  return <BridgeLab spec={stringSumLab} />;
}
