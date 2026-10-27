import React from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  ClipboardList,
  GraduationCap,
  Moon,
  ShieldCheck,
  Sparkles,
  UserRound,
  Wrench,
} from 'lucide-react';
import { buildDashboard, type DashboardEvent, type DashboardStudy } from '../../dashboardData';
import { buildHome } from '../../homeData';
import type { ReadingPosition } from '../../readingPosition';
import type { TabId } from '../../types';
import type { Award } from '../../gamification/rewards';
import { missionProgressForAll, verifiedMissionCount } from '../../gamification/missions';
import { currentNightShift, nightShiftLabel } from '../../gamification/nightShifts';
import { awardsOfKind, scrapShelf, scrapTotal } from '../../gamification/rewards';
import { REWARDS } from '../../content/loader';
import { Hologram } from '../../visuals/Hologram';
import { LevelBar } from '../game/LevelBar';
import { JourneyMap } from '../game/JourneyMap';
import { BlackBoxPage } from '../game/BlackBoxPage';
import { TodayPanel } from './TodayPanel';
import { LabsPanel, type LabCard } from './LabsPanel';
import { RoutePanel } from './RoutePanel';
import { ReviewPanel } from './ReviewPanel';
import { ToolsPanel } from './ToolsPanel';

export interface HomeDashboardProps {
  email: string | null;
  role: string | null;
  lessons: readonly { id: string; title: string }[];
  verified: Record<string, boolean>;
  completed: Record<string, boolean>;
  milestones: Record<string, boolean>;
  continueLesson: { id: string; reason: 'resume' | 'next' } | null;
  drafts: Record<string, string>;
  study: DashboardStudy;
  events: readonly DashboardEvent[];
  dueCards: number;
  awards: readonly Award[];
  workspaceSync: boolean;
  conflicts: number;
  syncNote: string;
  reading: Record<string, ReadingPosition>;
  labs: readonly LabCard[];
  focus: boolean;
  onOpenLesson: (id: string) => void;
  onOpenTab: (id: TabId) => void;
  onOpenRoute: () => void;
  onReview: () => void;
  onBack: () => void;
  /** The introduction, for the learner who wants to know what this place is before using it. */
  onOpenIntro: () => void;
  onOpenAccount: () => void;
  onOpenAdmin: () => void;
  onToggleFocus: () => void;
  onOpenCheatSheet: () => void;
  onExportPortfolio: () => void;
  onExportLog: () => void;
}

const card = 'rounded-xl border border-line bg-panel p-4 space-y-2.5';
const sectionHeading = 'flex items-center gap-1.5 text-sm font-bold text-ink';

/**
 * Home (`components/home/HomeDashboard.tsx`).
 *
 * One page for the questions a return visit actually has: what is next, where was I, which lab is
 * which, how far along am I, what is due, and where is my work kept. Every number comes from the
 * stores the workbench writes — there is no second progress model and no fetch on arrival — and the
 * page is a lazy chunk, so the first lesson pays nothing for it.
 *
 * It is deliberately not a gate. The workbench button is in the header row, every card is a door,
 * nothing is modal, and no reading of this page can lock a lesson, a hint or a lab. A deep link to a
 * lesson never lands here (`homeLanding.ts`).
 */
