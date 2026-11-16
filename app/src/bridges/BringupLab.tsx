import BridgeLab from './bridgeLabShell';
import { bringupLab } from './bringup';

/**
 * The Bridge Notes lab for Lesson 07.1 (`app/src/bridges/BringupLab.tsx`).
 *
 * All of the arithmetic, every number and every label lives in `bringup`; this is the React
 * boundary the lazy table names, so the card can be graded without a render and the model can be
 * graded without a browser. `React.lazy` gives this file its own chunk.
 */
export default function BringupLab() {
  return <BridgeLab spec={bringupLab} />;
}
