# MechaLab Open-Source Course Packaging, CI Output Verification & In-Browser Interactive Runner

This plan upgrades the Mechatronics & Robotics Roadmap from a raw repository into a self-contained, legally reusable open-source course with verified numerical outputs, a one-screen landing guide, complete Tier 1 beginner lessons across Tracks 03–08, clean TeX math authoring, and an in-browser Python (Pyodide) code runner + adaptive placement quiz inside the interactive workbench.

## User Review & Critical Decisions

> [!IMPORTANT]
> All core scope and packaging choices were confirmed during Phase 1 clarification:

- **Confirmed Decision 1 (Licensing & Attribution)**: Adopt a **Dual License (`CC BY 4.0` for curriculum documentation and `MIT` for simulation/workbench code)** with dedicated attribution for `engyasin/awesome-mechatronics`, plus `CONTRIBUTING` guidelines and structured issue templates for reporting lesson errors.
- **Confirmed Decision 2 (Full-Scope Quality & Pedagogical Upgrade)**: Execute all six prioritized workstreams in this pass:
  1. Fix the `DRV8833` motor-driver voltage rating mismatch ($2.7\text{–}10.8\text{ V}$ operating / $11.8\text{ V}$ abs max vs. $12\text{ V}$ `TB6612FNG`/`DRV8871` buses) and diff every `Expected output:` block in CI (fixing the stale `05-control.T1.05a` PID overshoot numbers `0.372 rad` and `0.047 rad`).
  2. Add `LICENSE`, `CONTRIBUTING`, issue templates, and `awesome-mechatronics` attribution.
  3. Slim the root landing document to a clean, one-screen course overview (who it is for, the three-step learning path, the curriculum map, simulator vs. hardware badges, and transparent cost tiers), delegating detailed track tables and quizzes to the track guides and removing root planning clutter.
  4. Strip `\kern0pt` and `\_` LaTeX workarounds from source markdown and add a clean-TeX build/check utility plus dynamic module/bridge/ladder count generation from the central module index.
  5. Expand Tier 1 of Tracks 03 through 08 into full beginner-template lessons (max 2 ideas, link-first resources, hint ladders, runnable verification, and explicit C/C++ embedded bridge syntax for `volatile`, ISRs, and structs).
  6. Embed an in-browser **Pyodide Python Sandbox** and an **Interactive Prerequisite Placement Quiz** directly inside the Vite workbench.
- **Confirmed Decision 3 (Repository Layout)**: Keep the track folders (`track-p`, `stage-0`, `00`–`08`, `modules`, `resources`) at the repository root so all existing lesson URLs and cross-links remain stable, while archiving planning/report artifacts out of the root landing view.

---

## 1. Overview & Core Concept

