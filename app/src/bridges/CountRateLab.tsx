import BridgeLab from './bridgeLabShell';
import { countRateLab } from './countRate';

/**
 * The Bridge Notes lab for Lesson R.1 (`app/src/bridges/CountRateLab.tsx`).
 *
 * All of the arithmetic, every number and every label lives in `countRate`; this is the React
 * boundary the lazy table names, so the card can be graded without a render and the model can be
 * graded without a browser. `React.lazy` gives this file its own chunk.
 */
export default function CountRateLab() {
  return <BridgeLab spec={countRateLab} />;
}
