# MechaLab Assessment, Skip Test & Ladder Gate Specification

> **Purpose:** Defines the diagnostic **Module Skip Tests**, **Ladder Gate Tests**, **Mandatory Safety Gates**, and **Capstone Qualification Rubrics** across all **48 Bridge Modules (`modules/*.md`)** and **24 Legacy Track Steps** (**72 total modules** in `modules/_index.yaml`).

---

## 1. Two-Tier Assessment Architecture

```mermaid
flowchart LR
    A["Bridge Module Entry"] --> B["Read Safety Notes (if high/low)"]
    B --> C["4-5 Q Module Skip Test (>= 80% + 100% Safety)"]
    C -->|"Pass"| D["Advance to Next Bridge Module"]
    D --> E["Ladder Gate Test (100% Ladder Concepts)"]
    E -->|"Pass (its own mark + 100% Safety)"| F["Unlock Target Legacy Step (1.1 - 3.8)"]
```

 (`Skip Test` vs. `Ladder Gate Test`)

Every bridge module in `modules/*.md` contains a standardized `## 7. Checkpoint` section with executable Python `assert` answer keys:

| Assessment Type | Location | Question Count & Format | Pass Threshold | What Passing Unlocks |
| :--- | :--- | :--- | :--- | :--- |
| **1. Module Skip Test** (`### Skip test`) | Present in **every** bridge module (`modules/*.md`, 48/48 modules), **generated** from one store ([`resources/skip-tests.json`](../resources/skip-tests.json)) by [`scripts/generate_skip_tests.py`](../scripts/generate_skip_tests.py), which also proves each module's `new_concepts` are all examined and every key runs | **4–6 questions** covering `[Recall]`, `[Apply]`, `[Transfer]`, and `[Spaced review -> prior_module_id]` (for non-root modules). At least **75% (3/4, 4/5 or 5/6)** are numerical calculation problems with explicit units and tolerances; every `new_concepts` item is tested at least once. | **$\ge 80\%$** ($4/4$ on 4-Q tests, $\ge 4/5$ on 5-Q tests, $\ge 5/6$ on 6-Q tests) **AND $100\%$ on all safety items** in `safety_level: high` modules (after reading `### Safety notes`). | Skips the remainder of that individual bridge module and advances directly to `## 10. Next modules`. |
| **2. Ladder Gate Test** (`### Gate test`) | Present in **every** bridge module (**48/48**, across **25 ladders** and all **24/24 legacy transitions**): each module publishes its ladder's exam, led by its own concepts - except the Track 00 Tier 2 ladder, whose exam is **generated** ([`scripts/generate_ladder_gate.py`](../scripts/generate_ladder_gate.py)) and rendered identically on all eight of its pages | **4–14 questions** spanning **every** concept introduced across the entire multi-module bridge ladder (`[Concept: ...]` tags, checked by `scripts/validate_modules.py`), with a complete executable Python `assert` answer key and per-question module remediation pointers. | **$\ge 80\%$** on that exam's own mark **AND $100\%$ on all safety items**. | Skips the entire bridge ladder and unlocks the target Legacy Step (`Step 1.1`–`Step 3.8`). |

---

## 2. Complete Index of All 25 Ladder Gate Tests (`modules/*.md`, Organized Tier-First)

Every one of the **24 Legacy Steps (`1.1`–`3.8`)** is preceded by a dedicated Bridge Ladder whose **Ladder Gate Test** every module in that ladder publishes (`48` Gate Tests across `25` ladders; Step 3.7 `06-robotics.T3.07` unites the Track 06 Embodied AI ladder and the Track 07 Industrial Safety ladder). The table names the ladder-final module, whose copy is the canonical one; a module earlier in the ladder leads with its own concepts and recaps the rest, so the exam can be taken at any stopping point. The Track 00 Tier 2 ladder is the exception: its eight pages render one generated paper byte for byte, so no page's copy can drift from another's:

### Tier 1 Gate Tests (8 Ladders → Legacy Steps `1.1`–`1.8`)

