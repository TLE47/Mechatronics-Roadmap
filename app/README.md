# app/ — the MechaLab workbench

The browser workbench every lesson links to: https://tle47.github.io/Mechatronics-Roadmap/. It runs
Python 3.12 in the tab (Pyodide), grades a program against the lesson's expected output and its
instructor tests, and keeps progress in `localStorage`, with a Markdown portfolio export.

Nothing here is a second copy of the curriculum. The lesson registry is generated from the Markdown
and the graded packages, so this directory is the *viewer*: if a number in the UI disagrees with a
lesson, regenerate the data rather than editing the data.

```mermaid
flowchart LR
    MD["Lesson pages<br/>+ exercises/<br/>+ modules/"] --> GEN["scripts/generate_python_lessons_data.py"]
    GEN --> DATA["src/data/pythonLessonsData.ts"]
    DATA --> RUN["TabPyodideRunner<br/>Pyodide 3.12 in the tab"]
    RUN --> SAVE["localStorage progress<br/>+ Markdown portfolio"]
```

## The shell's design system

[`src/index.css`](src/index.css) is the one place colours, type, radii, motion and the component
primitives live: tokens (`--bg`, `--panel`, `--accent`, `--emerald`, …), a fluid type scale
(`--step-3` … `--step--1`), `.btn` / `.btn-primary` / `.chip` / `.kbd`, one visible focus ring for
every interactive element, and a `prefers-reduced-motion` branch that disables the hero animation and
the transitions.

Every tab now names the tokens, not a hex. `@theme inline` in [`src/index.css`](src/index.css)
registers `bg-canvas`, `bg-panel`, `bg-raise`, `border-line`, `text-ink`, `text-body`, `text-muted`,
`text-faint` and the accent set as Tailwind colours that resolve to the custom properties, so opacity
modifiers (`bg-emerald/20`) work too. A literal colour left in a tab is a bug that the light theme
shows immediately.

## Light and dark

`<html data-theme>` decides every colour. The inline script in [`index.html`](index.html) writes it
before first paint (stored pick, else `prefers-color-scheme`), so there is no flash;
[`src/theme.ts`](src/theme.ts) owns the rules and [`src/useTheme.ts`](src/useTheme.ts) mounts them in
the header toggle.

| Situation | What happens |
| :--- | :--- |
| First visit | The OS decides. Nothing is written to `localStorage`. |
| Toggle clicked | The visible theme flips and `mechalab_theme_v1` stores the side that was picked. |
| Reload, or the OS flips | The stored pick wins; only an unpicked visit keeps following the OS. |
| Corrupt or blocked storage | Falls back to the OS and keeps working — no throw, no broken shell. |

Plots are the exception by design: a canvas or SVG chart sits on `.plot` (`--plot: #070a12`) in both
themes, because the traces are drawn in literal plot colours tuned against that ink. Light mode is
warm paper around dark instrument faces, not a white plot with invisible curves.

Legibility is measured, not eyeballed: `npm run test:theme` pins the storage/OS rules, and
`npm run test:theme:e2e` drives Chromium through all eleven tabs in both themes, compositing each
text run over the backgrounds it actually sits on and failing anything below 3:1 (the current floor
is 4.5:1). The unit suite runs inside `npm run test:workbench`; the browser sweep is its own CI step,
because as a seventh parallel suite it pushed the older ones past their click timeouts. `--warnings` lists runs between 3:1 and their size minimum; `--screenshots` writes one
PNG per tab per theme to `.fb-scratch/theme/`.

Landing hero: [`src/components/StartHereCard.tsx`](src/components/StartHereCard.tsx) renders the
README's own Start-here block (the words come from `src/data/startHere.json`, so the page and the
README cannot drift apart) beside [`HeroArm.tsx`](src/components/HeroArm.tsx) - a live canvas running
the capstone's figure-8 through two-link inverse kinematics. The canvas pauses off-screen, draws one
still frame under `prefers-reduced-motion`, and never exceeds 2x device pixels.

## Stack

Vite 6 · React 19 · TypeScript 5.7 · Tailwind 4 · KaTeX · Lucide. Tests drive the built bundle with
`playwright-core`.

## Run it

```bash
npm install                 # from the repository root, not app/
npm run dev                 # http://localhost:3000, regenerates the lesson registry first
npm run build               # tsc -b && vite build -> ../dist (Pages base path)
npm run lint                # tsc -b only
```

`npm run dev` and `npm run build` both run `predev`/`prebuild`, which regenerate
[`src/data/pythonLessonsData.ts`](src/data/pythonLessonsData.ts) from `exercises/` and the lesson
pages. A stale registry is a build failure, not a silent mismatch.

## Where things live

| Path | What it is |
| :--- | :--- |
| [`src/App.tsx`](src/App.tsx) | The workbench shell: tab list, beginner/advanced view, progress wiring. |
| [`src/components/tabs/`](src/components/tabs) | One file per tab. [`TabPyodideRunner.tsx`](src/components/tabs/TabPyodideRunner.tsx) is the graded runner — editor, expected output, badges, instructor panel. |
| [`src/data/`](src/data) | **Generated.** Lesson registry, spine, start-here card, plant model, link history. Edit the generator, not these files. |
| [`src/outputMatch.ts`](src/outputMatch.ts) | How stdout is compared (exact vs formatting-tolerant), shared by the runner and its tests. |
| [`src/progressMerge.ts`](src/progressMerge.ts) | Merging saved progress between browsers and accounts. |
| [`src/lessonCoach.ts`](src/lessonCoach.ts) | The progressive hints and the stuck-state prompts. |

## Checks that cover this directory

```bash
npm run lint                 # types
npm run test:workbench       # unit-level runner behaviour (happy-dom)
npm run test:e2e             # dev server, one lesson end to end
npm run test:e2e:pages       # built bundle at the Pages base path: every graded entry, ramp R.1-R.6, tablet width
npm run check:lessons        # the registry is current
```

`test:e2e:pages` is the suite that proves what a learner actually opens; it fails if the bundle was
built for `/` instead of `/Mechatronics-Roadmap/`, if an entry the registry ships is missing from the
lesson list, or if any starter verifies.

## Deploying

`.github/workflows/ci.yml` builds `dist/` and the Pages workflow publishes it. The base path comes
from `PAGES_BASE` in [`../vite.config.ts`](../vite.config.ts); override it (`PAGES_BASE=/ npm run
build`) only for a host serving from a domain root, and expect `test:e2e:pages` to fail until the
served base matches.
