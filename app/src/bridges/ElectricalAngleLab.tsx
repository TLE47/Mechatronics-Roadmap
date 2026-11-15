import BridgeLab from './bridgeLabShell';
import { electricalAngleLab } from './electricalAngle';

/**
 * The Bridge Notes lab for Lesson 03.2 (`app/src/bridges/ElectricalAngleLab.tsx`).
 *
 * All of the arithmetic, every number and every label lives in `electricalAngle`; this is the React
 * boundary the lazy table names, so the card can be graded without a render and the model can be
 * graded without a browser. `React.lazy` gives this file its own chunk.
 */
export default function ElectricalAngleLab() {
  return <BridgeLab spec={electricalAngleLab} />;
}
