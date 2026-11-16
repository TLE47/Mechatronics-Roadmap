import BridgeLab from './bridgeLabShell';
import { orderOfOperationsLab } from './orderOfOperations';

/**
 * The P-track Bridge Notes lab for this lesson (`app/src/bridges/OrderOfOperationsLab.tsx`).
 *
 * All of the arithmetic, every number and every label lives in `orderOfOperations.ts`; this is the
 * React boundary the lazy table names, so the card can be graded without a render and the model can
 * be graded without a browser. `React.lazy` gives this file its own chunk.
 */
export default function OrderOfOperationsLab() {
  return <BridgeLab spec={orderOfOperationsLab} />;
}
