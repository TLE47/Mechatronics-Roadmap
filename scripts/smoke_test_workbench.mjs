#!/usr/bin/env node
/**
 * Automated Browser/DOM & SSR Smoke Test Suite for the MechaLab Workbench
 * (`scripts/smoke_test_workbench.mjs`)
 *
 * Uses Vite's SSR module loader + ReactDOMServer to mount and verify:
 * 1. Beginner View (default plain-English 6-tab navigation) vs. Advanced View (all 10 technical labs).
 * 2. In-Browser Python Lesson Runner (`TabPyodideRunner`): 32-lesson dataset, starter code,
 *    3-step hint ladder, search/filter UI, and completion state rendering.
 * 3. Prerequisite Placement Quiz (`TabPlacementQuiz`): 8 skip-gate checkpoints, dependency-graph
 *    first-gap recommendation logic, and valid lesson/tab routing targets.
 * 4. Persistent Progress & Markdown Portfolio Export (`localStorage` + `buildPortfolioMarkdown`).
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { createServer } from 'vite';

// Minimal DOM / localStorage polyfill for SSR smoke testing
const storageMap = new Map();
globalThis.localStorage = {
  getItem: (key) => (storageMap.has(key) ? storageMap.get(key) : null),
  setItem: (key, val) => storageMap.set(key, String(val)),
  removeItem: (key) => storageMap.delete(key),
  clear: () => storageMap.clear(),
};
globalThis.window = globalThis;

async function runSmokeTests() {
  const repoRoot = process.cwd();
  const vite = await createServer({
    root: path.join(repoRoot, 'app'),
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  });

  try {
    const appMod = await vite.ssrLoadModule('/src/App.tsx');
    const runnerMod = await vite.ssrLoadModule('/src/components/tabs/TabPyodideRunner.tsx');
    const quizMod = await vite.ssrLoadModule('/src/components/tabs/TabPlacementQuiz.tsx');
    const lessonsMod = await vite.ssrLoadModule('/src/data/pythonLessonsData.ts');

    const {
      App,
      WORKBENCH_TABS,
      buildPortfolioMarkdown,
      STORAGE_KEY_VIEW_MODE,
      STORAGE_KEY_MILESTONES,
    } = appMod;
    const { TabPyodideRunner, STORAGE_KEY_VERIFIED, STORAGE_KEY_COMPLETED } = runnerMod;
    const { TabPlacementQuiz, PLACEMENT_QUESTIONS } = quizMod;
    const { PYTHON_LESSONS } = lessonsMod;

    // 1. Verify Beginner View (default) vs. Advanced View (all 10 technical labs)
    const cleanSsr = (html) => html.replace(/<!--\s*-->/g, '');
    globalThis.localStorage.clear();
    const htmlBeginner = cleanSsr(ReactDOMServer.renderToString(React.createElement(App)));
    assert(
      htmlBeginner.includes('Beginner View (Plain-English Path)'),
      'Workbench must render the Beginner View toggle button'
    );
    assert(
      htmlBeginner.includes('1. Start Here: Roadmap &amp; Progress') ||
        htmlBeginner.includes('1. Start Here: Roadmap & Progress'),
      'Beginner View must display plain-English primary label for Tab 1'
    );
    assert(
      htmlBeginner.includes('2. Run Python Lessons (32 Lessons)'),
      'Beginner View must display plain-English primary label for the Python Runner'
    );
    assert(
      htmlBeginner.includes('4. Vibration Filter &amp; Resonance Lab') ||
        htmlBeginner.includes('4. Vibration Filter & Resonance Lab'),
      'Beginner View must display plain-English label for the Vibration & Resonance Lab'
    );
    // In Beginner View, non-core Tier 3 tabs (like 6-DOF Attitude ESKF) are hidden until unlocked
    assert(
      !htmlBeginner.includes('tab-btn-tab-eskf'),
      'Beginner View should hide non-core Tier 3 ESKF tab by default to prevent beginner overload'
    );

    // Switch to Advanced View via localStorage and verify all 10 technical tabs render
    globalThis.localStorage.setItem(STORAGE_KEY_VIEW_MODE, 'advanced');
    const htmlAdvanced = cleanSsr(ReactDOMServer.renderToString(React.createElement(App)));
    assert.equal(WORKBENCH_TABS.length, 10, 'WORKBENCH_TABS must define all 10 tabs');
    for (const tab of WORKBENCH_TABS) {
      assert(
        htmlAdvanced.includes(`data-testid="tab-btn-${tab.id}"`),
        `Advanced View must render tab button for ${tab.id}`
      );
    }
    assert(
      htmlAdvanced.includes('3. 25 kHz PMSM FOC &amp; SVPWM (Lab 01/03)'),
      'Advanced View must surface technical tab titles'
    );

    // 2. Verify In-Browser Python Runner (TabPyodideRunner) & 32-lesson dataset
    assert.equal(PYTHON_LESSONS.length, 32, 'PYTHON_LESSONS must contain all 32 Python lessons');
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
      htmlRunner.includes('2 / 32 Verified'),
      'TabPyodideRunner must display accurate Pyodide execution-verified lesson tally (2 / 32 Verified)'
    );
    assert(
      htmlRunner.includes('3 / 32 Marked'),
      'TabPyodideRunner must display separate self-marked lesson tally (3 / 32 Marked)'
    );
    assert(
      htmlRunner.includes('Progressive 3-Step Hint Ladder'),
      'TabPyodideRunner must render the 3-step progressive hint ladder'
    );

    // 3. Verify Placement Quiz (TabPlacementQuiz) & dependency-graph routing
    assert.equal(
      PLACEMENT_QUESTIONS.length,
      8,
      'PLACEMENT_QUESTIONS must contain 8 skip-gate checkpoints'
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

    const htmlQuiz = cleanSsr(
      ReactDOMServer.renderToString(
        React.createElement(TabPlacementQuiz, {
          onOpenPyodideLesson: () => {},
          onSwitchSimulatorTab: () => {},
        })
      )
    );
    assert(
      htmlQuiz.includes('0 / 8 Answered'),
      'TabPlacementQuiz must render initial 0 / 8 Answered progress counter'
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
      htmlWithProgress.includes('Executed &amp; Passed: 2/32') ||
        htmlWithProgress.includes('Executed & Passed: 2/32'),
      'App toolbar must reflect persisted Execution-Verified Python lessons from localStorage (2/32)'
    );
    assert(
      htmlWithProgress.includes('Self-Marked: 4/32'),
      'App toolbar must reflect persisted Self-Marked Python lessons from localStorage (4/32)'
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
          '**Execution-Verified In-Browser Python Lessons (Executed & Passed in Pyodide WASM):** 2 / 32'
        ) &&
        portfolioMd.includes('**Self-Marked Completed Python Lessons (Manual Checklist):** 4 / 32') &&
        portfolioMd.includes('**Self-Reported Roadmap Track Milestones:** 3 / 27') &&
        portfolioMd.includes('Lesson 05.1') &&
        portfolioMd.includes('Lesson 08.1'),
      'buildPortfolioMarkdown must strictly separate Execution-Verified lessons from Self-Marked lessons and milestones'
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
      '[PASS] Workbench UI smoke tests passed (Beginner/Advanced views, 32-lesson Runner, 8-gate Placement Quiz, localStorage persistence & Markdown Portfolio export).'
    );
  } finally {
    await vite.close();
  }
}

runSmokeTests().catch((err) => {
  console.error('[FAIL] Workbench smoke test error:', err);
  process.exit(1);
});
