import React from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  CalendarClock,
  ClipboardList,
  GraduationCap,
  Moon,
  ShieldCheck,
  Sparkles,
  UserRound,
  Wrench,
} from 'lucide-react';
import { buildDashboard, type DashboardEvent, type DashboardStudy } from '../dashboardData';
import { LevelBar } from './game/LevelBar';
import { JourneyMap } from './game/JourneyMap';
import { BlackBoxPage } from './game/BlackBoxPage';
import { missionProgressForAll, verifiedMissionCount } from '../gamification/missions';
import { currentNightShift, nightShiftLabel } from '../gamification/nightShifts';
import { awardsOfKind, scrapShelf, scrapTotal, type Award } from '../gamification/rewards';
import { REWARDS } from '../content/loader';

export interface LearnerDashboardProps {
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
  /** The award ledger: the achievement wall, the Scrap shelf and the proof marks. */
  awards: readonly Award[];
  workspaceSync: boolean;
  conflicts: number;
  syncNote: string;
  onOpenLesson: (id: string) => void;
  onBack: () => void;
  onOpenAccount: () => void;
  onOpenAdmin: () => void;
}

const card = 'rounded-xl border border-line bg-panel p-4 space-y-2.5';
const heading = 'flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted';

/**
 * The signed-in learner's home base: one next action, then the evidence behind it.
 *
 * It is a page inside the workbench, not a gate in front of it: the back button returns to the same
 * lesson that was open, every number is read from the stores the workbench already keeps, and nothing
 * here is required to keep learning. A signed-out visitor can open it too — it just offers the
 * account panel instead of a name.
 */
