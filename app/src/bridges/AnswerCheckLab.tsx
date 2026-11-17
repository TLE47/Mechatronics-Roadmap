import BridgeLab from './bridgeLabShell';
import { answerCheckLab } from './answerCheck';

/**
 * The Bridge Notes lab for Lesson P.14 (`app/src/bridges/AnswerCheckLab.tsx`).
 *
 * All of the arithmetic, every number and every label lives in `answerCheck`; this is the React
 * boundary the lazy table names, so the card can be graded without a render and the model can be
 * graded without a browser. `React.lazy` gives this file its own chunk.
 */
export default function AnswerCheckLab() {
  return <BridgeLab spec={answerCheckLab} />;
}
