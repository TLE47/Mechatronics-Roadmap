import BridgeLab from './bridgeLabShell';
import { signFlipLab } from './signFlip';

/**
 * The Bridge Notes lab for Lesson 00.3 (`app/src/bridges/SignFlipLab.tsx`).
 *
 * All of the arithmetic, every number and every label lives in `signFlip`; this is the React
 * boundary the lazy table names, so the card can be graded without a render and the model can be
 * graded without a browser. `React.lazy` gives this file its own chunk.
 */
export default function SignFlipLab() {
  return <BridgeLab spec={signFlipLab} />;
}
