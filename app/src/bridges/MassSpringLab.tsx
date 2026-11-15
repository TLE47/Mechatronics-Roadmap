import BridgeLab from './bridgeLabShell';
import { massSpringLab } from './massSpring';

/**
 * The Bridge Notes lab for Lesson 00.2 (`app/src/bridges/MassSpringLab.tsx`).
 *
 * All of the arithmetic, every number and every label lives in `massSpring`; this is the React
 * boundary the lazy table names, so the card can be graded without a render and the model can be
 * graded without a browser. `React.lazy` gives this file its own chunk.
 */
export default function MassSpringLab() {
  return <BridgeLab spec={massSpringLab} />;
}