- **What It Does**: Provides an end-to-end, zero-to-production Mechatronics & Robotics learning platform combining a dependency-checked markdown curriculum (Track P $\to$ Stage 0 $\to$ Tracks 00–08 across 3 progressive tiers) with an interactive browser workbench featuring real-time physics/control simulators, an in-browser Python (`Pyodide`) exercise runner, and a dependency-graph placement diagnostic.
- **Target Audience / Persona**: Self-taught learners, software engineers transitioning to robotics, and undergraduate makers starting with $0 in simulator-only mode before optionally purchasing a $20 microcontroller kit or a $150 closed-loop motor control bench.
- **Key Value**: Eliminates the "beginner cliff" between Python foundations and embedded C++/control loops, guarantees that every stated numerical output in every lesson and module matches live execution in CI, and lets learners run starter code, hint ladders, and `assert` checks directly in the browser without external tool friction.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **One-Screen Course Onboarding & Cost Transparency**: Learners arriving at the root overview immediately see the three-step progression (`Track P` Python $\to$ `Stage 0` Circuits/Arduino $\to$ `Pass 1` Tier 1 Robotics), which steps run 100% free in browser simulators versus optional hardware tiers ($0 Sim-Only vs. $20 Starter Kit vs. $150 Closed-Loop Bench), and how to launch the interactive workbench.
  2. **Adaptive Placement Diagnostic**: Learners click **Placement Quiz** in the workbench toolbar to answer 6–8 targeted diagnostic questions spanning algebra/trig, DC circuits, embedded C/ISRs, planar kinematics, and PID control. The quiz traverses the module prerequisite graph to recommend the exact starting track and lesson.
  3. **In-Browser Python (`Pyodide`) Lesson Sandbox**: Learners select any beginner Python lesson (`Track P` or `Tracks 00–08` Tier 1), edit the pre-loaded starter code in a split-pane workbench, toggle progressive 3-step hints without spoiling the full solution, click **Run & Verify Asserts**, and inspect live stdout diffed against the expected output.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Precision educational instrument and interactive laboratory notebook (following the Education & Interactive Simulations domain guidelines).
  - *Color Palette & Mood* (`60-30-10` discipline):
    - **60% Dominant Canvas**: Deep slate laboratory stage (`#0F172A` / `--background`) with high-legibility light prose (`#F8FAFC`).
    - **30% Structural Surfaces**: Subdued instrument panels (`#1E293B`), crisp `1px` hairline borders (`#334155`), and coordinate axes.
    - **10% Semantic Focal Accents**: Vibrant Azure (`#0284C7`) for active controls and primary execution actions; Emerald (`#059669`) paired with explicit `PASS` labels for verified assertions; Coral Red (`#DC2626`) and Amber (`#D97706`) paired with explicit `FAIL` / `SATURATED` text labels for errors and physical limits.
  - *Typography & Hierarchy* (`2+1` Font Rule):
    - **Display / Headings**: `Plus Jakarta Sans` (`600`/`700` weight, `text-wrap: balance`) for clean section hierarchy.
    - **Body Prose**: `DM Sans` (`400`/`500` weight, `65–75ch` measure) for readable explanations and hint ladders.
    - **Code, Equations & Telemetry**: `JetBrains Mono` / `IBM Plex Mono` with `tabular-nums` for aligned numerical tables, code editors, and KaTeX math formulas.
  - *Component Styling & Layout*:
    - **Two-Zone Sandbox Layout**: Left/top 60–65% interactive code/simulation canvas paired with right/bottom 35–40% concept deck, progressive hint accordion, and assertion output console.
    - **Zero-Pill & Anti-Slop Discipline**: Static metadata (estimated hours, prerequisite IDs, simulator vs. hardware mode) rendered as clean unboxed text separated by `·`. No `//` comment headers, no pulsing decorative status dots, and no nested card-in-card borders.
- **Interactive Feedback & Motion**:
  - Immediate `<150ms` button/tab transitions; clear WebAssembly loading progress indicator when initializing the Pyodide runtime; explicit dual-coded (`icon + text label + color`) pass/fail banners when running lesson assertions.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: In-Browser Python Execution Engine**
  - *Chosen Approach*: Load `Pyodide` (WebAssembly CPython) lazily when the learner opens the Interactive Python Sandbox tab, with a built-in pure-TypeScript fallback evaluator for instant zero-network startup in offline/CI environments.
  - *Why*: Executes real Python 3 syntax (`math`, loops, functions, `assert` checks) identically to local CPython without slowing down initial page load for users viewing the 3D/Bode/FOC simulators.
  - *Alternatives Considered*: Server-side Python execution (rejected to keep the Vite deployment 100% static and self-hostable).
- **Decision 2: Strict CI Stdout Diffing for Worked Examples & Lessons**
  - *Chosen Approach*: Extend the module and lab verification suite so every Python block followed by an `Expected output:` fence executes in a subprocess/sandbox and diffs its captured stdout line-by-line against the stated output block, while also auto-verifying module/bridge/ladder counts directly from the YAML index.
  - *Why*: Pure `assert` checks missed the stale `Unclamped OS=0.220` text in `05-control.T1.05a`; stdout diffing makes it impossible for prose output blocks to drift from code.
