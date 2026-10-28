import React from 'react';
import { Download, FileJson, Focus, Printer, ShieldCheck, Volume2 } from 'lucide-react';
import { BackupControls } from '../BackupControls';
import { SoundControl } from '../SoundControl';

export interface ToolsPanelProps {
  email: string | null;
  syncNote: string;
  focus: boolean;
  onToggleFocus: () => void;
  onOpenAccount: () => void;
  onOpenCheatSheet: () => void;
  onExportPortfolio: () => void;
  onExportLog: () => void;
}

/**
 * The things that are not a lesson (`components/home/ToolsPanel.tsx`).
 *
 * Every control here already exists in the header; the copies are deliberate and cheap because Home
 * is a whole page and its promise is that nothing needs a hunt. The two stateful ones — the sound
 * switch and the backup buttons — take a test-id suffix so the page has one `home-sound` and one
 * `home-backup-*` rather than a second `btn-sound-toggle` that a browser suite cannot address.
 */
export const ToolsPanel: React.FC<ToolsPanelProps> = ({
  email,
  syncNote,
  focus,
  onToggleFocus,
  onOpenAccount,
  onOpenCheatSheet,
  onExportPortfolio,
  onExportLog,
}) => (
  <section data-testid="home-tools" className="rounded-xl border border-line bg-panel p-4 space-y-2.5">
    <h2 className="flex items-center gap-1.5 text-sm font-bold text-ink">
      <ShieldCheck className="h-4 w-4 text-accent" aria-hidden="true" />
      Workspace &amp; tools
    </h2>
    <p className="text-[11.5px] text-muted">
      {email ? `Signed in as ${email}. ` : 'Everything here is in this browser. '}
      {syncNote || 'An account is optional — progress, drafts, notes and checklists never leave unless you ask.'}
    </p>
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        onClick={onOpenAccount}
        data-testid="btn-home-account"
        className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-raise px-2.5 py-1.5 text-xs font-semibold text-ink cursor-pointer hover:bg-elevate"
      >
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
        Account &amp; sync
      </button>
      <button
        onClick={onExportPortfolio}
        data-testid="btn-home-export-progress"
        className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-raise px-2.5 py-1.5 text-xs font-semibold text-ink cursor-pointer hover:bg-elevate"
      >
        <Download className="h-3.5 w-3.5" aria-hidden="true" />
        Progress (.md)
      </button>
      <button
        onClick={onExportLog}
        data-testid="btn-home-export-log"
        className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-raise px-2.5 py-1.5 text-xs font-semibold text-ink cursor-pointer hover:bg-elevate"
      >
        <FileJson className="h-3.5 w-3.5" aria-hidden="true" />
        Learning log
      </button>
      <button
        onClick={onOpenCheatSheet}
        data-testid="btn-home-cheatsheet"
        className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-raise px-2.5 py-1.5 text-xs font-semibold text-ink cursor-pointer hover:bg-elevate"
      >
        <Printer className="h-3.5 w-3.5" aria-hidden="true" />
        Cheat sheet
      </button>
    </div>
    <div className="flex flex-wrap items-center gap-1.5 border-t border-line-soft pt-2.5">
      <span className="inline-flex items-center gap-1 text-[11px] text-muted">
        <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
        Sound
      </span>
      <SoundControl testIdSuffix="home" />
      <button
        onClick={onToggleFocus}
        data-testid="btn-home-focus"
        aria-pressed={focus}
        className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-raise px-2.5 py-1.5 text-xs font-semibold text-ink cursor-pointer hover:bg-elevate"
      >
        <Focus className="h-3.5 w-3.5" aria-hidden="true" />
        {focus ? 'Leave focus' : 'Focus mode'}
      </button>
    </div>
    <div className="flex flex-wrap items-center gap-1.5 border-t border-line-soft pt-2.5">
      <span className="text-[11px] text-muted">Everything, out and back:</span>
      <BackupControls testIdSuffix="home" />
    </div>
  </section>
);