| # | Target Legacy Step | Bridge Ladder Sequence (`modules/`) | Ladder-Final Gate Test Module | Safety Level |
| :--- | :--- | :--- | :--- | :--- |
| **1** | **Step 1.1 (`00-foundations.T1.01`)** *(Tier 1 Foundations)* | `T1.00a` $\to$ `T1.00b` $\to$ `T1.00c` $\to$ `T1.00d` $\to$ `T1.00e` | [`modules/00-foundations.T1.00e.md`](../modules/00-foundations.T1.00e.md) | `none` |
| **2** | **Step 1.2 (`01-electronics.T1.02`)** | `T1.01a` $\to$ `T1.01c` $\to$ `T1.01d` $\to$ `T1.01b` | [`modules/01-electronics.T1.01b.md`](../modules/01-electronics.T1.01b.md) | `high` *(Mandatory Safety Gate)* |
| **3** | **Step 1.3 (`02-mechanics.T1.03`)** | `T1.02a` | [`modules/02-mechanics.T1.02a.md`](../modules/02-mechanics.T1.02a.md) | `none` |
| **4** | **Step 1.4 (`03-sensors.T1.04`)** | `T1.03a` | [`modules/03-sensors.T1.03a.md`](../modules/03-sensors.T1.03a.md) | `none` |
| **5** | **Step 1.5 (`04-embedded.T1.05`)** | `T1.04a` $\to$ `T1.04b` | [`modules/04-embedded.T1.04b.md`](../modules/04-embedded.T1.04b.md) | `none` |
| **6** | **Step 1.6 (`05-control.T1.06`)** | `T1.05a` | [`modules/05-control.T1.05a.md`](../modules/05-control.T1.05a.md) | `none` |
| **7** | **Step 1.7 (`06-robotics.T1.07`)** | `T1.06a` | [`modules/06-robotics.T1.06a.md`](../modules/06-robotics.T1.06a.md) | `none` |
| **8** | **Step 1.8 (`07-systems.T1.08`)** *(Tier 1 Integration Boss)* | `T1.07a` | [`modules/07-systems.T1.07a.md`](../modules/07-systems.T1.07a.md) | `high` *(Mandatory Safety Gate)* |

### Tier 2 Gate Tests (8 Ladders → Legacy Steps `2.1`–`2.8`)

| # | Target Legacy Step | Bridge Ladder Sequence (`modules/`) | Ladder-Final Gate Test Module | Safety Level |
| :--- | :--- | :--- | :--- | :--- |
| **9** | **Step 2.1 (`00-foundations.T2.01`)** *(Tier 2 Foundations)* | `T2.00a` $\to$ `T2.00g` $\to$ `T2.00b` $\to$ `T2.00c` $\to$ `T2.00d` $\to$ `T2.00h` $\to$ `T2.00e` $\to$ `T2.00f` | One generated paper on **all eight** pages ([`scripts/generate_ladder_gate.py`](../scripts/generate_ladder_gate.py)) - no page's copy is canonical, because there is only one | `none` |
| **10** | **Step 2.2 (`01-electronics.T2.02`)** | `T2.01a` $\to$ `T2.01b` | [`modules/01-electronics.T2.01b.md`](../modules/01-electronics.T2.01b.md) | `high` *(Mandatory Safety Gate)* |
| **11** | **Step 2.3 (`02-mechanics.T2.03`)** | `T2.02a` | [`modules/02-mechanics.T2.02a.md`](../modules/02-mechanics.T2.02a.md) | `none` |
| **12** | **Step 2.4 (`03-sensors.T2.04`)** | `T2.03a` | [`modules/03-sensors.T2.03a.md`](../modules/03-sensors.T2.03a.md) | `none` |
| **13** | **Step 2.5 (`04-embedded.T2.05`)** *(DMA, FreeRTOS, Zephyr, micro-ROS)* | `T2.04a` $\to$ `T2.04b` $\to$ `T2.04c` $\to$ `T2.04d` | [`modules/04-embedded.T2.04d.md`](../modules/04-embedded.T2.04d.md) | `none` |
| **14** | **Step 2.6 (`05-control.T2.06`)** | `T2.05a` | [`modules/05-control.T2.05a.md`](../modules/05-control.T2.05a.md) | `none` |
| **15** | **Step 2.7 (`06-robotics.T2.07`)** *(ROS 2 Core, Launch, `rosbag2`, Sim)* | `T2.06a` $\to$ `T2.06b` | [`modules/06-robotics.T2.06b.md`](../modules/06-robotics.T2.06b.md) | `none` |
| **16** | **Step 2.8 (`07-systems.T2.08`)** *(Tier 2 Integration Boss)* | `T2.07a` | [`modules/07-systems.T2.07a.md`](../modules/07-systems.T2.07a.md) | `high` *(Mandatory Safety Gate)* |

