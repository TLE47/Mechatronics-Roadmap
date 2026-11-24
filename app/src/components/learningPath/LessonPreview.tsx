import React from 'react';
import { Check, Lock } from 'lucide-react';
import type { PathNode } from '../../learningPath';
import { stateLabel } from '../../learningPath';
import { regionOf } from '../../learningPathRegions';

/**
 * The lesson preview (`app/src/components/learningPath/LessonPreview.tsx`).
 *
 * One body, two frames: an anchored card on desktop and the shared `Sheet` on a phone. The body
 * prints only what this repository can prove — the goal, the region, the pass-check count and the
 * state — and names the missing prerequisite when the platform is locked. XP, stars and an
 * estimated duration are deliberately absent: the curriculum has no such fields, and inventing
 * them would be a second reward model.
 */

interface PreviewBodyProps {
  node: PathNode;
  onStart: (lessonId: string) => void;
}

export const LessonPreviewBody: React.FC<PreviewBodyProps> = ({ node, onStart }) => {
  const locked = node.state === 'locked';
  const region = regionOf(node.region);
  return (
    <div className="lp-preview-body">
      <p className="lp-preview-kicker">
        Lesson {node.index} · {region.label}
      </p>
      <h3 className="lp-preview-title" data-testid="lp-preview-title">
        {node.lesson.title}
      </h3>
      <p className="lp-preview-state" data-state={node.state}>
        {node.state === 'completed' && <Check className="lp-preview-icon" aria-hidden="true" />}
        {locked && <Lock className="lp-preview-icon" aria-hidden="true" />}
        <span data-testid="lp-preview-state">{stateLabel(node.state)}</span>
      </p>
      <p className="lp-preview-goal">{node.lesson.goal}</p>
      <p className="lp-preview-meta">
        {node.lesson.requirements.length} pass checks
        {node.state === 'completed' ? ' · verified on this device' : ''}
      </p>
      {locked && (
        <p className="lp-preview-prereq" data-testid="lp-preview-prereq">
          Verify <strong>{node.prerequisite}</strong> first. A locked platform opens this preview
          only; the lesson itself is still one press away in the runner.
        </p>
      )}
      <div className="lp-preview-actions">
        <button
          type="button"
          className="lp-action"
          data-testid="lp-preview-action"
          data-kind={node.action.kind}
          disabled={locked}
          onClick={() => onStart(node.lesson.id)}
        >
          {node.action.label}
        </button>
      </div>
    </div>
  );
};

interface CardProps extends PreviewBodyProps {
  x: number;
  y: number;
  onClose: () => void;
}

/** The desktop frame: a card placed beside the platform, never over the header. */
export const LessonPreviewCard: React.FC<CardProps> = ({ x, y, onClose, ...body }) => (
  <>
    <div className="lp-scrim" onClick={onClose} aria-hidden="true" />
    <div
      className="lp-preview"
      role="dialog"
      aria-label={body.node.lesson.title}
      data-testid="lp-preview-card"
      style={{ left: `${x}px`, top: `${y}px` }}
    >
      <button
        type="button"
        className="lp-preview-close"
        onClick={onClose}
        aria-label="Close the lesson preview"
        data-testid="lp-preview-close"
      >
        ×
      </button>
      <LessonPreviewBody {...body} />
    </div>
  </>
);
