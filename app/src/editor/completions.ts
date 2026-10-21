import type { CompletionContext, CompletionSource } from '@codemirror/autocomplete';
import {
  completionStart,
  lineColumnAt,
  toCompletionOptions,
  type AnalysisSession,
} from '../analysisClient';

/**
 * The editor's completion source: Jedi when the interpreter is up, keywords when it is not.
 *
 * The fallback is the source the editor shipped with (Python keywords plus the names this document
 * defines), and it stays the answer in three cases that are all normal rather than edge cases: the
 * runtime is still downloading, the page is offline and the analyzers were never installed, or the
 * worker did not answer in time. A completion list that suddenly stops appearing while Python warms
 * up would be worse than a modest one.
 *
 * `from` is computed here rather than taken from CodeMirror's word match, because `math.ac` has to
 * become `math.acos`: replacing the whole `math.ac` span would produce `acos` and lose the module.
 */
export function pythonCompletionSource(
  getSession: () => AnalysisSession | null,
  fallback: CompletionSource
): CompletionSource {
  return async (context: CompletionContext) => {
    const word = context.matchBefore(/[A-Za-z_][\w.]*/);
    if (!word && !context.explicit) return null;

    const session = getSession();
    if (!session) return fallback(context);

    const code = context.state.doc.toString();
    const { line, column } = lineColumnAt(code, context.pos);
    const reply = await session.complete({ code, line, column });
    if (!reply.ok || reply.value.length === 0) return fallback(context);

    return {
      from: completionStart(code, context.pos),
      options: toCompletionOptions(reply.value),
      // A dot or a new word re-runs the source; anything else keeps the list on screen.
      validFor: /^[\w$]*$/,
    };
  };
}
