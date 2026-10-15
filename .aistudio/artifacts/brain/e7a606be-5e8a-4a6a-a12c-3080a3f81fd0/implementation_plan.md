# MechaLab Beginner-Readiness & 32-Layer Execution Remediation Plan (Revised)

This plan makes the MechaLab Multi-Pass Mechatronics Roadmap genuinely executable by an absolute beginner from zero prior knowledge, prioritizing **Phase 1 curriculum-critical blockers, inline prerequisite repairs, and canonical first-use toolchain walkthroughs** while demoting optional Workbench UI features to Phase 2.

### User Review & Critical Decisions

> [!IMPORTANT]
> This revised plan incorporates all scope-control, canonical-tooling, and severity-calibration feedback:

- **Confirmed Decision 1 — Strict Scope Control (Curriculum First, UI Demoted to Phase 2)**:
  - **Phase 1 (Core Must-Fix Remediation)** focuses 100% on curriculum sequencing, inline zero-knowledge prerequisites, canonical toolchain first-success walkthroughs, and assessment alignment across `modules/`, track `README.md` files, and `resources/`.
  - **Phase 2 (Should-Fix / Optional Post-Curriculum Polish)** demotes the interactive 32-layer Workbench UI (`TabArchitecture.tsx` / `curriculumData.ts`) so engineering effort is never diverted from making the roadmap itself executable.
- **Confirmed Decision 2 — "Teach Once at First Mandatory Point, Reference Thereafter"**:
  - Hardware and native toolchain walkthroughs are **never** duplicated across every module. Each operational workflow (terminal/venv setup, datasheet reading, `PlatformIO` MCU flashing, `CadQuery` modeling, `KiCad` layout/Gerbers, `Zephyr west`, `ROS 2 colcon`) is taught **once** at the exact first point it becomes mandatory, and subsequent modules link back to that canonical walkthrough.
- **Confirmed Decision 3 — Single Canonical Tool Path Per Execution Layer**:
  - To prevent beginner decision paralysis, each execution layer defines **one canonical supported tool** (with alternatives listed only as optional notes):
    - **Host Scripting & Virtual Env:** `Python 3` + `venv` (`python3 -m venv .venv`)
    - **Host C++20 Compilation:** `g++ -std=c++20`
    - **MCU Tier 1 Build, Flash & Serial Monitor:** `PlatformIO CLI` (`pio run -t upload`, `pio device monitor`)
    - **STM32 Tier 2/3 Flashing & Debug:** `ST-LINK` + `OpenOCD` + `gdb-multiarch`
    - **Parametric Mechanical CAD:** `CadQuery` (code-first Python CAD)
    - **PCB Schematic, Layout & Fab Outputs:** `KiCad` + `kicad-cli`
    - **RTOS Workspace Build:** `Zephyr RTOS` (`west`)
    - **Robotics Middleware:** `ROS 2 Jazzy` (`colcon` workflow)
- **Confirmed Decision 4 — Tiered OS Strategy (Core vs. Secondary Environments)**:
  - **Core Supported Environment (Guaranteed 100% End-to-End Reproducible):** **Ubuntu 24.04 LTS** (native Linux OR **Windows 11 + WSL2 Ubuntu 24.04** with `usbipd-win` for USB pass-through). Every mandatory command across Tiers 1–3 is written and verified for this single environment.
  - **Secondary Environments (Documented Deviations Only):** **macOS (Homebrew)** and **native Windows PowerShell** include concise callout notes for Tier 1–2 host scripts and serial port names (`/dev/cu.usbmodem*`, `COMx`), while directing learners to WSL2/Ubuntu for Tier 2/3 `ROS 2`, `Zephyr`, and `micro-ROS`.

---

## Newly Discovered Gaps (Calibrated by True Progression Impact)

Severity is strictly calibrated so `SAFETY BLOCKER`, `BLOCKER`, and `GAP` are reserved for issues that genuinely stop or endanger a zero-knowledge beginner, while notation and pedagogical polish items are classified as `MINOR FRICTION`:

