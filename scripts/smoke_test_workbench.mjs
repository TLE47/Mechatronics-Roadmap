#!/usr/bin/env node
/**
 * Automated Browser/DOM & SSR Smoke Test Suite for the MechaLab Workbench
 * (`scripts/smoke_test_workbench.mjs`)
 *
 * Uses Vite's SSR module loader + ReactDOMServer to mount and verify:
 * 1. Beginner View (default plain-English 6-tab navigation) vs. Advanced View (all 12 technical labs).
 * 2. In-Browser Python Lesson Runner (`TabPyodideRunner`): the whole generated lesson + exercise
 *    dataset, starter code,
 *    3-step hint ladder, search/filter UI, and completion state rendering.
 * 3. Prerequisite Placement Quiz (`TabPlacementQuiz`): 8 skip-gate checkpoints, dependency-graph
 *    first-gap recommendation logic, and valid lesson/tab routing targets.
 * 4. Persistent Progress & Markdown Portfolio Export (`localStorage` + `buildPortfolioMarkdown`).
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { createServer } from 'vite';

/** Minimal DOM / localStorage polyfill for SSR smoke testing (installed, not imported for effect). */
function installDomShim() {
  const storageMap = new Map();
  globalThis.localStorage = {
    getItem: (key) => (storageMap.has(key) ? storageMap.get(key) : null),
    setItem: (key, val) => storageMap.set(key, String(val)),
    removeItem: (key) => storageMap.delete(key),
    clear: () => storageMap.clear(),
  };
  globalThis.window = globalThis;
}

/**
 * `viteServer` is optional. The combined runner (`scripts/test_workbench.mjs`) starts one dev
 * server for all three suites and passes it in, so this suite transforms the app through the same
 * module graph the browser suites use instead of booting a second Vite. Run on its own
 * (`npm run test:smoke`) it creates and closes its own server, exactly as before.
 */