export const LearnerDashboard: React.FC<LearnerDashboardProps> = (props) => {
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

  // The lab's own numbers, from the same stores the workbench writes: missions and checks for the
  // level, the log for this week's night shifts, the ledger for Scrap and the marks.
  const missions = missionProgressForAll(props.verified);
  const verifiedMissions = verifiedMissionCount(props.verified);
  const current = missions.find((mission) => !mission.verified) ?? missions[missions.length - 1];
  const week = currentNightShift(
    props.events,
    Date.now(),
    REWARDS.nightShifts.defaultTarget,
    REWARDS.nightShifts.weekStartsOn
  );
  const scrap = scrapTotal(props.awards);
  const shelf = scrapShelf(props.awards);
  const marks = awardsOfKind(props.awards, 'proof-mark');

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-5" data-testid="learner-dashboard">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button
            onClick={props.onBack}
            data-testid="btn-dashboard-back"
            className="text-[11px] text-muted hover:text-ink flex items-center gap-1 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to the workbench
          </button>
          <h1 className="text-xl font-bold text-ink mt-1 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-accent" />
            {props.email ? 'Your dashboard' : 'Your progress in this browser'}
          </h1>
          <p className="text-xs text-muted mt-1">{props.email ?? 'Not signed in — everything here is local.'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={props.onOpenAccount}
            data-testid="btn-dashboard-account"
            className="bg-raise hover:bg-elevate text-ink text-xs font-semibold px-3 py-2 rounded-lg border border-line flex items-center gap-1.5 cursor-pointer"
          >
            <UserRound className="w-3.5 h-3.5" />
            Account &amp; data
          </button>
          {props.role === 'admin' && (
            <button
              onClick={props.onOpenAdmin}
              data-testid="btn-dashboard-admin"
              className="bg-panel hover:bg-raise text-ink text-xs font-semibold px-3 py-2 rounded-lg border border-line flex items-center gap-1.5 cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Admin area
            </button>
          )}
        </div>
      </div>

      <LevelBar
        verifiedMissions={verifiedMissions}
        checkpoints={{ verifiedCount: current?.verifiedCount ?? 0, total: current?.total ?? 0 }}
        missionName={current?.mission.name}
      />

      <section className={card} data-testid="mission-control-lab">
        <div className={heading}>
          <Wrench className="w-3.5 h-3.5" />
          Your lab
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg bg-canvas border border-line-soft px-2.5 py-2">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted">
              <Moon className="w-3 h-3" aria-hidden="true" />
              This week
            </div>
            <div className="text-[13px] font-semibold text-ink" data-testid="lab-night-shifts">
              {nightShiftLabel(week)}
            </div>
            <p className="text-[11px] text-muted">A run or a verify counts. Missing a day erases nothing.</p>
          </div>
          <div className="rounded-lg bg-canvas border border-line-soft px-2.5 py-2">
            <div className="text-[11px] uppercase tracking-wide text-muted">Scrap</div>
            <div className="text-[13px] font-semibold text-ink" data-testid="lab-scrap">
              {scrap} piece{scrap === 1 ? '' : 's'}
            </div>
            <p className="text-[11px] text-muted">
              {shelf.length === 0 ? 'Named achievements drop Scrap.' : shelf.map((row) => row.label).join(' · ')}
            </p>
          </div>
          <div className="rounded-lg bg-canvas border border-line-soft px-2.5 py-2">
            <div className="text-[11px] uppercase tracking-wide text-muted">Proof marks</div>
            <div className="text-[13px] font-semibold text-ink" data-testid="lab-proof-marks">
              {marks.length} of {REWARDS.proofMarks.length}
            </div>
            <p className="text-[11px] text-muted">
              {marks.length === 0 ? 'How you learn, not how fast.' : marks.map((mark) => mark.label).join(' · ')}
            </p>
          </div>
        </div>
        <p className="text-[11px] text-muted">
          Neon relights the street outside; it never moves a level. Hints reduce nothing.
        </p>
      </section>

      <section className={`${card} border-accent/40`} data-testid="dashboard-continue">
        <div className={heading}>
          <BookOpenCheck className="w-3.5 h-3.5" />
          Continue
        </div>
        {model.continueLesson ? (
          <>
            <div className="text-base font-semibold text-ink">{model.continueLesson.title}</div>
            <p className="text-xs text-muted">
              {model.continueLesson.reason === 'resume'
                ? 'The lesson you stopped on.'
                : 'The first lesson still open on your route.'}
              {model.continueLesson.hasDraft
                ? ` Your draft is here — ${model.continueLesson.chars.toLocaleString()} characters.`
                : ' No draft yet.'}
            </p>
            <button
              onClick={() => props.onOpenLesson(model.continueLesson!.id)}
              data-testid="btn-dashboard-continue"
              className="bg-accent hover:bg-accent/80 text-inverse text-xs font-bold px-3.5 py-2 rounded-lg flex items-center gap-1.5 cursor-pointer"
            >
              Open the lesson
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </>
        ) : (
          <p className="text-xs text-body">
            Nothing to resume. Pick a lesson from the route — the workbench remembers where you are.
          </p>
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className={card} data-testid="dashboard-progress">
          <div className={heading}>
            <GraduationCap className="w-3.5 h-3.5" />
            Progress
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              ['Verified', model.progress.verified],
              ['Marked done', model.progress.completed],
              ['Milestones', model.progress.milestones],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-lg bg-canvas border border-line-soft py-2">
                <div className="text-lg font-bold text-ink">{value}</div>
                <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted">
            {model.progress.totalLessons} Python lessons and exercises are listed in the runner; milestones
            are the roadmap checkboxes.
          </p>
        </section>

        <section className={card} data-testid="dashboard-review">
          <div className={heading}>
            <CalendarClock className="w-3.5 h-3.5" />
            Review
          </div>
          <p className="text-sm text-ink" data-testid="dashboard-due">
            {model.review.due === 0
              ? 'Nothing due right now.'
              : `${model.review.due} card${model.review.due === 1 ? '' : 's'} due for review.`}
          </p>
          <p className="text-[11px] text-muted">
            Cards come from the highlights you saved while reading. Reviewing stays available from the
            workbench without an account.
          </p>
        </section>

        <section className={card} data-testid="dashboard-saved">
          <div className={heading}>
            <ClipboardList className="w-3.5 h-3.5" />
            Saved work
          </div>
          <p className="text-sm text-ink">
            {model.saved.length} draft{model.saved.length === 1 ? '' : 's'} · {model.study.notes} note
            {model.study.notes === 1 ? '' : 's'} · {model.study.highlights} highlight
            {model.study.highlights === 1 ? '' : 's'}
          </p>
          {model.saved.length > 0 && (
            <ul className="text-xs text-body space-y-1 max-h-40 overflow-y-auto">
              {model.saved.slice(0, 8).map((row) => (
                <li key={row.id}>
                  <button
                    onClick={() => props.onOpenLesson(row.id)}
                    className="text-left hover:text-accent cursor-pointer"
                  >
                    {row.title}
                    <span className="text-muted"> · {row.chars.toLocaleString()} chars</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {model.account.conflicts > 0 && (
            <p className="text-[11px] text-amber" data-testid="dashboard-conflicts">
              {model.account.conflicts} version{model.account.conflicts === 1 ? '' : 's'} kept from a sync
              conflict — both copies are on this device and in your account export.
            </p>
          )}
        </section>

        <section className={card} data-testid="dashboard-account">
          <div className={heading}>
            <ShieldCheck className="w-3.5 h-3.5" />
            Account &amp; sync
          </div>
          <p className="text-xs text-body">{model.account.syncNote || 'Progress is stored in this browser.'}</p>
          <p className="text-[11px] text-muted">
            {!model.account.email
              ? 'Nothing leaves this browser until you sign in. An account is optional.'
              : model.account.workspaceSync
                ? 'Progress, drafts and notes sync with your account.'
                : 'Progress syncs with your account; drafts and notes stay in this browser until you turn that on.'}
          </p>
          <button
            onClick={props.onOpenAccount}
            className="text-[11px] text-accent hover:underline cursor-pointer"
          >
            Export or delete my data
          </button>
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

      <section className={card} data-testid="dashboard-recent">
        <div className={heading}>
          <ClipboardList className="w-3.5 h-3.5" />
          Recent study
        </div>
        {model.recent.length === 0 ? (
          <p className="text-xs text-muted">No lessons opened yet in this browser.</p>
        ) : (
          <ul className="text-xs text-body space-y-1.5">
            {model.recent.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2">
                <button
                  onClick={() => props.onOpenLesson(row.id)}
                  className="text-left hover:text-accent cursor-pointer"
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