| Newly discovered issue | First occurrence | Severity | Why previous audit may have missed it | Recommended fix (Teach Once, Reference Thereafter) |
| :--- | :--- | :--- | :--- | :--- |
| **1. Oscilloscope Earth-Ground Clip Short Hazard Missing from Tier 2 Power Module** | Track 01 Tier 2 (`01-electronics.T2.01b`) | `SAFETY BLOCKER` | The rule was buried in `resources/lab-workbench-bom.md` §4, so `T2.01b` (`safety_level: high`) passed structural checks without warning the learner before Step 2.2 ($48\text{ V}$ half-bridge probing) that an oscilloscope BNC ground clip is tied to AC mains earth. | Promote the **Oscilloscope Earth-Ground Clip Short Hazard & Pigtail Spring Tip Rule** directly into `01-electronics.T2.01b.md` (`### Safety notes`) and reference it in Step 2.2. |
| **2. Core OS Environment (`Ubuntu 24.04 / WSL2`) & Terminal Bootstrap Missing Before Module 1** | Entry & Tier 1 Module 1 (`00-foundations.T1.00a`) | `BLOCKER` | Automated runners already run in Linux with `PATH` configured, hiding that a zero-knowledge beginner on Windows/macOS/Linux does not know how to open a terminal, set up WSL2/Ubuntu, create `script.py`, or run `python3 script.py` in `T1.00a`. | Add a canonical **Core Environment Setup (`Ubuntu 24.04 / WSL2` + Secondary macOS/Windows notes)** in `open-source-toolchains.md` §0 and bootstrap terminal + file creation directly in `T1.00a`. |
| **3. Python Virtual Environments (`venv`) & PEP 668 Package Installation Missing** | Tier 1 Module 2 (`00-foundations.T1.00b`) | `BLOCKER` | `T1.00a/b` worked examples only import `math`, masking that installing `numpy`, `matplotlib`, or `cadquery` on Ubuntu 24.04 / macOS fails immediately with `error: externally-managed-environment (PEP 668)` unless `python3 -m venv .venv` is taught. | Teach `python3 -m venv .venv`, `source .venv/bin/activate`, and `pip install numpy matplotlib` once in `T1.00b` (and `open-source-toolchains.md` §0), then reference `.venv` thereafter. |
| **4. MCU Build, Flash (`PlatformIO`) & Linux USB `udev` Permissions Never Taught** | Track 04 Tier 1 (`04-embedded.T1.04a` & Step 1.5 `T1.05`) | `BLOCKER` | `T1.04a/b` simulate C integers in Python, so a beginner reaching Step 1.5 (`T1.05`) has never compiled a C/C++ file (`g++`), run `pio run -t upload`, or fixed `/dev/ttyACM0: Permission denied` (`dialout` / `udev` rules). | Add the canonical **C-for-Python + Host `g++` & First `PlatformIO` Flash Walkthrough** once in `T1.04a` / Step 1.5 (`T1.05`), including Linux `udev` rules and `usbipd-win` pass-through. |
| **5. Parametric CAD (`CadQuery`) & PCB (`KiCad`) Demonstrated Only via Pre-Built Generators** | Track 01 Step 2.2 (`T2.02`) & Track 02 Step 2.3 (`T2.03`) | `BLOCKER` | CI executes `cad_parametric_parts.py` and `generate_foc_pcb_and_bom.py` headlessly, hiding that a beginner is never taught how to write a first 5-line `CadQuery` part or execute the 7-step `KiCad` Schematic $\to$ ERC $\to$ Layout $\to$ DRC $\to$ `kicad-cli` Gerber/BOM/CPL flow. | Add a canonical **First `CadQuery` Part Walkthrough** in Track 02 Step 2.3 and a canonical **`KiCad` Schematic-to-Layout & `kicad-cli` Manufacturing Export Walkthrough** in Track 01 Step 2.2. |
| **6. Zephyr (`west`) & ROS 2 (`colcon`) Workspace Creation Missing First-Success Walkthroughs** | Track 04 (`T2.04c/d`) & Track 06 (`T2.06a`) | `BLOCKER` | `T2.04c/d` and `T2.06a/b` verify scheduling and QoS math in Python, leaving the beginner without the exact commands to initialize a `west` build (`CMakeLists.txt`, `prj.conf`, `app.overlay`), create a `colcon` workspace (`ros2 pkg create`, `colcon build`), or launch `micro_ros_agent`. | Add a canonical **First `west build` Walkthrough** in `T2.04c`, an inline **ROS 2 Graph Primer + `micro_ros_agent` Startup** in `T2.04d`, and a canonical **First `colcon` Package Walkthrough** in `T2.06a`. |
| **7. Reading Component Datasheets & Breakout Pinouts (`DRV8833` / `AS5600`) Assumed** | Track 01 (`T1.01b`) & Legacy Step 1.2 (`T1.02`) | `GAP` | Modules supply pre-extracted constants ($R_{DS(\text{on})} = 0.36\ \Omega$), so a beginner never learns how to locate Pin Configuration tables, Absolute Maximum Ratings, or `DRV8833` pin mappings (`VM, GND, nSLEEP, AIN1/2, AOUT1/2`) in a datasheet. | Teach **How to Read a Datasheet in 5 Minutes + `DRV8833` Pinout Wiring Table** once in `T1.01b` / Step 1.2 (`T1.02`), and reference it in Track 03/04. |
| **8. `SimpleFOC` C++ Sketch Shown in Track 03 Step 1.4 Before Track 04 Introduces C/C++** | Track 03 Legacy Step 1.4 (`T1.04`) | `GAP` | Track 03 precedes Track 04 numerically, exposing the learner to C++ object syntax (`BLDCMotor motor = BLDCMotor(7);`, `setup()`, `loop()`) one step before `04-embedded.T1.04a`. | Add a concise **Reading Arduino/C++ Sketch Blocks** callout in Track 03 Step 1.4 and cross-link to `04-embedded.T1.04a`. |
| **9. End-to-End Binary Serial Unpacking (`C packed struct` $\to$ Python `struct.unpack`) Incomplete** | Track 04 Legacy Step 1.5 (`T1.05`) | `GAP` | Step 1.5 shows the C `struct __attribute__((packed))` transmitter, but omits the matching Python `struct.unpack('<IffH', frame)` receiver and CRC-16 check needed to plot live MCU telemetry on the PC. | Complete the canonical **Binary Telemetry Receiver (`struct.unpack` + CRC-16)** snippet in Track 04 Step 1.5 (`T1.05`). |
| **10. Hardware Debug Probes (`ST-LINK` + `OpenOCD` + `GDB`) Not Walked Through** | Track 04 Tier 2 (`T2.04a` & Step 2.5 `T2.05`) | `GAP` | The BOM lists `STLINK-V3MINIE`, but the 4-wire SWD connection (`SWDIO`, `SWCLK`, `GND`, `VREF`) and `openocd` / `gdb-multiarch` flash-and-breakpoint commands are never shown. | Add a canonical **4-Wire SWD & `OpenOCD` + `GDB` Debug Walkthrough** once in Track 04 Tier 2 (`T2.04a` / `T2.05`). |
| **11. 3D Printing Slicer Orientation & Bearing Press-Fit Clearances Assumed** | Track 02 Legacy Step 1.3 (`T1.03`) | `GAP` | Step 1.3 requires 3D-printing double-shear links and pressing in `608`/`6804` bearings, without specifying layer orientation against bending, perimeter count ($\ge 4$), or diametral clearance ($+0.10\text{ mm}$ press fit, $+0.25\text{ mm}$ slip fit). | Add a concise **3D Slicer Settings & Bearing Fit Tolerance Table** once in Track 02 Step 1.3 (`T1.03`). |
| **12. Python Walrus Operator (`:=`), `zip()`, and `assert`/`1e-9` Syntax Used Before Introduction** | Tier 1 Foundations (`T1.00a` & `T1.00b`) | `MINOR FRICTION` | `T1.00a` uses `import math`, `assert`, `try/except`, and `1e-9` in its worked example; `T1.00b` uses `zip()` in Exercise 5 and walrus `[s := s + k ...]` in Skip Q5 without prior notes. | Add a 3-bullet syntax reader box in `T1.00a`, demonstrate `zip()` and `np.array`/`plt.plot` in `T1.00b`, and replace the `:=` walrus comprehension in `T1.00b` Skip Q5 with standard loop/comprehension syntax. |
| **13. Summation ($\Sigma$) and Partial Derivative ($\partial$) Notation Used Without Local Gloss** | `00-foundations.T1.00b` & `02-mechanics.T2.02a` | `MINOR FRICTION` | Formulas are already accompanied by runnable code, so progression is not blocked, but a zero-calculus beginner benefits from a 1-line translation of $\sum_{i=0}^{N-1} y_i$ and $\frac{\partial x}{\partial q_1}$. | Add 1-line inline glosses mapping $\sum_{i=0}^{N-1} y_i \leftrightarrow \text{sum}(y)$ in `T1.00b` and $\frac{\partial x}{\partial q_1}$ ("sensitivity of $x$ when only $q_1$ moves") in `T2.02a`. |
| **14. `lab00_two_mass_and_so3.py` Mixes Tier 1, Tier 2, and Tier 3 Routines in One File** | Track 00 Legacy Step 1.1 (`T1.01`) | `MINOR FRICTION` | `lab00` runs cleanly (`rc=0`), but a Tier 1 reader inspecting the file sees Tier 2 state-space and Tier 3 $SO(3)$ functions alongside Tier 1 Euler/SO(2) code. | Add clear section banner comments in `lab00_two_mass_and_so3.py` and a 1-sentence note in Step 1.1 telling Tier 1 learners which functions correspond to Pass 1 vs. Pass 2/3. |
| **15. DARE LQR & Kalman Filter Matrix Equations in Step 2.6 Lack Scalar Intuition Bridge** | Track 05 (`05-control.T2.05a` $\to$ Step 2.6 `T2.06`) | `MINOR FRICTION` *(Should Fix)* | `lab05` provides working code, so execution is not blocked, but adding a 1-paragraph scalar precision-weighted average intuition ($K = \frac{\sigma_{\text{pred}}^2}{\sigma_{\text{pred}}^2 + \sigma_{\text{meas}}^2}$) makes the Kalman gain matrix transparent. | Add a concise **Scalar-to-Matrix Kalman Gain Intuition Note** in `05-control.T2.05a` / Step 2.6 (`T2.06`). |