### Tier 3 Gate Tests (9 Ladders → Legacy Steps `3.1`–`3.8`)

| # | Target Legacy Step | Bridge Ladder Sequence (`modules/`) | Ladder-Final Gate Test Module | Safety Level |
| :--- | :--- | :--- | :--- | :--- |
| **17** | **Step 3.1 (`00-foundations.T3.01`)** *(Tier 3 Foundations)* | `T3.00a` | [`modules/00-foundations.T3.00a.md`](../modules/00-foundations.T3.00a.md) | `none` |
| **18** | **Step 3.2 (`01-electronics.T3.02`)** | `T3.01a` | [`modules/01-electronics.T3.01a.md`](../modules/01-electronics.T3.01a.md) | `high` *(Mandatory Safety Gate)* |
| **19** | **Step 3.3 (`02-mechanics.T3.03`)** | `T3.02a` | [`modules/02-mechanics.T3.02a.md`](../modules/02-mechanics.T3.02a.md) | `none` |
| **20** | **Step 3.4 (`03-sensors.T3.04`)** | `T3.03a` | [`modules/03-sensors.T3.03a.md`](../modules/03-sensors.T3.03a.md) | `none` |
| **21** | **Step 3.5 (`04-embedded.T3.05`)** | `T3.04a` | [`modules/04-embedded.T3.04a.md`](../modules/04-embedded.T3.04a.md) | `none` |
| **22** | **Step 3.6 (`05-control.T3.06`)** | `T3.05a` | [`modules/05-control.T3.05a.md`](../modules/05-control.T3.05a.md) | `none` |
| **23** | **Step 3.7 (`06-robotics.T3.07`)** *(Track 06 Embodied AI)* | `T3.06a` $\to$ `T3.06b` | [`modules/06-robotics.T3.06b.md`](../modules/06-robotics.T3.06b.md) | `high` *(Mandatory Safety Gate)* |
| **24** | **Step 3.7 (`06-robotics.T3.07`)** *(Track 07 Industrial & Safety)* | `T3.06a` | [`modules/07-systems.T3.06a.md`](../modules/07-systems.T3.06a.md) | `high` *(Mandatory Safety Gate)* |
| **25** | **Step 3.8 (`08-capstones.T3.08`)** *(Tier 3 Capstones I–V)* | `T3.07a` | [`modules/08-capstones.T3.07a.md`](../modules/08-capstones.T3.07a.md) | `high` *(Mandatory Safety Gate)* |

---

## 3. Mandatory Safety Gates (`safety_level: high` Modules)

Nine bridge modules carry `safety_level: high` and include a dedicated `### Safety notes` section detailing electrical, energetic, thermal, or kinetic hazards. **No learner may skip a `safety_level: high` module without reading `### Safety notes` and scoring $100\%$ on its safety verification items:**

