import BridgeLab from './bridgeLabShell';
import { rcFilterLab } from './rcFilter';

/**
 * The Bridge Notes lab for Lesson 01.4 (`app/src/bridges/RcFilterLab.tsx`).
 *
 * All of the arithmetic, every number and every label lives in `rcFilter`; this is the React
 * boundary the lazy table names, so the card can be graded without a render and the model can be
 * graded without a browser. `React.lazy` gives this file its own chunk.
 */
export default function RcFilterLab() {
  return <BridgeLab spec={rcFilterLab} />;
}