---

## Completeness Check Across All 32 Beginner Execution Layers

Each of the 32 beginner execution layers is mapped to its **single canonical tool** and the **exact module where it is taught once and referenced thereafter**:

| # | Beginner Execution Layer | Current Status | Canonical Tool / Standard | Canonical Teaching Location (Taught Once, Referenced Thereafter) |
| :--- | :--- | :--- | :--- | :--- |
| **1** | **Environment setup** | `Missing` | Ubuntu 24.04 LTS / Windows 11 WSL2 | `resources/open-source-toolchains.md` §0 $\to$ referenced in `T1.00a` |
| **2** | **File/folder handling** | `Missing` | POSIX paths (`mkdir`, `pwd`, `.py` files) | `00-foundations.T1.00a` (`## 3. Formalization` & `## 6. Simulation path`) |
| **3** | **Terminal/CLI basics** | `Taught late` | `bash` (`python3`, `cd`, `ls`) | Bootstrapped in `00-foundations.T1.00a`; expanded in `00-foundations.T1.00b` |
| **4** | **Programming-language basics** | `Partial` | Python 3 (`T1.00a`) & C/C++20 (`T1.04a`) | `00-foundations.T1.00a/b` (Python) & `04-embedded.T1.04a` (C-for-Python bridge) |
| **5** | **Package/dependency installation** | `Missing` | `python3 -m venv .venv` + `pip` | `00-foundations.T1.00b` & `open-source-toolchains.md` §0 |
| **6** | **Build systems** | `Partial` | `PlatformIO` (`T1.05`), `west`/`CMake` (`T2.04c`), `colcon` (`T2.06a`) | Taught once at each tier entry (`T1.05`, `T2.04c`, `T2.06a`) |
| **7** | **Compilation** | `Missing` | `g++ -std=c++20 -O2` | `04-embedded.T1.04a` (`## 6. Simulation path`) & `04-embedded-and-realtime/README.md` |
| **8** | **Running programs** | `Taught late` | `python3 script.py` & `./lab04` | `00-foundations.T1.00a` (Python) & `04-embedded.T1.04a` (C++) |
| **9** | **Debugging errors** | `Taught + Practiced + Assessed` | Python tracebacks, compiler errors, DMM checks | `00-foundations.T1.00a` + `## 8. Common mistakes` across all 44 modules |
| **10** | **Version control** | `Taught + Assessed` | `git` (`init`, `status`, `diff`, `commit`) | `00-foundations.T1.00b` (`## 3. Formalization` & `## 6. Simulation path`) |
| **11** | **Simulation tools** | `Taught + Practiced + Assessed` | MechaLab Browser Workbench + `Falstad` + `MuJoCo` | `00-foundations.T1.00a` (Workbench), `01-electronics.T1.01a` (Falstad), `06-robotics.T2.06b` (MuJoCo) |
| **12** | **Electronics bench setup** | `Taught + Practiced + Assessed` | Regulated CC/CV PSU ($\le 12\text{ V}$ Tier 1) + ESD strap | `01-electronics.T1.01c` (`## 3. Formalization` & `### Safety notes`) |
| **13** | **Measurement tools** | `Partial` (Missing Scope GND rule in `T2.01b`) | True-RMS DMM (`T1.01c`) + Diff Probe / Spring Tip Scope (`T2.01b`) | `01-electronics.T1.01c` (DMM) & `01-electronics.T2.01b` (`### Safety notes` Scope rule) |
| **14** | **Breadboard/prototyping** | `Taught + Practiced + Assessed` | 830-tie breadboard + 22 AWG solid-core color code | `01-electronics.T1.01c` |
| **15** | **Reading datasheets/pinouts** | `Missing` | TI `DRV8833` & AMS `AS5600` datasheet pinout tables | `01-electronics.T1.01b` & `01-electronics-and-power/README.md` (§1.2) |
| **16** | **MCU build/flash workflow** | `Missing` | `PlatformIO` (`pio run -t upload` + Linux `udev` rules) | `04-embedded-and-realtime/README.md` (§1.1–1.2) & `open-source-toolchains.md` |
| **17** | **Serial/log output** | `Partial` | C packed struct $\to$ Python `struct.unpack` + CRC-16 | `04-embedded-and-realtime/README.md` (§1.3) |
| **18** | **Debug probes/SWD/JTAG** | `Missing` | `ST-LINK` + `OpenOCD` + `gdb-multiarch` (4-wire SWD) | `04-embedded.T2.04a` & `04-embedded-and-realtime/README.md` (§2.2) |
| **19** | **CAD** | `Partial` | `OrcaSlicer` tolerances (`T1.03`) + `CadQuery` (`T2.03`) | `02-mechanics-kinematics-dynamics/README.md` (§1.3 & §2.3) |
| **20** | **PCB schematic capture** | `Partial` | `KiCad` Schematic Editor + ERC | `01-electronics-and-power/README.md` (§2.1) |
| **21** | **PCB layout** | `Partial` | `KiCad` PCB Editor (4/6-layer stackup, Kelvin sense, DRC) | `01-electronics-and-power/README.md` (§2.1) & `01-electronics.T2.01b` |
| **22** | **Manufacturing outputs** | `Missing` | `kicad-cli` (Gerbers, Excellon drill, BOM CSV, CPL pos) | `01-electronics-and-power/README.md` (§2.1) & `08-capstone-projects/README.md` (Capstone 1) |
| **23** | **RTOS tooling** | `Taught + Practiced + Assessed` | `FreeRTOS` / `Zephyr` RMS utilization & priority inheritance | `04-embedded.T2.04b` & `Lab 04` (`lab04_realtime_embedded.cpp`) |
| **24** | **Zephyr tooling** | `Partial` | `west` (`CMakeLists.txt`, `prj.conf`, `app.overlay`, `west build`) | `04-embedded.T2.04c` (`## 6. Simulation path`) |
| **25** | **ROS 2 workspace/package workflow** | `Partial` | `ROS 2 Jazzy` + `colcon build` (`ros2 pkg create`) | `06-robotics.T2.06a` (`## 6. Simulation path`) |
| **26** | **micro-ROS bridge workflow** | `Sequencing Gap` | Inline ROS 2 topic primer + `micro_ros_agent serial --dev` | `04-embedded.T2.04d` (`## 2. Intuition first` & `## 6. Simulation path`) |
| **27** | **Simulator integration** | `Taught + Practiced + Assessed` | `MuJoCo` (`python3 -m mujoco.viewer`) + `ros2_control` | `06-robotics.T2.06b` & `08-capstone-projects/models/validate_models.py` |
| **28** | **HIL** | `Taught + Practiced + Assessed` | Fault-injection harness (CRC drop, stall, WCET) | `07-systems.T2.07a` & `07-systems-hil-and-production/lab/lab07_sysid_hil_and_sto.py` |
| **29** | **Capstone fabrication** | `Partial` | Mechanical + PCB + Harness assembly checklists | `08-capstone-projects/README.md` (§1.1, §2.1, §4) |
| **30** | **Capstone bring-up** | `Taught + Practiced + Assessed` | 10-Step Smoke-Free Bring-Up & Pre-Flight Gate | `07-systems.T1.07a`, `08-capstones.T3.07a`, & `08-capstone-projects/README.md` |
| **31** | **Troubleshooting** | `Taught + Practiced + Assessed` | Symptom $\to$ Root Cause $\to$ 2-Minute Fix tables | All 44 `modules/*.md` (`## 8. Common mistakes`) + Exercise troubleshooting hints |
| **32** | **Safety verification** | `Taught + Practiced + Assessed` | Mandatory `### Safety notes` + 100% `[SAFETY]` Gate items | All 12 safety-gated modules (`T1.01a/b/c/d`, `T1.07a`, `T2.01b`, `T2.07a`, `T3.01a`, `T3.06a/b`, `T3.07a`) |

