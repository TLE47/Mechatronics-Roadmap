import React, { useMemo } from 'react';
import katex from 'katex';

interface MathViewProps {
  math: string;
  block?: boolean;
  className?: string;
}

export const MathView: React.FC<MathViewProps> = ({ math, block = false, className = '' }) => {
  const html = useMemo(() => {
    try {
      return katex.renderToString(math, {
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
    <div className={`bg-[#080d1a] border border-[#1e293b] border-l-4 border-l-[#38bdf8] rounded-md p-3 mb-3 overflow-x-auto text-[0.86rem] text-[#f1f5f9] ${className}`}>
      <MathView math={math} block={true} />
    </div>
  );
};