export const HomeDashboard: React.FC<HomeDashboardProps> = (props) => {
  const model = buildDashboard({
    lessons: props.lessons,
    verified: props.verified,
    completed: props.completed,
    milestones: props.milestones,
    continueLesson: props.continueLesson,
    drafts: props.drafts,
    study: props.study,
    events: props.events,
    dueCards: props.dueCards,
    account: {
      email: props.email,
      workspaceSync: props.workspaceSync,
      syncNote: props.syncNote,
      conflicts: props.conflicts,
    },
  });
  const home = buildHome({
    lessons: props.lessons,
    verified: props.verified,
    study: props.study,
    continueLesson: props.continueLesson,
    reading: props.reading,
  });

  const missions = missionProgressForAll(props.verified);
  const verifiedMissions = verifiedMissionCount(props.verified);
  const current = missions.find((mission) => !mission.verified) ?? missions[missions.length - 1];
  const week = currentNightShift(props.events, Date.now(), REWARDS.nightShifts.defaultTarget, REWARDS.nightShifts.weekStartsOn);
  const scrap = scrapTotal(props.awards);
  const shelf = scrapShelf(props.awards);
  const marks = awardsOfKind(props.awards, 'proof-mark');

  const startToday = () => {
    if (home.today.entryId) props.onOpenLesson(home.today.entryId);
    else props.onOpenRoute();
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 space-y-5" data-testid="home-dashboard">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={props.onBack}
              data-testid="btn-home-workbench"
              className="flex items-center gap-1 text-xs text-muted hover:text-ink cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Open the workbench
            </button>
            {/* A door beside the door: the page that explains the course should not be reachable
                only from the logo, which is already doing two other jobs on this screen. */}
            <span aria-hidden className="text-[10px] text-faint">
              ·
            </span>
            <button
              onClick={props.onOpenIntro}
              data-testid="btn-home-intro"
              className="text-xs text-muted underline decoration-dotted underline-offset-2 hover:text-ink cursor-pointer"
            >
              What is this?
            </button>
          </div>
          <h1 className="mt-1 flex items-center gap-2 text-xl font-bold text-ink">
            <Sparkles className="h-5 w-5 text-accent" aria-hidden="true" />
            Home
          </h1>
          <p className="mt-1 text-xs text-muted">
            {props.email ?? 'Not signed in — everything here is local to this browser.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={props.onOpenAccount}
            data-testid="btn-home-account-top"
            className="flex items-center gap-1.5 rounded-lg border border-line bg-raise px-3 py-2 text-xs font-semibold text-ink cursor-pointer hover:bg-elevate"
          >
            <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
            Account &amp; data
          </button>
          {props.role === 'admin' && (
            <button
              onClick={props.onOpenAdmin}
              data-testid="btn-home-admin"
              className="flex items-center gap-1.5 rounded-lg border border-line bg-panel px-3 py-2 text-xs font-semibold text-ink cursor-pointer hover:bg-raise"
            >
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Admin area
            </button>
          )}
        </div>
      </div>

      {/* `items-start`: the two cards are as tall as their own content. Stretched, the short Today
          card wore 230 px of empty panel under its button whenever the mission had no next check to
          name, which read as a card that had failed to load. */}
      <div className="grid items-start gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <TodayPanel
          today={home.today}
          due={model.review.due}
          onStart={startToday}
          onReview={props.onReview}
        />
        <section className={`${card} self-start p-3.5`} data-testid="dashboard-hologram">
          <div className={sectionHeading}>
            <Wrench className="h-4 w-4 text-accent" aria-hidden="true" />
            Your arm
          </div>
          <Hologram compact title="Your arm" />
          <p className="text-[11px] text-muted">
            {verifiedMissions} of {missions.length} missions verified. Drag to orbit, pose either joint, or press
            Demo. Nothing here is locked: the arm is the one the lessons are about.
          </p>
        </section>
      </div>

      <LevelBar
        verifiedMissions={verifiedMissions}
        checkpoints={{ verifiedCount: current?.verifiedCount ?? 0, total: current?.total ?? 0 }}
        missionName={current?.mission.name}
      />

      <section className={`${card} border-accent/40`} data-testid="home-continue">
        <div className={sectionHeading}>
          <BookOpenCheck className="h-4 w-4 text-accent" aria-hidden="true" />
          Continue
        </div>
        {model.continueLesson ? (
          <>
            <div className="text-base font-semibold text-ink">{model.continueLesson.title}</div>
            <p className="text-xs text-muted">
              {model.continueLesson.reason === 'resume'
                ? 'The lesson you stopped on.'
                : 'The first lesson still open on your route.'}
              {home.reading?.stoppedAt ? ` You were at “${home.reading.stoppedAt}”.` : ''}
              {model.continueLesson.hasDraft
                ? ` Your draft is here — ${model.continueLesson.chars.toLocaleString()} characters.`
                : ' No draft yet.'}
            </p>
            <button
              onClick={() => props.onOpenLesson(model.continueLesson!.id)}
              data-testid="btn-home-continue"
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-bold text-inverse cursor-pointer hover:bg-accent/80"
            >
              Open the lesson
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </>
        ) : (
          <p className="text-xs text-body">
            Nothing to resume. Pick a lesson from the route — the workbench remembers where you are.
          </p>
        )}
      </section>

      <LabsPanel labs={props.labs} onOpenTab={props.onOpenTab} />

      <RoutePanel route={home.route} onOpenRoute={props.onOpenRoute} />

      <div className="grid gap-4 sm:grid-cols-2">
        <ReviewPanel
          due={model.review.due}
          notes={home.notes}
          onReview={props.onReview}
          onOpenLesson={props.onOpenLesson}
        />

        <section className={card} data-testid="dashboard-progress">
          <h2 className={sectionHeading}>
            <GraduationCap className="h-4 w-4 text-accent" aria-hidden="true" />
            Progress
          </h2>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              ['Verified', model.progress.verified],
              ['Marked done', model.progress.completed],
              ['Milestones', model.progress.milestones],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-lg border border-line-soft bg-canvas py-2">
                <div className="text-lg font-bold text-ink">{value}</div>
                <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
              </div>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-3" data-testid="mission-control-lab">
            <div className="rounded-lg border border-line-soft bg-canvas px-2.5 py-2">
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted">
                <Moon className="h-3 w-3" aria-hidden="true" />
                This week
              </div>
              <div className="text-[12.5px] font-semibold text-ink" data-testid="lab-night-shifts">
                {nightShiftLabel(week)}
              </div>
            </div>
            <div className="rounded-lg border border-line-soft bg-canvas px-2.5 py-2">
              <div className="text-[11px] uppercase tracking-wide text-muted">Scrap</div>
              <div className="text-[12.5px] font-semibold text-ink" data-testid="lab-scrap">
                {scrap} piece{scrap === 1 ? '' : 's'}
              </div>
              <p className="text-[11px] text-muted">
                {shelf.length === 0 ? 'Named achievements drop Scrap.' : shelf.map((row) => row.label).join(' · ')}
              </p>
            </div>
            <div className="rounded-lg border border-line-soft bg-canvas px-2.5 py-2">
              <div className="text-[11px] uppercase tracking-wide text-muted">Proof marks</div>
              <div className="text-[12.5px] font-semibold text-ink" data-testid="lab-proof-marks">
                {marks.length} of {REWARDS.proofMarks.length}
              </div>
            </div>
          </div>
          <p className="text-[11px] text-muted">
            {model.progress.totalLessons} lessons and exercises are listed in the runner; milestones are the
            roadmap checkboxes. Neon never moves a level.
          </p>
        </section>
      </div>

      <section className={`${card} p-3.5`}>
        <JourneyMap
          progress={missions}
          verifiedMissions={verifiedMissions}
          verified={props.verified}
          onOpenLesson={props.onOpenLesson}
        />
      </section>

      <section className={`${card} p-3.5`}>
        <BlackBoxPage verifiedMissions={verifiedMissions} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <ToolsPanel
          email={props.email}
          syncNote={props.syncNote}
          focus={props.focus}
          onToggleFocus={props.onToggleFocus}
          onOpenAccount={props.onOpenAccount}
          onOpenCheatSheet={props.onOpenCheatSheet}
          onExportPortfolio={props.onExportPortfolio}
          onExportLog={props.onExportLog}
        />

        <section className={card} data-testid="home-saved">
          <h2 className={sectionHeading}>
            <ClipboardList className="h-4 w-4 text-accent" aria-hidden="true" />
            Saved work
          </h2>
          <p className="text-sm text-ink">
            {model.saved.length} draft{model.saved.length === 1 ? '' : 's'} · {model.study.notes} note
            {model.study.notes === 1 ? '' : 's'} · {model.study.highlights} highlight
            {model.study.highlights === 1 ? '' : 's'}
          </p>
          {model.saved.length > 0 && (
            <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-body">
              {model.saved.slice(0, 8).map((row) => (
                <li key={row.id}>
                  <button
                    onClick={() => props.onOpenLesson(row.id)}
                    className="text-left cursor-pointer hover:text-accent"
                  >
                    {row.title}
                    <span className="text-muted"> · {row.chars.toLocaleString()} chars</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {model.account.conflicts > 0 && (
            <p className="text-[11px] text-amber" data-testid="home-conflicts">
              {model.account.conflicts} version{model.account.conflicts === 1 ? '' : 's'} kept from a sync
              conflict — both copies are on this device and in your account export.
            </p>
          )}
        </section>
      </div>

      <section className={card} data-testid="home-recent">
        <h2 className={sectionHeading}>
          <ClipboardList className="h-4 w-4 text-accent" aria-hidden="true" />
          Recent study
        </h2>
        {model.recent.length === 0 ? (
          <p className="text-xs text-muted">No lessons opened yet in this browser.</p>
        ) : (
          <ul className="space-y-1.5 text-xs text-body">
            {model.recent.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2">
                <button
                  onClick={() => props.onOpenLesson(row.id)}
                  className="text-left cursor-pointer hover:text-accent"
                >
                  {row.title}
                </button>
                <span className="text-[11px] text-muted">
                  {row.kind.replace(/_/g, ' ')} · {new Date(row.at).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[11px] text-muted">
          Times are this browser&apos;s clock, merged with the account&apos;s log when signed in.
        </p>
      </section>
    </div>
  );
};