---

### 1. Overview & Core Concept

- **What It Does**: Repairs every zero-knowledge prerequisite gap, sequencing inversion, and missing first-use toolchain workflow across the MechaLab roadmap using a disciplined, curriculum-first execution sequence.
- **Target Audience / Persona**: Absolute beginners with zero prior programming, math, electronics, C/C++, CAD, PCB, or ROS 2 knowledge following the Tier-First progression (`Tier 1 -> Tier 2 -> Tier 3`).
- **Key Value**: Ensures a beginner can genuinely complete the roadmap from Module 1 (`00-foundations.T1.00a`) through the Tier 3 Capstones (`08-capstones.T3.08`) using one canonical tool path per layer and zero outside guessing.

---

### 2. User Experience & Curriculum Workflow Design

- **Key Learner Flows**:
  1. **Step-by-Step Zero-Knowledge Onboarding (`open-source-toolchains.md` §0 $\to$ `T1.00a` $\to$ `T1.00b`)**:
     - The learner configures the **Core Supported Environment** (Ubuntu 24.04 LTS or Windows 11 WSL2 Ubuntu 24.04; macOS Homebrew notes provided as secondary), creates a `.venv` virtual environment, saves their first `.py` script, and understands `import`, `assert`, `1e-9`, `zip()`, and $\Sigma$ summation before they are used in exercises or Skip tests.
  2. **Self-Contained Tier 1 Progression (`T1.00a` $\to$ `T1.08`)**:
     - When `01-electronics.T1.01d` and `07-systems.T1.07a` introduce filter cutoff ($-3\text{ dB}$) and sine-sweep frequency response ($\lvert G(j2\pi f)\rvert_{\text{dB}} = 20\log_{10}(B/A)$), base-10 logarithms and decibels are explained inline in `T1.07a` without requiring Tier 2 (`00-foundations.T2.00d`).
     - Before touching hardware or `SimpleFOC`/`PlatformIO` in Tracks 01–04, the learner receives a **one-time canonical walkthrough** for reading datasheet pinouts (`DRV8833`/`AS5600`), 3D slicer orientation & bearing press-fit tolerances, C-for-Python syntax + `g++` compilation, `PlatformIO` upload + Linux `udev` permissions, and binary `struct.unpack` serial telemetry.
  3. **Canonical Tier 2 & Tier 3 Engineering Workflows (`T2.00a` $\to$ `T3.08`)**:
     - At the exact point where custom PCBs (`T2.01b`/`T2.02`), parametric CAD (`T2.03`), SWD debugging (`T2.04a`), Zephyr (`T2.04c`), `micro-ROS` (`T2.04d`), and `ROS 2` (`T2.06a`) enter the roadmap, the learner follows a concise, reproducible first-success recipe using the single canonical tool (`KiCad`/`kicad-cli`, `CadQuery`, `OpenOCD`+`GDB`, `west`, `colcon`) and observes the mandatory **Oscilloscope Earth-Ground Clip Safety Rule** in `T2.01b`.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1 — Strictly Ordered 6-Step Execution Plan (Demoting UI to Phase 2)**
  - *Chosen Approach*: Execute curriculum repairs in the exact 6-step order below, leaving Workbench UI additions (`TabArchitecture.tsx`) to Phase 2 only after all curriculum and assessment checks pass:
    1. **Fix zero-knowledge blockers, inline prerequisites, and sequencing** (`T1.00a`, `T1.00b`, Tier-1 dB in `T1.01d`/`T1.07a`, C-for-Python in `T1.04a`, `SimpleFOC` C++ note in `T1.04`, ROS 2 primer before `micro-ROS` in `T2.04d`, oscilloscope earth-ground safety in `T2.01b`, plus local $\Sigma$/$\partial$/Kalman glosses and `lab00` tier comments).
    2. **Add minimal canonical toolchain first-success workflows** (`Ubuntu 24.04 / WSL2` core setup, `venv`/PEP 668, datasheet & pinout reading, 3D slicing/bearing tolerances) once at first mandatory use.
    3. **Add native C/MCU (`PlatformIO` + `OpenOCD`/SWD + Python `struct.unpack`), `CadQuery`, `KiCad` (`kicad-cli` Gerbers/BOM/CPL), `Zephyr` (`west`), and `ROS 2` (`colcon`) first-use execution practice** at their canonical entry points.
    4. **Repair and synchronize Skip/Gate assessments** (such as replacing the unexplained `:=` walrus comprehension in `T1.00b` Skip Q5 and verifying 100% `[SAFETY]` coverage in `T2.01b`).
    5. **Re-run the chronological beginner simulation and automated CI verification** (`validate_modules.py`, `verify_repo.py`, `run_all_labs.py`).
    6. **Phase 2 (Optional Post-Fix):** Only after Steps 1–5 are 100% complete, optionally add a lightweight readiness summary in the Workbench UI if needed.
  - *Why*: Keeps 100% of engineering focus on beginner completability and prevents UI scope creep or module bloat.

