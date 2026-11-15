import BridgeLab from './bridgeLabShell';
import { accumulateLab } from './accumulate';

/**
 * The Bridge Notes lab for Lesson R.2 (`app/src/bridges/AccumulateLab.tsx`).
 *
 * All of the arithmetic, every number and every label lives in `accumulate`; this is the React
 * boundary the lazy table names, so the card can be graded without a render and the model can be
 * graded without a browser. `React.lazy` gives this file its own chunk.
 */
export default function AccumulateLab() {
  return <BridgeLab spec={accumulateLab} />;
}