export async function runSmokeTests(viteServer) {
  const repoRoot = process.cwd();
  installDomShim();
  // The same read `vite.config.ts` makes: `package.json` is the release identity. The inline server
  // this suite boots does not load the project config (it is an SSR render, not a browser), so the
  // define is passed here too - and the check below then proves the footer reads that value.
  const releaseVersion = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')
  ).version;
  const vite =
    viteServer ??
    (await createServer({
      root: path.join(repoRoot, 'app'),
      define: { __APP_VERSION__: JSON.stringify(releaseVersion) },
      server: { middlewareMode: true },
      appType: 'custom',
      logLevel: 'error',
    }));

  try {
    const appMod = await vite.ssrLoadModule('/src/App.tsx');
    const runnerMod = await vite.ssrLoadModule('/src/components/tabs/TabPyodideRunner.tsx');
    const quizMod = await vite.ssrLoadModule('/src/components/tabs/TabPlacementQuiz.tsx');
    const linkMod = await vite.ssrLoadModule('/src/components/tabs/TabLinkHealth.tsx');
    const archMod = await vite.ssrLoadModule('/src/components/tabs/TabArchitecture.tsx');
    const lessonsMod = await vite.ssrLoadModule('/src/data/pythonLessonsData.ts');
    const { coachForLesson } = await vite.ssrLoadModule('/src/lessonCoach.ts');
    const historyMod = await vite.ssrLoadModule('/src/data/linkHistoryData.ts');

    const {
      App,
      WORKBENCH_TABS,
      buildPortfolioMarkdown,
      STORAGE_KEY_VIEW_MODE,
      STORAGE_KEY_MILESTONES,
    } = appMod;
    const {
      TabPyodideRunner,
      STORAGE_KEY_VERIFIED,
      STORAGE_KEY_COMPLETED,
      STORAGE_KEY_FIRST_GUIDE,
    } = runnerMod;
    const { TabArchitecture } = archMod;
    const {
      TabPlacementQuiz,
      PLACEMENT_QUESTIONS,
      SCHOOL_MATH_DIAGNOSTIC,
      TIER1_EXIT_GATES,
    } = quizMod;
    const { PYTHON_LESSONS } = lessonsMod;
    const { STORAGE_KEY_START_HERE_DISMISSED } = await vite.ssrLoadModule('/src/startHere.ts');
    // The registry mixes hand-written lessons with one entry per graded exercise, so its size grows
    // with every package. A literal here is how CI went red on a push that added exercise packages
    // and touched no app code: every tally below is derived from the dataset instead.
    const TOTAL = PYTHON_LESSONS.length;

    // 1. Verify Beginner View (default) vs. Advanced View (all 12 technical labs)
    const cleanSsr = (html) => html.replace(/<!--\s*-->/g, '');
    globalThis.localStorage.clear();
    const htmlBeginner = cleanSsr(ReactDOMServer.renderToString(React.createElement(App)));
    assert(
      htmlBeginner.includes('Beginner View (Plain-English Path)'),
      'Workbench must render the Beginner View toggle button'
    );
    // A newcomer lands on the Python runner, not the advanced roadmap: the first screen must be
    // the place where Lesson 1 is run. The roadmap is still checked, by rendering Tab 1 directly.
    assert(
      htmlBeginner.includes('runner-verified-count'),
      'Beginner View must default to the Python runner, where Lesson 1 is run'
    );
    // The landing screen opens with the README's own Start here block: same heading, same promise,
    // and a Lesson 1 link built from the generated dataset, so the two doors agree.
    const startHereAt = htmlBeginner.indexOf('data-testid="start-here"');
    assert(
      startHereAt >= 0 && startHereAt < htmlBeginner.indexOf('data-testid="first-lesson-guide"'),
      'The landing screen must open with the Start here block, above the first-lesson guide'
    );
    // Read the words from the shared file rather than typing a second copy here: the block exists so
    // the README and this screen cannot drift, and a hard-coded sentence in the test is just a third
    // copy that goes stale silently.
    const shared = JSON.parse(
      fs.readFileSync(
        path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'app', 'src', 'data', 'startHere.json'),
        'utf8'
      )
    );
    // The server-rendered HTML escapes the apostrophe in "course's", so compare against the text a
    // browser would show rather than the raw markup.
    const rendered = htmlBeginner
      .replace(/&#x27;|&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&');
    assert(
      rendered.includes(shared.heading) &&
        rendered.includes(shared.definition) &&
        rendered.includes(shared.note),
      'The Start here block must repeat the README heading, what-MechaLab-is line and when-to-use-it ' +
        'line word for word'
    );
    assert(
      rendered.includes('data-testid="start-here-definition"'),
      'the Start here block must define MechaLab on the screen a newcomer lands on, not only in README'
    );
    assert(
      htmlBeginner.includes('data-testid="btn-start-here-run"') &&
        htmlBeginner.includes('Run Lesson 1 here'),
      'The Start here block must offer the run-in-the-workbench door beside the GitHub link'
    );
    assert(
      htmlBeginner.includes('data-testid="link-lesson-page"') &&
        htmlBeginner.includes(
          `href="https://github.com/TLE47/Mechatronics-Roadmap/blob/main/${
            PYTHON_LESSONS.find((lesson) => lesson.id === 'P.1').path
          }"`
        ),
      'each runner lesson must link its reading page, labelled as the reading copy'
    );
    assert(
      htmlBeginner.includes(
        `href="https://github.com/TLE47/Mechatronics-Roadmap/blob/main/${
          PYTHON_LESSONS.find((lesson) => lesson.id === 'P.1').path
        }"`
      ),
      "The Start here link must open Lesson 1's page at the same path the README links"
    );
    // The full block is for a newcomer. Once Lesson 1 is verified the same block is one line: the
    // lesson link survives, the first-timer promise does not.
    globalThis.localStorage.setItem(STORAGE_KEY_VERIFIED, JSON.stringify({ 'P.1': true }));
    const htmlReturning = cleanSsr(ReactDOMServer.renderToString(React.createElement(App)));
    globalThis.localStorage.clear();
    assert(
      htmlReturning.includes('data-testid="start-here"') &&
        htmlReturning.includes('data-collapsed="true"'),
      'A learner who has verified Lesson 1 must get the collapsed Start here line'
    );
    assert(
      htmlReturning.includes('Lesson 1 verified') &&
        !htmlReturning.includes(shared.definition) &&
        !htmlReturning.includes(shared.note) &&
        !htmlReturning.includes('data-testid="btn-start-here-run"'),
      'The collapsed block must say Lesson 1 is verified and drop the first-timer copy and button'
    );
    assert(
      htmlReturning.includes(
        `href="https://github.com/TLE47/Mechatronics-Roadmap/blob/main/${
          PYTHON_LESSONS.find((lesson) => lesson.id === 'P.1').path
        }"`
      ),
      'The collapsed block must keep the Lesson 1 link'
    );
    assert(
      htmlReturning.includes('data-testid="btn-dismiss-start-here"') &&
        !htmlBeginner.includes('data-testid="btn-dismiss-start-here"'),
      'Only the collapsed line may be dismissed; a newcomer must not be able to drop the full block'
    );
    globalThis.localStorage.setItem(STORAGE_KEY_START_HERE_DISMISSED, '1');
    const htmlDismissed = cleanSsr(ReactDOMServer.renderToString(React.createElement(App)));
    globalThis.localStorage.clear();
    assert(
      !htmlDismissed.includes('data-testid="start-here"'),
      'A dismissed Start here line must stay gone on the landing screen'
    );
    assert(
      htmlBeginner.includes('data-testid="first-lesson-guide"'),
      'A first-time visitor must see the guided first lesson above the runner'
    );
    assert(
      htmlBeginner.includes('Run the starter') &&
        !htmlBeginner.includes('data-testid="guide-what-to-fix"'),
      'The guide must offer to run the starter, and show the fix panel only after a failure'
    );
    // The guide scripts the first run, so it must not also print the answer the predict gate asks
    // for. Found in the first beginner sitting (2026-10-23): the finish line sat thirty lines above
    // the gate, so a learner could copy it into the question and the gate proved nothing.
    const guideHtml = htmlBeginner.slice(htmlBeginner.indexOf('data-testid="first-lesson-guide"'));
    const guideRegion = guideHtml.slice(0, guideHtml.indexOf('</section>'));
    assert(
      guideRegion.includes('PREDICT, THEN RUN'),
      'The first-run guide must name the predict step its own Run button opens'
    );
    assert(
      !guideRegion.includes('Encoder Ticks: 425'),
      'The guide must withhold the finish line until the first run has landed, or it answers the gate'
    );
    assert(
      !htmlBeginner.includes('Interactive Guided Beginner Walkthrough'),
      'The advanced simulator tour must stay off the first-lesson screen'
    );
    const htmlRoadmap = cleanSsr(
      ReactDOMServer.renderToString(
        React.createElement(TabArchitecture, {
          onLoadPreset: () => {},
          beginnerView: true,
          activeTierPass: 'tier1',
          onSelectTierPass: () => {},
          completedMilestones: {},
          // Two entries actually passed: the block must count them, not the empty ticks above.
          verifiedLessons: { '00.1': true, '00.2': true },
          onToggleMilestone: () => {},
        })
      )
    );
    assert(
      htmlRoadmap.includes('data-testid="panel-completion-routes-spine"'),
      'Tab 1 Roadmap must render the Completion Routes, Arm Spine & deeper-scope banner when opened'
    );
    // A learner who finished a pass's own first step gets that card as one line, expandable again.
    // The roadmap is also where a dismissed Start here block is restored from.
    const htmlRoadmapReturning = cleanSsr(
      ReactDOMServer.renderToString(
        React.createElement(TabArchitecture, {
          onLoadPreset: () => {},
          beginnerView: true,
          activeTierPass: 'tier1',
          onSelectTierPass: () => {},
          completedMilestones: { t1_tr00: true },
          verifiedLessons: {},
          onToggleMilestone: () => {},
          startHereDismissed: true,
          onRestoreStartHere: () => {},
        })
      )
    );
    assert(
      htmlRoadmapReturning.includes('data-testid="step-card-t1_tr00"') &&
        htmlRoadmapReturning.includes('data-collapsed="true"') &&
        htmlRoadmapReturning.includes('data-testid="btn-step-expand"') &&
        // t1_tr00 is position 1 of depth 1, which is spine step 3: the collapsed line must
        // name that step, not the position inside the depth.
        htmlRoadmapReturning.includes('Step 3 complete'),
      "The roadmap's first step card must collapse to one line once that depth's first step is done, and stay expandable"
    );
    assert(
      htmlRoadmapReturning.includes('data-testid="pass-first-step-complete-tier1"') &&
        !htmlRoadmapReturning.includes('data-testid="pass-first-step-complete-tier2"') &&
        !htmlRoadmapReturning.includes('data-testid="pass-first-step-complete-tier3"'),
      "The pass selector must check off Tier 1's Step 1 and leave Tier 2 and Tier 3 unchecked"
    );
    // Completion belongs to the pass that earned it: Tier 1's checked first milestone must not
    // close Tier 2's card, the way verifying Lesson 1 used to close every pass's card.
    const htmlRoadmapOtherPass = cleanSsr(
      ReactDOMServer.renderToString(
        React.createElement(TabArchitecture, {
          onLoadPreset: () => {},
          beginnerView: true,
          activeTierPass: 'tier2',
          onSelectTierPass: () => {},
          completedMilestones: { t1_tr00: true },
          verifiedLessons: {},
          onToggleMilestone: () => {},
        })
      )
    );
    assert(
      htmlRoadmapOtherPass.includes('data-testid="step-card-t2_tr00"') &&
        !htmlRoadmapOtherPass.includes('data-collapsed="true"'),
      "Tier 1's completed first step must not collapse Tier 2's first step"
    );
    assert(
      htmlRoadmapReturning.includes('data-testid="btn-restore-start-here"'),
      'The roadmap tab must offer to bring a dismissed Start here block back'
    );
    assert(
      !htmlRoadmap.includes('data-collapsed="true"') &&
        !htmlRoadmap.includes('data-testid="pass-first-step-complete-') &&
        !htmlRoadmap.includes('data-testid="btn-restore-start-here"'),
      'A newcomer on the roadmap must get the whole first step card, no completed first step, and no restore button'
    );
    assert(
      htmlBeginner.includes('Start Here: Roadmap &amp; Progress') ||
        htmlBeginner.includes('Start Here: Roadmap & Progress'),
      'Beginner View must display plain-English primary label for Tab 1'
    );
    // The count must say what the 86 are: 36 reading lessons and 50 graded exercises. Calling the
    // whole set "Exercises" was one of the small lies the tab strip told.
    assert(
      htmlBeginner.includes(`Run Python Lessons (${TOTAL} lessons &amp; exercises)`),
      'Beginner View must display the shared Run Python Lessons name and an accurate count'
    );
    assert(
      htmlBeginner.includes('Vibration Filter &amp; Resonance Lab') ||
        htmlBeginner.includes('Vibration Filter & Resonance Lab'),
      'Beginner View must display plain-English label for the Vibration & Resonance Lab'
    );
    // A tab must not be numbered in one view and different in the other; no label may carry one.
    assert(
      !/[0-9]+\.\s+(Start Here|Run Python Lessons|Vibration Filter|Brushless Motor)/.test(
        htmlBeginner
      ),
      'Tab labels must not carry position numbers that the other view contradicts'
    );
    // Steps 1 and 2 are the on-ramp now: one card each, numbered 1 and 2 like the pages print,
    // carrying the Python and Stage 0 entries rather than a strip beside the numbered steps.
    assert(
      htmlRoadmap.includes('data-testid="step-card-spine-1"') &&
        htmlRoadmap.includes('data-testid="step-card-spine-2"'),
      'The roadmap must open with spine steps 1 and 2, or the on-ramp entries belong to no step'
    );
    assert(
      htmlRoadmap.includes('data-testid="practice-entry-P.1"'),
      'Step 1 must carry the Python on-ramp entries by the ids the runner lists'
    );
    // The cost line comes from the generated spine (route_model + page metadata), so a card and
    // the syllabus can never quote the same step differently. The on-ramp has one layer and says
    // so rather than printing a depth of zero hours.
    assert(
      htmlRoadmap.includes('data-testid="step-cost-1"') &&
        htmlRoadmap.includes('on-ramp, one layer'),
      'Step 1 must print its focused hours and say the on-ramp has one layer'
    );
    assert(
      /data-testid="step-cost-3"[\s\S]{0,400}?arm [\d.]+[^<]*depth [\d.]+/.test(htmlRoadmap),
      'A numbered step must print its focused hours with the arm/depth split'
    );
    assert(
      /0\/\d+ entries passed in this browser/.test(htmlRoadmap),
      'An on-ramp step must count verified entries, starting at zero for a new browser'
    );
    // Each step must carry the practice entries the runner lists, by id, and say the tick is
    // self-reported rather than implying the app checked the deliverable.
    assert(
      htmlRoadmap.includes('data-testid="practice-t1_tr00"'),
      'A roadmap step must show its practice block, not only a prose task and a checkbox'
    );
    assert(
      htmlRoadmap.includes('data-testid="practice-entry-00.1"'),
      'The practice block must list the step\'s workbench entries by the ids the runner uses'
    );
    assert(
      htmlRoadmap.includes('2/8 passed in this browser'),
      'The practice block must count executed passes, not the ticks the learner set'
    );
    assert(
      htmlRoadmap.includes('data-testid="practice-entry-00.1"') &&
        /data-testid="practice-entry-00\.1"[^>]*>\s*✓ 00\.1/.test(htmlRoadmap),
      'A passed entry must be marked as passed in its own chip'
    );
    assert(
      htmlRoadmap.includes('Mark done (self-reported)'),
      'The milestone control must say the tick is self-reported'
    );
    // In Beginner View, non-core Tier 3 tabs (like 6-DOF Attitude ESKF) are hidden until unlocked
    assert(
      !htmlBeginner.includes('tab-btn-tab-eskf'),
      'Beginner View should hide non-core Tier 3 ESKF tab by default to prevent beginner overload'
    );
    assert(
      !htmlBeginner.includes('tab-btn-tab-links'),
      'Beginner View should hide the maintainer Link Health dashboard unless it is the active tab'
    );

    // Switch to Advanced View via localStorage and verify all 12 technical tabs render
    globalThis.localStorage.setItem(STORAGE_KEY_VIEW_MODE, 'advanced');
    const htmlAdvanced = cleanSsr(ReactDOMServer.renderToString(React.createElement(App)));
    assert.equal(WORKBENCH_TABS.length, 12, 'WORKBENCH_TABS must define all 12 tabs');
    for (const tab of WORKBENCH_TABS) {
      assert(
        htmlAdvanced.includes(`data-testid="tab-btn-${tab.id}"`),
        `Advanced View must render tab button for ${tab.id}`
      );
    }
    assert(
      htmlAdvanced.includes('25 kHz PMSM FOC &amp; SVPWM (Lab 01/03)'),
      'Advanced View must surface technical tab titles'
    );
    // The switch said "All 10" while twelve tabs shipped. The count is the registry's now, and this
    // is the check that reads the rendered label rather than trusting the helper's wording.
    assert(
      htmlAdvanced.includes(`All ${WORKBENCH_TABS.length} Engineering Labs (Technical Names)`),
      'the view switch must name the registry count; a typed number goes stale when a tab is added'
    );
    // One version, one place: the footer prints package.json's identity, and package.json is semver.
    assert.match(releaseVersion, /^\d+\.\d+\.\d+$/, 'package.json must carry a semver release identity');
    assert(
      htmlAdvanced.includes(`data-testid="app-version">v${releaseVersion}<`),
      `the footer must print package.json's version, v${releaseVersion}`
    );
    assert(
      htmlAdvanced.includes('Run Python Lessons') ||
        htmlAdvanced.includes('In-Browser Python Runner (Pyodide WASM)'),
      'Advanced View must still name the Python tab by name, not by a position'
    );

    // 1b. Verify the Link Health dashboard plots the generated run history
    const { TabLinkHealth } = linkMod;
    const { LINK_HISTORY, LINK_HISTORY_SOURCE } = historyMod;
    assert.ok(Array.isArray(LINK_HISTORY), 'linkHistoryData must export LINK_HISTORY as an array');
    assert.equal(
      LINK_HISTORY_SOURCE,
      'docs/link-check-history.jsonl',
      'the dashboard must name the history file the checker appends to'
    );
    for (let i = 1; i < LINK_HISTORY.length; i += 1) {
      assert.ok(
        Date.parse(LINK_HISTORY[i].date) >= Date.parse(LINK_HISTORY[i - 1].date),
        'LINK_HISTORY must be chronological so the chart x-axis means time'
      );
    }
    for (const point of LINK_HISTORY) {
      assert.ok(point.notChecked >= 0 && point.served >= 0 && point.failed >= 0, 'counts must be non-negative');
      assert.equal(
        point.notChecked,
        point.blocked + point.unreachable + point.serverError,
        `not-checked must be the sum of BLOCKED + UNREACHABLE + SERVER_ERROR (${point.date})`
      );
    }
    const linkHtml = cleanSsr(ReactDOMServer.renderToString(React.createElement(TabLinkHealth)));
    assert(
      linkHtml.includes('data-testid="link-history-chart"'),
      'Link Health must render the not-checked trend chart'
    );
    assert(
      linkHtml.includes('data-testid="link-history-table"'),
      'Link Health must render the recent-runs table'
    );
    assert(
      linkHtml.includes('data-testid="rise-issues-panel"') && linkHtml.includes('Open rise issues'),
      'Link Health must render the open rise issues panel'
    );
    assert(
      linkHtml.includes('data-testid="link-history-hosts"'),
      'Link Health must render the recurring-hosts table'
    );

    const { HOST_RECURRENCE, HOST_RECURRENCE_RUNS } = historyMod;
    assert.ok(Array.isArray(HOST_RECURRENCE), 'linkHistoryData must export HOST_RECURRENCE as an array');
    assert.ok(
      Number.isInteger(HOST_RECURRENCE_RUNS) && HOST_RECURRENCE_RUNS <= LINK_HISTORY.length,
      'HOST_RECURRENCE_RUNS cannot exceed the recorded runs; older rows without a URL list do not count'
    );
    for (const entry of HOST_RECURRENCE) {
      assert.ok(entry.host && !entry.host.includes('/'), `host must be a bare hostname, got ${entry.host}`);
      assert.ok(
        Number.isInteger(entry.runs) && entry.runs >= 1 && entry.runs <= HOST_RECURRENCE_RUNS,
        `runs for ${entry.host} must be between 1 and ${HOST_RECURRENCE_RUNS}`
      );
      assert.ok(Number.isInteger(entry.urls) && entry.urls >= 0, `urls for ${entry.host} must be a count`);
    }
    for (let i = 1; i < HOST_RECURRENCE.length; i += 1) {
      assert.ok(
        HOST_RECURRENCE[i - 1].runs >= HOST_RECURRENCE[i].runs,
        'HOST_RECURRENCE must be ordered worst-first so the table reads as a ranking'
      );
    }
    if (LINK_HISTORY.length > 0) {
      const latest = LINK_HISTORY[LINK_HISTORY.length - 1];
      const rendered = linkHtml.match(/data-testid="link-history-latest-not-checked"[^>]*>(\d+)/);
      assert.ok(rendered, 'Link Health must render the latest not-checked KPI');
      assert.equal(
        Number(rendered[1]),
        latest.notChecked,
        'the KPI must show the newest run from the generated history, not a hand-typed number'
      );
    }

    // 2. Verify In-Browser Python Runner (TabPyodideRunner) & its generated dataset
    assert.ok(TOTAL > 0, 'PYTHON_LESSONS must contain the generated lessons and exercises');
    assert.equal(
      new Set(PYTHON_LESSONS.map((lesson) => lesson.id)).size,
      TOTAL,
      'PYTHON_LESSONS must not repeat a lesson id'
    );
    for (const lesson of PYTHON_LESSONS) {
      assert(lesson.id && lesson.title, `Lesson missing id/title: ${JSON.stringify(lesson)}`);
      assert(
        Array.isArray(lesson.ideas) && lesson.ideas.length >= 1 && lesson.ideas.length <= 2,
        `Lesson ${lesson.id} violates <= 2 ideas rule`
      );
      assert(lesson.starterCode.length > 10, `Lesson ${lesson.id} missing starterCode`);
      assert(lesson.fullSolution.length > 10, `Lesson ${lesson.id} missing fullSolution`);
      assert(lesson.expectedOutput.length > 0, `Lesson ${lesson.id} missing expectedOutput`);
      assert(lesson.hints.length >= 1, `Lesson ${lesson.id} missing progressive hints`);
      assert(
        lesson.instructorTests && lesson.instructorTests.length > 20,
        `Lesson ${lesson.id} missing instructor-owned behavioral tests`
      );
      assert(
        Array.isArray(lesson.instructorTestSummary) && lesson.instructorTestSummary.length >= 1,
        `Lesson ${lesson.id} missing instructorTestSummary`
      );
    }

    // Every entry, not only P.1, must have a specific brief: how many holes, the first one, the
    // first check, and the output that means finished. A generic fallback on every entry would pass
    // the render test while telling a learner nothing.
    for (const lesson of PYTHON_LESSONS) {
      const coach = coachForLesson(lesson);
      assert(coach.holeCount > 0, `Lesson ${lesson.id} starter must name at least one marked hole`);
      assert(
        coach.firstHole && !/^TODO\b/i.test(coach.firstHole),
        `Lesson ${lesson.id} first hole must be readable (${coach.firstHole})`
      );
      assert(coach.check.length > 10, `Lesson ${lesson.id} must describe its first check`);
      assert(
        coach.check !== 'the lesson behavioural checks',
        `Lesson ${lesson.id} must name its own first check, not the generic fallback`
      );
      assert(
        coach.firstHole !== 'the first marked line in the starter',
        `Lesson ${lesson.id} must name its own first hole, not the generic fallback`
      );
      if (coach.isExercise) {
        assert(
          coach.check.includes(coach.firstHole),
          `Lesson ${lesson.id} exercise check must name its first hole`
        );
        // The hole goes in unwrapped: the guide already sets it in bold, and a package's hole is a
        // sentence, so quotes around it read as a quotation of itself (first graded-exercise
        // sitting, 2026-10-23).
        assert(
          coach.check.endsWith(coach.firstHole),
          `Lesson ${lesson.id} exercise check must end at its hole, not wrap it in quotes`
        );
      }
      assert(coach.finish.length > 0, `Lesson ${lesson.id} must name a finished output`);
      const markers = (lesson.starterCode.match(/raise\s+NotImplementedError|#\s*TODO\b/g) || []).length;
      assert(
        coach.holeCount <= markers,
        `Lesson ${lesson.id} reports ${coach.holeCount} holes but its starter marks only ${markers}`
      );
    }

    // 2b. Formatting is graded separately from behaviour (app/src/outputMatch.ts): a behaviourally
    // correct solution must not be blocked by harmless whitespace, and only the lessons whose Expected
    // Output is a padded table compare spacing exactly.
    const { compareStdout, normalizeStdout } = await vite.ssrLoadModule('/src/outputMatch.ts');
    const paddedLine = /[^\s]\s{2,}[^\s]/;
    for (const lesson of PYTHON_LESSONS) {
      const alignedRows = lesson.expectedOutput
        .split('\n')
        .filter((line) => paddedLine.test(line)).length;
      const expectedMode = alignedRows >= 2 ? 'exact' : 'normalized';
      assert.equal(
        lesson.outputMatch,
        expectedMode,
        `Lesson ${lesson.id} declares outputMatch=${lesson.outputMatch} but its Expected Output has ` +
          `${alignedRows} column-aligned row(s), which means \`${expectedMode}\``
      );
    }
    const exactLesson = PYTHON_LESSONS.find((l) => l.outputMatch === 'exact');
    const plainLesson = PYTHON_LESSONS.find((l) => l.outputMatch === 'normalized');
    assert(exactLesson && plainLesson, 'the dataset must carry both presentation-check modes');

    // Whitespace-only differences: rejected where the lesson grades its table, ignored where it does not.
    const indent = (text) => text.split('\n').map((line) => `    ${line}`).join('\n');
    assert.equal(
      compareStdout(indent(exactLesson.expectedOutput), exactLesson.expectedOutput, 'exact').matched,
      false,
      `Lesson ${exactLesson.id} must still reject a re-indented table`
    );
    const whitespaceOnly = compareStdout(
      indent(plainLesson.expectedOutput),
      plainLesson.expectedOutput,
      'normalized'
    );
    assert.equal(
      whitespaceOnly.matched,
      true,
      `Lesson ${plainLesson.id} must accept a correctly-valued run with different whitespace`
    );
    assert.equal(
      whitespaceOnly.formattingDiffers,
      true,
      'a whitespace-only match must be reported as such so the runner can say formatting was ignored'
    );
    assert.equal(
      compareStdout(
        plainLesson.expectedOutput.replace(/\n/g, '\n\n'),
        plainLesson.expectedOutput,
        'normalized'
      ).matched,
      true,
      'blank lines inside the run must not fail a normalized lesson'
    );

    // Numbers are never relaxed by either mode.
    const plainLines = plainLesson.expectedOutput.split('\n');
    const digitLineIndex = plainLines.findIndex((line) => /\d/.test(line));
    assert(digitLineIndex >= 0, `Lesson ${plainLesson.id} fixture must carry a number to mutate`);
    const changedLines = [...plainLines];
    changedLines[digitLineIndex] = changedLines[digitLineIndex].replace(/\d/, (d) =>
      String((Number(d) + 1) % 10)
    );
    const oneDigitChanged = changedLines.join('\n');
    assert.notEqual(oneDigitChanged, plainLesson.expectedOutput, 'fixture must change the run');
    const numberDiff = compareStdout(oneDigitChanged, plainLesson.expectedOutput, 'normalized');
    assert.equal(numberDiff.matched, false, 'a wrong number must fail even in normalized mode');
    assert.equal(
      numberDiff.firstDiffLine,
      digitLineIndex + 1,
      'the first differing line must be reported'
    );
    assert.equal(
      normalizeStdout('  a  b \n\n', 'normalized'),
      'ab',
      'normalization must ignore whitespace, padding and blank lines'
    );
    assert.equal(
      compareStdout('raw=   0 ->    0.0 deg', 'raw=0 -> 0.0 deg', 'normalized').matched,
      true,
      'a run whose only difference is a dropped pad must still match in normalized mode'
    );
    assert.equal(
      compareStdout('raw=   0 ->    0.0 deg', 'raw=0 -> 0.0 deg', 'exact').matched,
      false,
      'a dropped pad must still fail an exact lesson'
    );
    assert.equal(
      normalizeStdout('  a  b \n\n', 'exact'),
      '  a  b',
      'exact mode must keep interior spacing and indentation'
    );

    // Ensure TabPyodideRunner executes inside a Web Worker and never awards a fallback text pass
    const runnerSrc = fs.readFileSync(
      path.join(repoRoot, 'app', 'src', 'components', 'tabs', 'TabPyodideRunner.tsx'),
      'utf-8'
    );
    assert(
      !runnerSrc.includes('normalizeCode') && !runnerSrc.includes("setPyodideStatus('fallback')"),
      'TabPyodideRunner must never award an execution pass from fallback text without executing in Pyodide'
    );
    assert(
      runnerSrc.includes('new Worker(') && runnerSrc.includes('.terminate()'),
      'TabPyodideRunner must isolate Python execution inside a terminable Web Worker'
    );

    const htmlRunner = cleanSsr(
      ReactDOMServer.renderToString(
        React.createElement(TabPyodideRunner, {
          initialLessonId: '05.1',
          verifiedLessons: { 'P.1': true, '05.1': true },
          completedLessons: { 'P.1': true, 'P.2': true, '05.1': true },
        })
      )
    );
    assert(
      htmlRunner.includes('data-testid="input-lesson-search"'),
      'TabPyodideRunner must render the lesson search input'
    );
    assert(
      htmlRunner.includes('data-testid="btn-reset-runtime"'),
      'TabPyodideRunner must render the Reset Runtime control'
    );
    assert(
      htmlRunner.includes('data-testid="panel-instructor-tests"'),
      'TabPyodideRunner must render the Instructor Behavioral Assessment panel'
    );
    assert(
      htmlRunner.includes(`2 / ${TOTAL} Verified`),
      `TabPyodideRunner must display accurate Pyodide execution-verified lesson tally (2 / ${TOTAL} Verified)`
    );
    assert(
      htmlRunner.includes(`3 / ${TOTAL} Marked`),
      `TabPyodideRunner must display separate self-marked lesson tally (3 / ${TOTAL} Marked)`
    );
    assert(
      htmlRunner.includes('Progressive 3-Step Hint Ladder'),
      'TabPyodideRunner must render the 3-step progressive hint ladder'
    );
    assert(
      htmlRunner.includes('Reveal Hint 1') && !htmlRunner.includes('Run to unlock Hint'),
      'Hint 1 must be open on a fresh lesson; later hints wait for a run'
    );
    assert(
      htmlRunner.includes('data-testid="note-output-match-mode"') &&
        htmlRunner.includes('Formatting is ignored'),
      'TabPyodideRunner must state that a normalized lesson ignores whitespace'
    );

    // 08.1 owns the four-fault bench; other lessons must not inherit it. The bench grades the
    // learner's own repair functions, so the server render has no report: every card must say
    // "not run", and a card that starts green is caught here rather than in the browser.
    const html081 = cleanSsr(
      ReactDOMServer.renderToString(
        React.createElement(TabPyodideRunner, { initialLessonId: '08.1' })
      )
    );
    assert(
      html081.includes('data-testid="fault-bench-08-1"'),
      'Lesson 08.1 must render the interactive four-fault bench'
    );
    for (const faultId of ['zero-offset', 'cpr', 'anti-windup', 'gravity']) {
      assert(
        html081.includes(`data-testid="fault-card-${faultId}"`),
        `08.1 bench must render the ${faultId} card`
      );
    }
    assert(
      html081.includes('data-testid="input-zero-offset-correction"') &&
        html081.includes('data-testid="btn-fault-grade"') &&
        html081.includes('broken 12.00 mm') &&
        html081.includes('broken 37.2%') &&
        html081.includes('0 / 4 repaired'),
      '08.1 bench must open ungraded, naming each broken value and offering Grade my repairs'
    );
    assert(
      html081.includes('not graded yet') && !html081.includes('REPAIRED'),
      '08.1 bench must not present an unrun card as repaired'
    );
    assert(
      !htmlRunner.includes('fault-bench-08-1'),
      'the 08.1 fault bench must not leak into another lesson (05.1)'
    );

    // The Tier 3 capstone carries its own harness, and it must open ungraded too: four rows, the
    // lesson's own limits, and no row claimed as at target before a run.
    const htmlT3 = cleanSsr(
      ReactDOMServer.renderToString(
        React.createElement(TabPyodideRunner, { initialLessonId: 'EX.08-capstones.T3.07a' })
      )
    );
    assert(
      htmlT3.includes('data-testid="lesson-harness"'),
      'the Tier 3 capstone must render its budget bench'
    );
    for (const unit of ['budget', 'margin', 'allowance', 'signoff']) {
      assert(
        htmlT3.includes(`data-testid="harness-row-${unit}"`),
        `the Tier 3 bench must render the ${unit} row`
      );
    }
    assert(
      htmlT3.includes('0 / 4 at target') &&
        htmlT3.includes('target ≤ 0.50 mm') &&
        htmlT3.includes('target ≥ 45.0 deg') &&
        htmlT3.includes('data-testid="btn-harness-grade"'),
      'the Tier 3 bench must open ungraded, naming each target and offering Grade my budgets'
    );
    assert(
      !htmlT3.includes('AT TARGET') && !html081.includes('data-testid="lesson-harness"'),
      'no capstone bench may present an unrun row as at target, and the generic panel must not'
    );
    // The coach is per lesson, including its hide control: hiding P.1 must not hide P.2's brief.
    globalThis.localStorage.setItem(STORAGE_KEY_FIRST_GUIDE, JSON.stringify(['P.1']));
    const htmlP1Hidden = cleanSsr(
      ReactDOMServer.renderToString(React.createElement(TabPyodideRunner, { initialLessonId: 'P.1' }))
    );
    assert(
      !htmlP1Hidden.includes('data-testid="first-lesson-guide"'),
      'hiding P.1\'s guide must hide P.1\'s guide only'
    );
    const p2Coach = coachForLesson(PYTHON_LESSONS.find((lesson) => lesson.id === 'P.2'));
    const htmlP2 = cleanSsr(
      ReactDOMServer.renderToString(React.createElement(TabPyodideRunner, { initialLessonId: 'P.2' }))
    );
    assert(
      htmlP2.includes('data-testid="first-lesson-guide"') &&
        htmlP2.includes('First run · Lesson P.2') &&
        htmlP2.includes('THE STARTER') &&
        htmlP2.includes(p2Coach.firstHole.slice(0, 30)),
      'P.2 must get its own coach naming its starter hole, even after P.1 is hidden'
    );
    globalThis.localStorage.clear();
    const htmlExactLesson = cleanSsr(
      ReactDOMServer.renderToString(
        React.createElement(TabPyodideRunner, { initialLessonId: exactLesson.id })
      )
    );
    assert(
      htmlExactLesson.includes('grades exact formatting'),
      `TabPyodideRunner must state that ${exactLesson.id} grades exact formatting`
    );

    // 3. Verify Placement Quiz, School-Math Diagnostic & Tier 1 -> Tier 2 Exit Readiness Review
    assert.equal(
      PLACEMENT_QUESTIONS.length,
      8,
      'PLACEMENT_QUESTIONS must contain 8 skip-gate checkpoints'
    );
    assert.equal(
      SCHOOL_MATH_DIAGNOSTIC.length,
      6,
      'SCHOOL_MATH_DIAGNOSTIC must contain 6 just-in-time school-math topics'
    );
    assert.equal(
      TIER1_EXIT_GATES.length,
      6,
      'TIER1_EXIT_GATES must contain 6 practical Tier 1 -> Tier 2 exit readiness gates'
    );
    const validLessonIds = new Set([
      ...PYTHON_LESSONS.map((l) => l.id),
      'S0.1',
      '01.1',
      '01.2',
    ]);
    for (const q of PLACEMENT_QUESTIONS) {
      const correctOpts = q.options.filter((o) => o.isCorrect);
      assert.equal(
        correctOpts.length,
        1,
        `Placement question ${q.id} must have exactly 1 correct option`
      );
      assert(
        validLessonIds.has(q.lessonId),
        `Placement question ${q.id} references unknown lessonId ${q.lessonId}`
      );
    }
    for (const m of SCHOOL_MATH_DIAGNOSTIC) {
      assert(
        validLessonIds.has(m.lessonId),
        `School-math diagnostic ${m.id} references unknown lessonId ${m.lessonId}`
      );
    }
    for (const g of TIER1_EXIT_GATES) {
      assert(
        validLessonIds.has(g.refresherLessonId),
        `Tier 1 exit gate ${g.id} references unknown refresherLessonId ${g.refresherLessonId}`
      );
    }

    const htmlQuiz = cleanSsr(
      ReactDOMServer.renderToString(
        React.createElement(TabPlacementQuiz, {
          onOpenPyodideLesson: () => {},
          onSwitchSimulatorTab: () => {},
        })
      )
    );
    assert(
      htmlQuiz.includes('0 / 8 Answered') &&
        htmlQuiz.includes('data-testid="tab-math-diagnostic"') &&
        htmlQuiz.includes('data-testid="tab-tier1-exit-review"'),
      'TabPlacementQuiz must render 0 / 8 Answered counter plus School-Math Diagnostic and Tier 1 Exit Review tabs'
    );

    // 4. Verify localStorage progress persistence & Markdown Portfolio export
    globalThis.localStorage.setItem(
      STORAGE_KEY_VERIFIED,
      JSON.stringify({ 'P.1': true, '05.1': true })
    );
    globalThis.localStorage.setItem(
      STORAGE_KEY_COMPLETED,
      JSON.stringify({ 'P.1': true, '00.1': true, '05.1': true, '08.1': true })
    );
    globalThis.localStorage.setItem(
      STORAGE_KEY_MILESTONES,
      JSON.stringify({ l0_m1: true, l0_m2: true, t1_tr00: true })
    );
    const htmlWithProgress = cleanSsr(ReactDOMServer.renderToString(React.createElement(App)));
    assert(
      htmlWithProgress.includes(`Executed &amp; Passed: 2/${TOTAL}`) ||
        htmlWithProgress.includes(`Executed & Passed: 2/${TOTAL}`),
      `App toolbar must reflect persisted Execution-Verified Python lessons from localStorage (2/${TOTAL})`
    );
    assert(
      htmlWithProgress.includes(`Self-Marked: 4/${TOTAL}`),
      `App toolbar must reflect persisted Self-Marked Python lessons from localStorage (4/${TOTAL})`
    );
    assert(
      htmlWithProgress.includes('Track Milestones: 3/27'),
      'App toolbar must reflect persisted Track milestone completions from localStorage (3/27)'
    );

    const portfolioMd = buildPortfolioMarkdown(
      { 'P.1': true, '05.1': true },
      { 'P.1': true, '00.1': true, '05.1': true, '08.1': true },
      { l0_m1: true, l0_m2: true, t1_tr00: true }
    );
    assert(
      portfolioMd.includes('# MechaLab — Learner Progress & Portfolio Summary') &&
        portfolioMd.includes(
          `**Execution-Verified In-Browser Python Lessons (Executed & Passed in Pyodide WASM):** 2 / ${TOTAL}`
        ) &&
        portfolioMd.includes(`**Self-Marked Completed Python Lessons (Manual Checklist):** 4 / ${TOTAL}`) &&
        portfolioMd.includes('**Self-Reported Roadmap Track Milestones:** 3 / 27') &&
        portfolioMd.includes('Lesson 05.1') &&
        portfolioMd.includes('Lesson 08.1'),
      'buildPortfolioMarkdown must strictly separate Execution-Verified lessons from Self-Marked lessons and milestones'
    );

    // 4b. The palette reference (`?view=theme`): its table is parsed from index.css at build time, so
    // the render must carry real values — a handful of tokens and every palette's swatches — and the
    // workbench must not render it unless the address asks for it.
    const { ThemeTokens } = await vite.ssrLoadModule('/src/components/ThemeTokens.tsx');
    const tokensHtml = cleanSsr(
      ReactDOMServer.renderToString(
        React.createElement(ThemeTokens, {
          theme: 'dark',
          fallback: 'dark',
          onToggle: () => {},
          onToggleContrast: () => {},
        })
      )
    );
    const rowCount = (tokensHtml.match(/data-testid="theme-token-row"/g) || []).length;
    assert(
      tokensHtml.includes('data-testid="theme-tokens-page"'),
      'the ?view=theme page must render its own container, or the route has nothing to show'
    );
    assert(
      rowCount >= 20,
      `the token page must print a row per colour token (expected >= 20, got ${rowCount}); a short table means the build-time palette module or the parser stopped matching`
    );
    assert(
      ['dark', 'light', 'paper', 'contrast'].every((palette) =>
        tokensHtml.includes(`data-palette="${palette}"`)
      ),
      'the token page must draw a swatch for every palette, not just the one on screen'
    );
    // The values are the stylesheet's, not the component's: --bg is #070b12 in index.css, #f8f6f2 in
    // its light block, #efe4d0 in its paper block and #000000 in its high-contrast block.
    assert(
      tokensHtml.includes('--bg') &&
        tokensHtml.includes('#070b12') &&
        tokensHtml.includes('#f8f6f2') &&
        tokensHtml.includes('#efe4d0') &&
        tokensHtml.includes('#000000'),
      'the token page must print the values parsed from index.css (expected --bg #070b12, its light override #f8f6f2, its paper override #efe4d0 and its high-contrast #000000)'
    );
    assert(
      !tokensHtml.includes('data-testid="theme-tokens-error"'),
      'the token page must not render its parse-error panel; the stylesheet still has :root, [data-theme="light"], [data-theme="paper"], [data-theme="contrast"] and @theme inline'
    );
    assert(
      tokensHtml.includes('data-testid="btn-theme-route-toggle"') &&
        tokensHtml.includes('data-testid="btn-contrast-route-toggle"') &&
        tokensHtml.includes('data-testid="btn-paper-route-toggle"'),
      'the token page must carry all three controls, so each palette can be read on the page itself'
    );
    assert(
      !htmlBeginner.includes('data-testid="theme-tokens-page"'),
      'the workbench must not render the token page without ?view=theme (SSR has no address, so the default must be the workbench)'
    );

    // 5. If production bundle dist/index.html exists, verify asset integrity
    const distHtmlPath = path.join(repoRoot, 'dist', 'index.html');
    if (fs.existsSync(distHtmlPath)) {
      const distHtml = fs.readFileSync(distHtmlPath, 'utf-8');
      assert(
        distHtml.includes('<div id="root"></div>'),
        'dist/index.html must contain root mount node'
      );
    }

    console.log(
      `[PASS] Workbench UI smoke tests passed (Beginner/Advanced views, ${TOTAL}-entry Runner, 8-gate Placement Quiz, localStorage persistence & Markdown Portfolio export).`
    );
  } finally {
    if (!viteServer) await vite.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // `npm run test:smoke` is a command, not a library: after the render and the close there is
  // nothing left to do, and Vite's dependency scanner can keep a handle open after `close()`. The
  // combined runner imports `runSmokeTests` and owns the server, so this branch is standalone only.
  runSmokeTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[FAIL] Workbench smoke test error:', err);
      process.exit(1);
    });
}