---

### 4. Technical Architecture & Verification Strategy

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                 PHASE 1: CURRICULUM-CRITICAL REMEDIATION PIPELINE            │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ Step 1: Zero-Knowledge Blockers, Inline Prerequisites & Sequencing     │  │
│  │ • T1.00a: Terminal/file bootstrap + import/assert/try/1e-9 syntax box  │  │
│  │ • T1.00b: venv/PEP 668, ∑ gloss, zip(), np.array/plt.plot, fix Skip Q5 │  │
│  │ • T1.01d & T1.07a: Self-contained inline log10 & dB (no T2 dependency) │  │
│  │ • T1.04 (Track 03): C++ sketch primer before SimpleFOC                 │  │
│  │ • T1.04a: C-for-Python syntax table & canonical g++ compile command    │  │
│  │ • T2.01b: Oscilloscope Earth-Ground Clip Short Hazard in Safety notes  │  │
│  │ • T2.04d: Inline ROS 2 Node/Topic/QoS primer before micro-ROS bridge   │  │
│  │ • T2.02a, T2.05a & lab00: ∂ gloss, scalar Kalman bridge, tier banners  │  │
│  └───────────────────────────────────┬────────────────────────────────────┘  │
│                                      ▼                                       │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ Step 2 & Step 3: Canonical First-Success Toolchain Walkthroughs        │  │
│  │ (Taught ONCE at first mandatory point; referenced thereafter)          │  │
│  │ • Core OS: Ubuntu 24.04 LTS / Win11 WSL2 (+ secondary macOS/Win notes) │  │
│  │ • Datasheets & Pinouts: DRV8833 & AS5600 wiring in Track 01 Step 1.2   │  │
│  │ • 3D Slicing & Fits: Layer orientation & bearing clearances in T1.03   │  │
│  │ • MCU Flash & Telemetry: PlatformIO + udev + struct.unpack in T1.05    │  │
│  │ • SWD Debug: ST-LINK + OpenOCD + gdb-multiarch in Track 04 Tier 2      │  │
│  │ • Parametric CAD: First 5-line CadQuery part in Track 02 Step 2.3      │  │
│  │ • PCB & Fab: KiCad ERC/DRC + kicad-cli Gerbers/BOM/CPL in Step 2.2     │  │
│  │ • RTOS & ROS 2: Zephyr west in T2.04c & ROS 2 colcon in T2.06a         │  │
│  └───────────────────────────────────┬────────────────────────────────────┘  │
│                                      ▼                                       │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ Step 4 & Step 5: Assessment Sync & Automated Verification Gates        │  │
│  │ • validate_modules.py (44 modules, 10 H2 template, 25 Gate assessments)│  │
│  │ • verify_repo.py (60 files, Mermaid syntax, MathJax/KaTeX, 1177+ links)│  │
│  │ • run_all_labs.py (12 Python + C++20 lab suites) & npm run build       │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```
