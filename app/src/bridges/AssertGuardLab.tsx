import BridgeLab from './bridgeLabShell';
import { assertGuardLab } from './assertGuard';

/**
 * The Bridge Notes lab for Lesson P.6 (`app/src/bridges/AssertGuardLab.tsx`).
 *
 * All of the arithmetic, every number and every label lives in `assertGuard`; this is the React
 * boundary the lazy table names, so the card can be graded without a render and the model can be
 * graded without a browser. `React.lazy` gives this file its own chunk.
 */
export default function AssertGuardLab() {
  return <BridgeLab spec={assertGuardLab} />;
}
