import BridgeLab from './bridgeLabShell';
import { beltGeometryLab } from './beltGeometry';

/**
 * The Bridge Notes lab for Lesson 02.5 (`app/src/bridges/BeltGeometryLab.tsx`).
 *
 * All of the arithmetic, every number and every label lives in `beltGeometry`; this is the React
 * boundary the lazy table names, so the card can be graded without a render and the model can be
 * graded without a browser. `React.lazy` gives this file its own chunk.
 */
export default function BeltGeometryLab() {
  return <BridgeLab spec={beltGeometryLab} />;
}
