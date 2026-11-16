import BridgeLab from './bridgeLabShell';
import { freqBitsLab } from './freqBits';

/**
 * The Bridge Notes lab for Lesson P.8 (`app/src/bridges/FreqBitsLab.tsx`).
 *
 * All of the arithmetic, every number and every label lives in `freqBits`; this is the React
 * boundary the lazy table names, so the card can be graded without a render and the model can be
 * graded without a browser. `React.lazy` gives this file its own chunk.
 */
export default function FreqBitsLab() {
  return <BridgeLab spec={freqBitsLab} />;
}
