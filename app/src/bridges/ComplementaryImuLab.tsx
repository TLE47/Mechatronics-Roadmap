import BridgeLab from './bridgeLabShell';
import { complementaryImuLab } from './complementaryImu';

/**
 * The Bridge Notes lab for Lesson 05.2 (`app/src/bridges/ComplementaryImuLab.tsx`).
 *
 * All of the arithmetic, every number and every label lives in `complementaryImu`; this is the
 * React boundary the lazy table names, so the card can be graded without a render and the model can
 * be graded without a browser. `React.lazy` gives this file its own chunk.
 */
export default function ComplementaryImuLab() {
  return <BridgeLab spec={complementaryImuLab} />;
}
