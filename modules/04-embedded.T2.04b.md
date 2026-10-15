---
id: 04-embedded.T2.04b
title: "RTOS Tasks, FreeRTOS Preemptive Scheduling, Priority Inversion & CAN Bus Bitwise Arbitration"
track: "04"
tier: 2
prereqs:
  - 04-embedded.T2.04a
new_concepts:
  - rtos_preemptive_scheduling_and_cpu_utilization
  - unbounded_priority_inversion_and_inheritance
  - can_bitwise_arbitration_and_mit_packing
uses:
  - non_blocking_tick_scheduler
  - hardware_isr_and_volatile_contract
  - dma_zero_cpu_memory_transfer
est_hours: 4.0
hardware_required: false
safety_level: none
resources_verified: false
---

## 1. Why it matters
When your firmware grows to include a $1\text{ kHz}$ impedance controller, a $200\text{ Hz}$ CAN-FD bus manager, and a $50\text{ Hz}$ diagnostics logger, a single bare-metal `loop()` becomes brittle: one slow calculation delays the fast control tick. A **Real-Time Operating System (RTOS)** such as **FreeRTOS** lets high-priority tasks (`xTaskCreate`, `vTaskDelayUntil`) preempt low-priority tasks deterministically, **Priority Inheritance Mutexes** (`xSemaphoreCreateMutex`) prevent catastrophic priority inversion (the bug that froze the Mars Pathfinder!), and **CAN bitwise arbitration** lets multiple robot joints share a 2-wire differential bus without packet collisions. Already know this? Take the Skip test in section 7 first.

