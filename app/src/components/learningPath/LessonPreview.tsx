import React from 'react';
import { Check, Lock } from 'lucide-react';
import type { PathNode } from '../../learningPath.ts';
import { stateLabel } from '../../learningPath.ts';
import { regionOf } from '../../learningPathRegions.ts';

/**
 * The lesson preview (`app/src/components/learningPath/LessonPreview.tsx`).
 *
 * One body, two frames: an anchored card on desktop and the shared `Sheet` on a phone. The body
 * prints only what this repository can prove — the lesson's place in the whole path, its district,
 * its region, its module tier, the pass-check count and the state — and names the missing
 * prerequisite when the platform is locked. XP, stars and an estimated duration are deliberately
 * absent: the curriculum has no such fields, and inventing them would be a second reward model.
 */

interface PreviewBodyProps {
  node: PathNode;
  total: number;
  onStart: (lessonId: string) => void;
}

export const LessonPreviewBody: React.FC<PreviewBodyProps> = ({ node, total, onStart }) => {
  const locked = node.state === 'locked';
  const region = regionOf(node.region);
  return (
    <div className="lp-preview-body">
      <p className="lp-preview-kicker">
        Lesson {node.index} of {total} · {node.districtLabel}
      </p>
      <h3 className="lp-preview-title" data-testid="lp-preview-title">
        {node.lesson.title}
      </h3>
      <p className="lp-preview-state" data-state={node.state}>
        {node.state === 'completed' && <Check className="lp-preview-icon" aria-hidden="true" />}
        {locked && <Lock className="lp-preview-icon" aria-hidden="true" />}
        <span data-testid="lp-preview-state">{stateLabel(node.state)}</span>
        {node.tier !== null && (
          <span className="lp-preview-tier" data-testid="lp-preview-tier">
            Tier {node.tier}
          </span>
        )}
      </p>
      <p className="lp-preview-goal">{node.lesson.goal}</p>
      <p className="lp-preview-meta">
        {region.label} · {node.lesson.requirements.length} pass checks
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