- **Decision 3: Clean-TeX Source Hygiene**
  - *Chosen Approach*: Remove `\kern0pt` and `\_` subscript workarounds from markdown source files in favor of clean, readable TeX (`\text{ word }`, standard subscripts) validated by the math audit pipeline.
  - *Why*: Keeps raw markdown readable in any text editor while preserving 100% GitHub MathJax and KaTeX compatibility.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                   MechaLab Curriculum & Interactive Workbench                │
├──────────────────────────────────────┬───────────────────────────────────────┤
│     Markdown Curriculum & CI         │         Vite React Workbench          │
│                                      │                                       │
│  ┌────────────────────────────────┐  │  ┌─────────────────────────────────┐  │
│  │ Root Overview + Governance     │  │  │ Top Navigation & Guided Tour    │  │
│  │ (LICENSE, CONTRIBUTING, BOM)   │  │  └────────┬───────────────┬────────┘  │
│  └───────────────┬────────────────┘  │           │               │           │
│                  ▼                   │           ▼               ▼           │
│  ┌────────────────────────────────┐  │  ┌─────────────────┐ ┌─────────────┐  │
│  │ Full Beginner Lesson Sequence  │  │  │ Pyodide Python  │ │ Adaptive    │  │
│  │ • Track P (P.1–P.M)            │  │  │ Lesson Runner   │ │ Placement   │  │
│  │ • Stage 0 (S0.1–S0.M)          │  │  │ • Starter Code  │ │ Diagnostic  │  │
│  │ • Tracks 00–02 (00.1–02.5)     │  │  │ • 3-Step Hints  │ │ • Prereq    │  │
│  │ • Tracks 03–08 (03.1–08.M)     │  │  │ • Assert & Diff │ │   Graph     │  │
│  └───────────────┬────────────────┘  │  └─────────────────┘ └─────────────┘  │
│                  ▼                   │                   │                   │
│  ┌────────────────────────────────┐  │  ┌────────────────▼────────────────┐  │
│  │ Automated Verification Suite   │  │  │ 8 Real-Time Physics Simulators  │  │
│  │ • Expected Output Stdout Diff  │  │  │ (Bode, FOC, Furuta, URDF/STO,   │  │
│  │ • Term-Order & Idea Linter     │  │  │  CAD/PCB, SysID, Attitude ESKF) │  │
│  │ • Index Count & Math Auditor   │  │  └─────────────────────────────────┘  │
│  └────────────────────────────────┘  │                                       │
└──────────────────────────────────────┴───────────────────────────────────────┘
```

- **Data Model & State**:
  - **Curriculum Lesson Registry**: Structured metadata for all beginner lessons (`Track P`, `Stage 0`, `Tracks 00–08` Tier 1) including starter code, 3-step hints, full solution, expected stdout, prerequisite IDs, and simulator vs. hardware tags.
  - **Placement Graph State**: Maps diagnostic questions to prerequisite nodes in the curriculum graph, computing the learner's highest verified mastery frontier and recommended starting lesson.
  - **Sandbox Execution State**: Tracks editor code buffer, revealed hint index (`0..3`), execution stdout/stderr, assertion pass/fail status, and expected-output diff status in `localStorage`.
- **Interactive Component & State Mapping**:
  - **Lesson Selector & Code Editor**: Selecting any lesson loads its starter code and expected output; clicking **Reset Starter** restores default code; clicking **Reveal Next Hint** increments the hint counter; clicking **Run & Verify** executes the Python buffer and compares stdout against the lesson's expected output block.
  - **Placement Quiz Modal / View**: Answering each multiple-choice diagnostic question updates the mastery vector and displays an immediate explanation plus a one-click **Jump to Recommended Lesson** action.