## 2. Intuition first
Imagine an emergency room with one doctor (a single-core CPU):
- **Rate-Monotonic Preemption & FreeRTOS Task States:** Every FreeRTOS task (`TaskFunction_t`) lives in one of four states: `Running`, `Ready`, `Blocked` (waiting on a timer tick via `vTaskDelayUntil(&xLastWakeTime, pdMS_TO_TICKS(1))` or a queue/semaphore), or `Suspended`. Under **Rate-Monotonic Scheduling (RMS)**, faster-repeating tasks receive higher fixed priority: a patient needing a 1-millisecond heartbeat check (`Task_Ctrl`, high priority) immediately preempts a 100-millisecond paperwork task (`Task_Log`, low priority) via the Cortex-M `PendSV` context-switch exception.
- **Unbounded Priority Inversion & Priority Inheritance:** Suppose `Task_Log` locks a shared medical chart (a mutex), gets interrupted by `Task_Ctrl` which also needs that chart and blocks waiting for `Task_Log`—and then a medium-priority task (`Task_Telem`, which doesn't even use the chart!) preempts `Task_Log` for $50\text{ ms}$, starving the high-priority `Task_Ctrl`! **Priority Inheritance** (`xSemaphoreCreateMutex()`) fixes this instantly: the moment `Task_Ctrl` waits on a mutex held by `Task_Log`, `Task_Log` temporarily inherits `Task_Ctrl`'s top priority so `Task_Telem` cannot cut in line.
- **CAN Bus Non-Destructive Arbitration:** On a **CAN bus**, every bit `0` is actively driven (**dominant**) while bit `1` is passive (**recessive**). If Joint 1 (`ID 0x01`) and Joint 2 (`ID 0x05`) transmit at the exact same microsecond, Joint 1's `0` bit overwrites Joint 2's `1` bit, so Joint 2 notices it lost arbitration and backs off automatically with zero corruption of Joint 1's frame.

## 3. Formalization
1. **Rate-Monotonic CPU Utilization & Preemptive Scheduling (`FreeRTOS`):** For $n$ periodic tasks with worst-case execution times $C_i$ ($\text{s}$) and periods $T_i$ ($\text{s}$), total CPU utilization is:

$$
U = \sum_{i=1}^{n} \frac{C_i}{T_i}
$$

   Necessary condition for schedulability on one core: $U \le 1.0$ (and the Liu-Layland sufficient bound $U \le n(2^{1/n} - 1)$, which evaluates to $\approx 0.7798$ for $n=3$; exact schedulability is verified via Response-Time Analysis $R_i = C_i + \sum_{j \in hp(i)} \lceil R_i / T_j \rceil C_j \le D_i$ in Step 2.5). In FreeRTOS, drift-free periodic execution uses absolute wake times:
   ```c
   TickType_t xLastWake = xTaskGetTickCount();
   for (;;) {
       run_1khz_control_step();
       vTaskDelayUntil(&xLastWake, pdMS_TO_TICKS(1)); // Exact 1.0 ms period, zero cumulative drift
   }
   ```
2. **Priority Inversion vs. Priority Inheritance Mutex (`xSemaphoreCreateMutex`):** If low-priority task $L$ holds a shared lock for critical section duration $B_i$, a naive binary semaphore (`xSemaphoreCreateBinary`) allows any medium-priority task $M$ ($P_L < P_M < P_H$) to preempt $L$, inflating $H$'s blocking delay by $\sum C_M$:

$$
R_{H,\text{inverted}} = C_H + B_i + \sum_{M} C_M, \qquad R_{H,\text{inherited}} = C_H + B_i
$$

   FreeRTOS mutexes (`xSemaphoreCreateMutex()`) implement **Priority Inheritance** automatically so high-priority task $H$ is blocked for at most $B_i$.
3. **CAN Non-Destructive Bitwise Arbitration & Fixed-Point MIT Mode Packing:**
   - **Arbitration:** CAN transmits the 11-bit Identifier MSB-first. Because `0` is dominant and `1` is recessive, the frame with the **lowest numeric CAN ID** always wins arbitration with zero bit delay.
   - **MIT Cheetah Fixed-Point Mapping:** Mapping float $x \in [x_{\min}, x_{\max}]$ into an $N$-bit unsigned integer $u \in [0, 2^N - 1]$ for compact 8-byte CAN frames:

$$
u = \operatorname{round}\!\left(\frac{x - x_{\min}}{x_{\max} - x_{\min}} (2^N - 1)\right), \quad \hat{x} = x_{\min} + \frac{u}{2^N - 1}(x_{\max} - x_{\min})
$$


## 4. Worked example
Compute total CPU utilization $U$ for a 3-task FreeRTOS actuator node, compare worst-case high-priority response time with and without Priority Inheritance during mutex contention, and verify CAN bus arbitration + 16-bit MIT fixed-point quantization.

```python
import math

tasks = [
    ("Ctrl_1kHz",  120.0, 1000.0),   # C_1 = 120 us, T_1 = 1000 us
    ("CAN_500Hz",  250.0, 2000.0),   # C_2 = 250 us, T_2 = 2000 us
    ("Diag_100Hz", 800.0, 10000.0),  # C_3 = 800 us, T_3 = 10000 us
]
U_total = sum(c / t for _, c, t in tasks)
assert math.isclose(U_total, 0.12 + 0.125 + 0.08, rel_tol=1e-9)
assert U_total < 0.77976  # Below 3-task Liu-Layland bound!

# Priority Inversion vs Priority Inheritance (FreeRTOS xSemaphoreCreateMutex):
# Task_H (C_H=100us) blocked by Task_L critical section (B=40us), while Task_M (C_M=600us) is ready:
resp_no_inheritance_us = 100.0 + 40.0 + 600.0   # Task_M preempts Task_L -> 740 us!
resp_with_inheritance_us = 100.0 + 40.0         # Task_L inherits P_H, blocks Task_M -> 140 us!
assert resp_no_inheritance_us == 740.0 and resp_with_inheritance_us == 140.0

# CAN bitwise arbitration: lowest ID wins
bus_ids = [0x105, 0x012, 0x04A]
winner_id = min(bus_ids)
assert winner_id == 0x012

# 16-bit MIT position quantization over [-12.5, +12.5] rad
p_min, p_max, bits = -12.5, 12.5, 16
u_code = round((0.0 - p_min) / (p_max - p_min) * ((1 << bits) - 1))
p_rec = p_min + (u_code / ((1 << bits) - 1)) * (p_max - p_min)
assert abs(p_rec - 0.0) < 0.0005
print(f"U={U_total:.3f}, R_inv={resp_no_inheritance_us:.0f} us vs R_inh={resp_with_inheritance_us:.0f} us, CAN_win=0x{winner_id:03X}, u_zero={u_code}")
```
Expected output:
```text
U=0.325, R_inv=740 us vs R_inh=140 us, CAN_win=0x012, u_zero=32768
```

## 5. Exercise
Suppose a 12-bit (`0..4095`) MIT-mode torque command encodes $\tau \in [-18.0\text{ N}\cdot\text{m}, +18.0\text{ N}\cdot\text{m}]$. Compute (a) the integer code $u$ for $\tau = +9.0\text{ N}\cdot\text{m}$ ($\frac{9.0 - (-18.0)}{36.0} \times 4095$) rounded to the nearest integer, and (b) the quantization step size $\Delta\tau = \frac{36.0}{4095}$ in $\text{N}\cdot\text{m}$. Verify $u = 3071$ and $\Delta\tau \approx 0.0087912\text{ N}\cdot\text{m}$ ($\pm 10^{-6}$).
- **If your result differs:** Check that the full span is $18.0 - (-18.0) = 36.0\text{ N}\cdot\text{m}$, so $+9.0\text{ N}\cdot\text{m}$ sits at $75\%$ of full scale ($0.75 \times 4095 = 3071.25 \to 3071$).


- **📚 What to Learn & Resources to Solve This Exercise:**
  - **Required Foundations Modules (`00-foundations`):** [`00-foundations.T1.00a`](00-foundations.T1.00a.md)–[`00-foundations.T1.00c`](00-foundations.T1.00c.md) (*Python Dictionaries, CLI & Clock Frequency Units*).
  - **Prerequisite Bridge Modules:** [`04-embedded.T1.04a`](04-embedded.T1.04a.md) (*C Structs & Macros*) and [`04-embedded.T2.04a`](04-embedded.T2.04a.md) (*DMA & Peripherals*).
  - **Core Concepts to Review First:** Zephyr `west build` hermetic pipeline, Devicetree (`.dts`/`.overlay`) compile-time macro resolution (`DT_NODELABEL`, `GPIO_DT_SPEC_GET`, `SPI_DT_SPEC_GET`), and `prj.conf` Kconfig validation in `## 3. Formalization` and `## 4. Worked example` above.
  - **Study Links & Resources:** [Zephyr Project Official Devicetree & Kconfig Guide (`docs.zephyrproject.org`)](https://docs.zephyrproject.org/latest/build/dts/index.html) and [`resources/open-source-toolchains.md`](../resources/open-source-toolchains.md).

## 6. Simulation path
Open **Tab 8 (Real-Time Concurrency, Scheduling & CAN Framing)** in the MechaLab Workbench (`npm run dev`) to inspect preemptive task timelines and priority inheritance mutex behavior.

No hardware required for this module (`hardware_required: false`). In Step 2.5 (`04-embedded.T2.05`), your `STM32G4` or `ESP32` runs `FreeRTOS` with `vTaskDelayUntil()` for drift-free periodic execution and `FDCAN` hardware filters for $1\text{ kHz}$ MIT-mode actuator frames:
```text
[Task_Ctrl 1 kHz (Prio 3)] <--(xSemaphoreCreateMutex / Queue)--> [Task_CAN 500 Hz (Prio 2)] <==> [CAN Bus 120 Ohm]
```
Pass/fail verification in simulation: `U_total == 0.325`, `resp_with_inheritance_us == 140.0 us`, and `winner_id == 0x012`.


```mermaid
flowchart LR
    A["04-embedded.T2.04b: rtos_preemptive_scheduling_and_cpu_utilization"] --> B["unbounded_priority_inversion_and_inheritance"]
    B --> C["can_bitwise_arbitration_and_mit_packing"]
    C --> D["Verified Simulation & Checkpoint Pass"]
```

## 7. Checkpoint
Pass criteria: run the worked example and exercise asserts with zero errors, or score $\ge 80\%$ ($4/4$) on the Skip test below.

### Skip test
1. `[Recall] [Concept: rtos_preemptive_scheduling_and_cpu_utilization]` Compute the total CPU utilization $U = \frac{C_1}{T_1} + \frac{C_2}{T_2}$ (tolerance $\pm 10^{-9}$) for two FreeRTOS tasks: Task 1 ($C_1 = 200\ \mu\text{s}, T_1 = 1000\ \mu\text{s}$) and Task 2 ($C_2 = 500\ \mu\text{s}, T_2 = 2500\ \mu\text{s}$).
2. `[Apply] [Concept: unbounded_priority_inversion_and_inheritance]` A high-priority control task ($C_H = 100\ \mu\text{s}$) blocks on a FreeRTOS mutex (`xSemaphoreCreateMutex()`) held by a low-priority task ($B = 40\ \mu\text{s}$ remaining critical section) while a medium-priority task ($C_M = 600\ \mu\text{s}$) is ready. Compute the worst-case response time $R_H = C_H + B$ in microseconds ($\mu\text{s}$, tolerance $\pm 10^{-6}$) when **Priority Inheritance** is enabled.
3. `[Transfer] [Concept: can_bitwise_arbitration_and_mit_packing]` Encode a target velocity of $x = +15.0\text{ rad/s}$ over symmetric range $[x_{\min}, x_{\max}] = [-30.0, +30.0]\text{ rad/s}$ into a 12-bit unsigned integer $u = \operatorname{round}\!\left(\frac{x - x_{\min}}{x_{\max} - x_{\min}} \cdot 4095\right)$ (tolerance $\pm 10^{-9}$).
4. `[Spaced review -> 04-embedded.T2.04a — Concept: non_blocking_tick_scheduler] [Concept: can_bitwise_arbitration_and_mit_packing]` Why must a high-speed ($1\text{ Mbps}$ / $5\text{ Mbps}$ CAN-FD) twisted-pair differential bus have a $120\ \Omega$ termination resistor at **each physical end** of the trunk cable (giving $60\ \Omega$ DC resistance between `CAN_H` and `CAN_L` when powered off)?
   - **A.** To warm up the cable in winter.
   - **B.** To match the $120\ \Omega$ characteristic impedance of the twisted pair at both ends, absorbing high-frequency signal edges so they do not reflect back and corrupt dominant/recessive arbitration bits.
   - **C.** To short `CAN_H` to $+48\text{ V}$.
   - **D.** To double the CAN ID range.

**Answer key:**
```python
import math

q1_u = (200.0 / 1000.0) + (500.0 / 2500.0)
q2_rh_us = 100.0 + 40.0
q3_u12 = round((15.0 - (-30.0)) / 60.0 * 4095)
q4_choice = "B"
assert math.isclose(q1_u, 0.40, rel_tol=1e-9)
assert math.isclose(q2_rh_us, 140.0, rel_tol=1e-9)
assert math.isclose(q3_u12, 3071.0, rel_tol=1e-9)
assert q4_choice == "B"
```
- **Pass mark:** $4/4$ ($80\%+$). If you missed Q1, study `## 3. Formalization` item 1; if you missed Q2, study `## 3. Formalization` item 2; if you missed Q3 or Q4, study `## 3. Formalization` item 3. On pass, proceed to `## 10. Next modules`.

## 8. Common mistakes
| Symptom | Root cause | 2-minute fix |
| :--- | :--- | :--- |
| Periodic FreeRTOS task drifts slowly in time (`1000 us` becomes `1040 us`) | Used relative `vTaskDelay(1)` (which sleeps 1 tick *after* the task finishes) instead of absolute deadline scheduling. | Always use `vTaskDelayUntil(&xLastWakeTime, period)` for periodic control tasks. |
| CAN bus works with 2 boards on the desk, then drops frames when a 3rd board is plugged in | Left the $120\ \Omega$ termination jumper enabled on **every** board ($120/3 = 40\ \Omega$ overload) or forgot termination altogether ($\infty\ \Omega$). | Enable $120\ \Omega$ termination **only** on the two physical end nodes of the daisy chain and verify $60\ \Omega$ between `CAN_H` and `CAN_L` with power off. |
| Used `xSemaphoreCreateBinary()` to guard a shared struct and suffered $50\text{ ms}$ control stalls | Binary semaphores do **not** implement Priority Inheritance, allowing medium-priority tasks to preempt the lock holder. | Replace `xSemaphoreCreateBinary()` with `xSemaphoreCreateMutex()` whenever guarding shared state across task priorities. |
| System deadlocks when two tasks acquire Mutex A and Mutex B in opposite orders | Classic AB-BA lock-ordering deadlock (`Task 1` locks A then waits for B; `Task 2` locks B then waits for A). | Acquire mutexes in a strict global order across all tasks, or keep critical sections single-lock and under $10\ \mu\text{s}$. |

## 9. Resources
- **Richard Barry — *Mastering the FreeRTOS Real Time Kernel* (`freertos.org`, `resources/open-source-toolchains.md`):** Preemptive task scheduling, `vTaskDelayUntil`, and priority-inheritance mutexes `[UNVERIFIED]`.
- **Track 04 (`04-embedded-and-realtime/README.md`):** Prepares for `04-embedded.T2.04c` (Zephyr RTOS) and Step 2.5 (`04-embedded.T2.05`) `[VERIFIED 2026-10-15]`.

## 10. Next modules
- Proceed to [`04-embedded.T2.04c`](04-embedded.T2.04c.md) (*Zephyr RTOS: West Workspaces, Devicetree Hardware Binding, Kconfig & Static Kernel Primitives*).
