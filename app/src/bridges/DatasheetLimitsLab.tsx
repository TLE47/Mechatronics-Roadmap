import BridgeLab from './bridgeLabShell';
import { datasheetLimitsLab } from './datasheetLimits';

/**
 * The Bridge Notes lab for Lesson P.13 (`app/src/bridges/DatasheetLimitsLab.tsx`).
 *
 * All of the arithmetic, every number and every label lives in `datasheetLimits`; this is the React
 * boundary the lazy table names, so the card can be graded without a render and the model can be
 * graded without a browser. `React.lazy` gives this file its own chunk.
 */
export default function DatasheetLimitsLab() {
  return <BridgeLab spec={datasheetLimitsLab} />;
}
