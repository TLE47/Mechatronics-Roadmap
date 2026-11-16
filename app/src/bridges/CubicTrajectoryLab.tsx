import BridgeLab from './bridgeLabShell';
import { cubicTrajectoryLab } from './cubicTrajectory';

/**
 * The Bridge Notes lab for Lesson 06.1 (`app/src/bridges/CubicTrajectoryLab.tsx`).
 *
 * All of the arithmetic, every number and every label lives in `cubicTrajectory`; this is the React
 * boundary the lazy table names, so the card can be graded without a render and the model can be
 * graded without a browser. `React.lazy` gives this file its own chunk.
 */
export default function CubicTrajectoryLab() {
  return <BridgeLab spec={cubicTrajectoryLab} />;
}
