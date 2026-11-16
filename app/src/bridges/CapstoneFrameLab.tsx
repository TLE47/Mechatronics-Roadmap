import BridgeLab from './bridgeLabShell';
import { capstoneFrameLab } from './capstoneFrame';

/**
 * The Bridge Notes lab for Lesson 08.1 (`app/src/bridges/CapstoneFrameLab.tsx`).
 *
 * All of the arithmetic, every number and every label lives in `capstoneFrame`; this is the React
 * boundary the lazy table names, so the card can be graded without a render and the model can be
 * graded without a browser. `React.lazy` gives this file its own chunk.
 */
export default function CapstoneFrameLab() {
  return <BridgeLab spec={capstoneFrameLab} />;
}
