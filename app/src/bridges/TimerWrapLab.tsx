import BridgeLab from './bridgeLabShell';
import { timerWrapLab } from './timerWrap';

/**
 * The Bridge Notes lab for Lesson 04.1 (`app/src/bridges/TimerWrapLab.tsx`).
 *
 * All of the arithmetic, every number and every label lives in `timerWrap`; this is the React
 * boundary the lazy table names, so the card can be graded without a render and the model can be
 * graded without a browser. `React.lazy` gives this file its own chunk.
 */
export default function TimerWrapLab() {
  return <BridgeLab spec={timerWrapLab} />;
}
