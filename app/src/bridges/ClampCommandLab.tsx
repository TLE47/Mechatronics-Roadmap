import BridgeLab from './bridgeLabShell';
import { clampCommandLab } from './clampCommand';

/**
 * The P-track Bridge Notes lab for this lesson (`app/src/bridges/ClampCommandLab.tsx`).
 *
 * All of the arithmetic, every number and every label lives in `clampCommand.ts`; this is the
 * React boundary the lazy table names, so the card can be graded without a render and the model can
 * be graded without a browser. `React.lazy` gives this file its own chunk.
 */
export default function ClampCommandLab() {
  return <BridgeLab spec={clampCommandLab} />;
}
