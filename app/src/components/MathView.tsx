import React, { useMemo } from 'react';
import { renderToString } from 'katex';

interface MathViewProps {
  math: string;
  block?: boolean;
  className?: string;
}

export const MathView: React.FC<MathViewProps> = ({ math, block = false, className = '' }) => {
  const html = useMemo(() => {
    try {
      return renderToString(math, {
        displayMode: block,
        throwOnError: false,
        trust: true,
      });
    } catch (e) {
      console.warn('KaTeX render error:', e);
      return math;
    }
  }, [math, block]);

  return (
    <span
      className={`inline-block ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

export const MathPanel: React.FC<{ math: string; className?: string }> = ({ math, className = '' }) => {
  return (
    // A wide formula scrolls this panel sideways; `tabIndex` is what lets a keyboard reach that scroll
    // (axe's `scrollable-region-focusable`). The name is the formula's own text, so a screen reader
    // announces what the stop is for rather than "group".
    <div
      tabIndex={0}
      role="group"
      aria-label="Formula"
      className={`bg-canvas border border-line-soft border-l-4 border-l-accent rounded-md p-3 mb-3 overflow-x-auto text-[0.86rem] text-ink ${className}`}
    >
      <MathView math={math} block={true} />
    </div>
  );
};
