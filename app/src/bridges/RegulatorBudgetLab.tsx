import BridgeLab from './bridgeLabShell';
import { regulatorBudgetLab } from './regulatorBudget';

/**
 * The Bridge Notes lab for Lesson 01.3 (`app/src/bridges/RegulatorBudgetLab.tsx`).
 *
 * All of the arithmetic, every number and every label lives in `regulatorBudget`; this is the React
 * boundary the lazy table names, so the card can be graded without a render and the model can be
 * graded without a browser. `React.lazy` gives this file its own chunk.
 */
export default function RegulatorBudgetLab() {
  return <BridgeLab spec={regulatorBudgetLab} />;
}
