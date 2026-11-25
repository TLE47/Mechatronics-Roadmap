import React from 'react';
import { Check, Lock } from 'lucide-react';
import { stateLabel, type PathNode } from '../../learningPath.ts';
import type { DistrictTheme } from './CityScenery.tsx';
import { Landmark } from './Landmarks.tsx';

/**
 * One lesson platform (`app/src/components/learningPath/LessonNode.tsx`).
 *
 * This is the whole interactive city stop: the themed platform, its inline landmark, the state
 * ring and marks, the number/name label, and the Current flag. It deliberately has no wrapper:
 * the button is the positioned element, so the page's existing CSS, test ids and keyboard
 * behaviour stay exactly where they were.
 *
 * The page owns the path model, selection and the node-ref map. This component knows only what it
 * needs to paint a node: its derived `PathNode`, the district theme, its percentage position, the
 * total node count for the accessible label, and whether it is selected.
 */

export interface LessonNodeProps {
  node: PathNode;
  total: number;
  theme: DistrictTheme;
  x: number;
  y: number;
  selected: boolean;
  onSelect: (node: PathNode) => void;
  registerButton: (lessonId: string, element: HTMLButtonElement | null) => void;
}

export const LessonNode: React.FC<LessonNodeProps> = ({
  node,
  total,
  theme,
  x,
  y,
  selected,
  onSelect,
  registerButton,
}) => (
  <button
    type="button"
    ref={(element) => registerButton(node.lesson.id, element)}
    className="lp-node"
    data-state={node.state}
    data-district={node.district}
    data-theme={theme}
    data-testid={`lp-lesson-${node.lesson.id}`}
    aria-label={`Lesson ${node.index} of ${total}: ${node.lesson.title}. ${node.districtLabel}. ${stateLabel(node.state)}`}
    data-selected={selected ? 'true' : 'false'}
    style={{ left: `${x}%`, top: `${y}%` }}
    onClick={() => onSelect(node)}
  >
    <span className="lp-platform" data-theme={theme} aria-hidden="true">
      <span className="lp-platform-shadow" />
      <span className="lp-plaza" />
      <Landmark kind={node.landmark} locked={node.state === 'locked'} />
      <span className="lp-state-ring" />
      {node.state === 'completed' && (
        <>
          <span className="lp-spark lp-spark-a" />
          <span className="lp-spark lp-spark-b" />
          <span className="lp-spark lp-spark-c" />
          <Check className="lp-mark lp-mark-check" />
        </>
      )}
      {node.state === 'locked' && <Lock className="lp-mark lp-mark-lock" />}
    </span>
    <span className="lp-label">
      <span className="lp-number">{node.index}</span>
      <span className="lp-name">{node.lesson.title}</span>
    </span>
    {node.state === 'current' && <span className="lp-now">Current</span>}
  </button>
);