1. **[`01-electronics.T1.01c`](../modules/01-electronics.T1.01c.md) (*Multimeter, Bench Supply, Breadboard & ESD/Short-Circuit Safety*):** Unpowered DMM continuity beep check, Constant-Current (`CC`) foldback limit calculation, and series vs. parallel ammeter fuse protection.
2. **[`01-electronics.T1.01b`](../modules/01-electronics.T1.01b.md) (*Low-Side MOSFET Switching, PWM Duty Cycle & H-Bridge Polarity Reversal*):** H-bridge same-leg shoot-through prevention ($I_{\text{short}} = V_{\text{bus}} / (2 R_{DS(\text{on})})$) and dead-time enforcement.
3. **[`07-systems.T1.07a`](../modules/07-systems.T1.07a.md) (*Industrial State Machines, Cyclic PLC Scan, E-Stop Chains & Sine-Sweep Gain/Phase*):** Wire-break-safe Normally Closed (`NC`) series hardware E-stop chain and 10-step current-limited bring-up sequence.
4. **[`01-electronics.T2.01b`](../modules/01-electronics.T2.01b.md) (*KiCad 4-Layer Stackup, Parasitic Loop Inductance, Bootstrap Gate Drivers & 48 V Pre-Charge Safety*):** $48\text{ V}$ capacitor bank inrush limiting ($E = \frac{1}{2}CV^2$, pre-charge resistor $R_{\text{pre}}$) and $L_{\text{loop}}\frac{di}{dt}$ avalanche clamping.
5. **[`07-systems.T2.07a`](../modules/07-systems.T2.07a.md) (*Regenerative Braking Shunt Choppers, CAN-FD CRC-16 + Rolling-Counter Watchdogs & SIL/HIL Fault Injection*):** Unclamped regenerative voltage spike prevention ($V_{\text{peak}} = \sqrt{V_{\text{nom}}^2 + 2\Delta E_{\text{regen}}/C_{\text{bus}}}$), hysteretic shunt brake resistor sizing, and CAN-FD rolling-counter watchdog timeouts.
6. **[`01-electronics.T3.01a`](../modules/01-electronics.T3.01a.md) (*6-Layer Flux-Canceling Return Planes, Bessel Filters, SAR Charge-Bucket Settling & Cauer Thermal RC Networks*):** $48\text{ V} / 30\text{ A}$ ($1.44\text{ kW}$) inverter commutation overshoot ($<2\text{ nH}$ loop inductance) and MOSFET transient junction temperature limits ($T_j < 125^\circ\text{C}$).
7. **[`06-robotics.T3.06b`](../modules/06-robotics.T3.06b.md) (*Markov Decision Processes, Policy Gradient / PPO, Action Chunking & Sim-to-Real Safety Wrappers*):** Mandatory deterministic joint-position/torque safety shield (`clip` + CBF-QP + velocity damping) wrapping neural network policies before hardware execution.
8. **[`07-systems.T3.06a`](../modules/07-systems.T3.06a.md) (*OPC UA Information Models, IEC 63278 AAS Submodels & ISO 13849-1 PLd*):** Dual-channel hardware Safe Torque Off (`STO`, Category 3 / PLd, $\text{DC}_{\text{avg}} \ge 90\%$) with startup cross-monitoring pulse diagnostics.
9. **[`08-capstones.T3.07a`](../modules/08-capstones.T3.07a.md) (*System Error/Latency Budgeting, Cross-Domain Interface Contracts & Pre-Bring-Up Safety Sign-Off*):** 4-stage sequential hardware commissioning gate (`Stage 1` unpowered DMM/pre-charge $\to$ `Stage 2` $<1\ \mu\text{s}$ STO trip $\to$ `Stage 3` encoder-to-torque sign match $\to$ `Stage 4` CBF/thermal/watchdog active).

Three additional electronics modules carry `safety_level: low` with dedicated `### Safety notes` sections for benchtop component thermal/flyback hazards: [`01-electronics.T1.01a`](../modules/01-electronics.T1.01a.md), [`01-electronics.T1.01d`](../modules/01-electronics.T1.01d.md), and [`01-electronics.T2.01a`](../modules/01-electronics.T2.01a.md).

---

## 4. Automated Verification Command

To validate the entire 74-module DAG (24 legacy + 50 bridge modules) and execute all 121 embedded Python blocks (worked examples, Skip Test answer keys, and Gate Test answer keys):

```bash
python3 scripts/validate_modules.py
```
