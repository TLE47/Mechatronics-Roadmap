import {
  Calculator,
  ClipboardList,
  Flag,
  GitBranch,
  GitMerge,
  HelpCircle,
  LogIn,
  Repeat,
  ShieldCheck,
  Sigma,
  SquareTerminal,
  TestTube2,
  Wand2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { KIND_META, type StepKind, type WorkflowIcon } from '../workflow.ts';

/**
 * `kindMeta[kind].icon` names a glyph; this is the only place a name becomes a component.
 *
 * Keys are glyph names rather than card kinds, so adding a kind never means editing a second
 * per-kind table — it picks an existing glyph or adds one here.
 */
const ICONS: Record<WorkflowIcon, LucideIcon> = {
  clipboard: ClipboardList,
  help: HelpCircle,
  sigma: Sigma,
  calculator: Calculator,
  shield: ShieldCheck,
  flag: Flag,
  'log-in': LogIn,
  wand: Wand2,
  branch: GitBranch,
  repeat: Repeat,
  'test-tube': TestTube2,
  terminal: SquareTerminal,
  merge: GitMerge,
};

export function iconForKind(kind: StepKind): LucideIcon {
  return ICONS[KIND_META[kind].icon];
}
