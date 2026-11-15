import BridgeLab from './bridgeLabShell';
import { waterAnalogueLab } from './waterAnalogue';

/**
 * The Bridge Notes lab for Lesson S0.0 (`app/src/bridges/WaterAnalogueLab.tsx`).
 *
 * All of the arithmetic, every number and every label lives in `waterAnalogue`; this is the React
 * boundary the lazy table names, so the card can be graded without a render and the model can be
 * graded without a browser. `React.lazy` gives this file its own chunk.
 */
export default function WaterAnalogueLab() {
  return <BridgeLab spec={waterAnalogueLab} />;
}
