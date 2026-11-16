import BridgeLab from './bridgeLabShell';
import { pidWindupLab } from './pidWindup';

/**
 * The Bridge Notes lab for Lesson 05.1 (`app/src/bridges/PidWindupLab.tsx`).
 *
 * All of the arithmetic, every number and every label lives in `pidWindup`; this is the React
 * boundary the lazy table names, so the card can be graded without a render and the model can be
 * graded without a browser. `React.lazy` gives this file its own chunk.
 */
export default function PidWindupLab() {
  return <BridgeLab spec={pidWindupLab} />;
}
