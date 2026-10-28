import React, { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ChevronDown, Check } from 'lucide-react';
import type { TabId } from '../types';
import { Sheet } from './Sheet';
import { InstallOffer } from './InstallOffer';

/**
 * The workbench's twelve tabs on a phone (`components/PhoneTabPicker.tsx`).
 *
 * A twelve-item rail does not fit 390 px, and the rail that did fit was a horizontal scroller whose
 * last tabs were off-screen with no sign they existed. This is one row showing where you are and a
 * sheet listing every tab: all twelve are reachable, the current one is named in the header, and the
 * row costs 48 px instead of the rail's two lines.
 *
 * The rail stays at `md` and up. The picker is rendered by `App` and hidden from `md` by CSS, so a
 * resize does not depend on a React state update to choose between them.
 */
export interface PhoneTabItem {
  id: TabId;
  label: string;
  subtitle: string;
  Icon: LucideIcon;
}

export interface PhoneTabPickerProps {
  items: PhoneTabItem[];
  activeId: TabId;
  onSelect: (id: TabId) => void;
}

export const PhoneTabPicker: React.FC<PhoneTabPickerProps> = ({ items, activeId, onSelect }) => {
  const [open, setOpen] = useState(false);
  const active = items.find((item) => item.id === activeId) ?? items[0];
  if (!active) return null;
  const ActiveIcon = active.Icon;

  return (
    <div data-testid="phone-tab-nav" className="md:hidden">
      <button
        type="button"
        data-testid="btn-tab-picker"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Change workbench tab. Current tab: ${active.label}`}
        onClick={() => setOpen(true)}
        className="flex min-h-[48px] w-full items-center gap-2.5 px-3 py-1.5 text-left cursor-pointer hover:bg-raise"
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line bg-canvas text-accent">
          <ActiveIcon className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-ink">{active.label}</span>
          <span className="block truncate text-[11px] text-muted">{active.subtitle}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 rounded-full border border-line bg-canvas px-2 py-1 font-mono text-[10.5px] text-muted">
          Tabs
          <ChevronDown className="h-3 w-3" aria-hidden="true" />
        </span>
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Workbench tabs"
        testId="tab-picker-sheet"
        size="md"
        footer={<InstallOffer />}
      >
        <div className="grid grid-cols-1 gap-1 p-2 min-[380px]:grid-cols-2">
          {items.map((item) => {
            const Icon = item.Icon;
            const selected = item.id === activeId;
            return (
              <button
                key={item.id}
                type="button"
                data-testid={`tab-picker-item-${item.id}`}
                aria-current={selected ? 'page' : undefined}
                onClick={() => {
                  setOpen(false);
                  onSelect(item.id);
                }}
                className={`flex min-h-[56px] items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left cursor-pointer ${
                  selected
                    ? 'border-accent/60 bg-accent/10 text-ink'
                    : 'border-line-soft bg-canvas text-body hover:bg-raise'
                }`}
              >
                <span
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border ${
                    selected ? 'border-accent/50 text-accent' : 'border-line text-muted'
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-semibold">{item.label}</span>
                  <span className="block truncate text-[11px] font-normal text-muted">
                    {item.subtitle}
                  </span>
                </span>
                {selected && <Check className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </Sheet>
    </div>
  );
};
