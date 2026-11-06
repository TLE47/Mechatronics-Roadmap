import { ChevronRight, Sparkles } from 'lucide-react';

/**
 * The first-run guide's hide/show door (`runner/GuideToggle.tsx`).
 *
 * The full brief uses the quiet mono button; the phone strip needs a 44 px target, so the same
 * control has two shapes rather than two behaviours. Both name the same remembered cell, so folding
 * the guide on a laptop is not undone by opening the phone's lesson surface.
 */
export function GuideToggle({
  hidden,
  onToggle,
  phone = false,
}: {
  hidden: boolean;
  onToggle: () => void;
  phone?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      data-testid={phone ? 'btn-guide-toggle-phone' : 'btn-guide-toggle'}
      aria-pressed={!hidden}
      aria-controls="first-lesson-guide"
      title={hidden ? 'Show the first-run guide' : 'Hide the first-run guide'}
      className={
        phone
          ? 'btn min-h-[44px] shrink-0 px-2.5 text-[12.5px]'
          : 'min-h-[32px] shrink-0 cursor-pointer rounded border border-line bg-canvas px-2 py-1 font-mono text-[12px] text-muted hover:border-accent hover:text-accent'
      }
    >
      {phone ? (hidden ? 'Guide' : 'Hide') : hidden ? 'Show guide' : 'Hide guide'}
    </button>
  );
}

/** The phone's one-line offer when the guide is folded by its own disclosure, not by this switch. */
export function GuideOffer({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="btn-guide-open"
      className="flex w-full items-center gap-2 rounded-xl border border-emerald/50 bg-emerald/10 px-3 py-2.5 text-left text-[12.5px] text-body cursor-pointer"
    >
      <Sparkles className="h-3.5 w-3.5 shrink-0 text-emerald" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        First time here? The loop in three steps — starter, predict, finish line.
      </span>
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
    </button>
  );
}
