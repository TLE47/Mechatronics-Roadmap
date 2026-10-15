---
id: 04-embedded.T1.04b
title: "Non-Blocking millis()/micros() State Machines, Hardware Interrupts (ISRs) & volatile"
track: "04"
tier: 1
prereqs:
  - 04-embedded.T1.04a
new_concepts:
  - non_blocking_tick_scheduler
  - finite_state_machine_switch_enum
  - hardware_isr_and_volatile_contract
uses:
  - c_fixed_width_integer_types_and_overflow
  - bitwise_masks_and_shifts
  - c_structs_and_pointers_pass_by_reference
est_hours: 3.5
hardware_required: false
safety_level: none
resources_verified: true
---

## 1. Why it matters
This is the final bridge module in the Track 04 Tier 1 ladder before Step 1.5 (`04-embedded.T1.05`). Calling `delay(100)` freezes the CPU for $100\text{ ms}$—during that time your robot is blind to encoder pulses, limit switches, and PID loops. Replacing `delay()` with a non-blocking tick scheduler (`now_us - last_us >= PERIOD_US`), an `enum` finite state machine, and a hardware timer **Interrupt Service Routine (ISR)** with `volatile` shared variables gives your robot deterministic $1\text{ kHz}$ reflexes. Already know this? Take the Skip test or the Ladder Gate test in section 7 first.

## 2. Intuition first
Imagine a chef cooking three dishes at once. A **`delay()` loop** is like staring at a pot of water for 10 minutes with your eyes glued to it while the toast burns and the doorbell goes unanswered. A **non-blocking tick scheduler** (`micros() - last_us >= 1000`) is glancing at the wall clock on every pass through the kitchen: if $1000\ \mu\text{s}$ has elapsed, you stir the pot for $5\ \mu\text{s}$ and immediately check the next station. A **hardware interrupt (ISR)** is a smoke alarm wired directly to your reflex nervous system—the instant the hardware timer hits zero, the CPU pauses whatever background line it was running, executes the short ISR function in a few microseconds, sets a flag on a shared whiteboard, and resumes the background loop. Marking that flag **`volatile`** tells the C++ compiler: *"Do not cache this variable in a register—another context (the ISR) can change it behind your back at any nanosecond!"*

## 3. Formalization
1. **Non-Blocking Rollover-Safe Tick Scheduler:** Given unsigned 32-bit microsecond timer `now_us` and period `PERIOD_US = 1000` ($1\text{ kHz}$), the condition:
   $$\text{uint32\_t}(t_{\text{now}} - t_{\text{last}}) \ge T_{\text{period}} \implies t_{\text{last}} \leftarrow t_{\text{last}} + T_{\text{period}}$$
   executes without blocking and without cumulative phase drift. Substituting $t_{\text{last}} = 2000\ \mu\text{s}$, $T_{\text{period}} = 1000\ \mu\text{s}$, and $t_{\text{now}} = 3015\ \mu\text{s}$ triggers execution and advances $t_{\text{last}}$ to $3000\ \mu\text{s}$ (preserving the exact $1000\ \mu\text{s}$ grid).
2. **Finite State Machine (`enum` + `switch`):** An actuator controller defines explicit states `enum class State { IDLE, HOMING, RUN, FAULT };` and transitions cleanly on each tick (e.g., `FAULT` forces `pwm = 0.0` immediately if current exceeds $I_{\max}$ or E-stop is pressed).
3. **Hardware Timer ISR Budget & `volatile`:** If a timer ISR fires at frequency $f_{\text{isr}} = 1/T_{\text{isr}}$ and takes execution time $t_{\text{exec}}$, its CPU utilization fraction is:
   $$U_{\text{isr}} = \frac{t_{\text{exec}}}{T_{\text{isr}}} = t_{\text{exec}} \cdot f_{\text{isr}}$$
   Substituting $t_{\text{exec}} = 45\ \mu\text{s}$ at $f_{\text{isr}} = 1000\text{ Hz}$ ($T_{\text{isr}} = 1000\ \mu\text{s}$) gives $U_{\text{isr}} = 45 / 1000 = 4.5\%$. Any variable written inside an ISR and read in `loop()` must be declared `volatile`.

## 4. Worked example
Simulate $10\text{ ms}$ ($10{,}000\ \mu\text{s}$) of a microcontroller running a $1\text{ kHz}$ ($1000\ \mu\text{s}$) control task and a $100\text{ Hz}$ ($10{,}000\ \mu\text{s}$) telemetry task concurrently alongside an `IDLE -> HOMING -> RUN -> FAULT` state machine with zero `delay()` calls.

```python
def run_scheduler_and_fsm(duration_us: int = 10_000) -> tuple[int, int, str]:
    last_ctrl_us = 0
    last_telem_us = 0
    ctrl_runs = 0
    telem_runs = 0
    state = "IDLE"
    pos_rad = -0.05

    for now_us in range(1, duration_us + 1):
        if ((now_us - last_ctrl_us) & 0xFFFFFFFF) >= 1000:
            last_ctrl_us = (last_ctrl_us + 1000) & 0xFFFFFFFF
            ctrl_runs += 1
            if state == "IDLE":
                state = "HOMING"
            elif state == "HOMING":
                pos_rad += 0.01
                if pos_rad >= 0.0:
                    state = "RUN"
            elif state == "RUN" and ctrl_runs == 9:
                state = "FAULT"  # Simulated over-current fault on tick 9
        if ((now_us - last_telem_us) & 0xFFFFFFFF) >= 10_000:
            last_telem_us = (last_telem_us + 10_000) & 0xFFFFFFFF
            telem_runs += 1

    return ctrl_runs, telem_runs, state

ctrl_runs, telem_runs, final_state = run_scheduler_and_fsm(10_000)
assert ctrl_runs == 10
assert telem_runs == 1
assert final_state == "FAULT"
print(f"ctrl_runs={ctrl_runs}, telem_runs={telem_runs}, final_state={final_state}")
```
Expected output:
```text
ctrl_runs=10, telem_runs=1, final_state=FAULT
```

## 5. Exercise
Calculate the maximum allowable ISR execution time $t_{\text{exec,max}}$ in microseconds ($\mu\text{s}$) if a $f_{\text{isr}} = 10\text{ kHz}$ ($T_{\text{isr}} = 100\ \mu\text{s}$) current-loop ISR must consume no more than $U_{\max} = 25\%$ ($0.25$) of total CPU time so that $75\%$ remains for telemetry and state machines. Verify $t_{\text{exec,max}} = 25.0\ \mu\text{s}$.
- **If your result differs:** Multiply the period $T_{\text{isr}} = 10^6 / 10000 = 100\ \mu\text{s}$ by $0.25$ ($100 \times 0.25 = 25.0\ \mu\text{s}$).

## 6. Simulation path
Open **Tab 8 (Real-Time Concurrency & ISR Preemption)** in the MechaLab Workbench (`npm run dev`) or run a non-blocking `micros()` sketch on the [Wokwi Simulator](https://wokwi.com/).

No hardware required for this module (`hardware_required: false`). In Step 1.5 (`04-embedded.T1.05`), you will toggle a physical GPIO pin at entry and exit of the $1\text{ kHz}$ timer ISR on an `ESP32` or `STM32 Nucleo` and measure pulse width $t_{\text{exec}}$ and period $T_{\text{isr}} = 1000\ \mu\text{s}$ with a logic analyzer (`PulseView`):
```text
[Timer ISR Entry: GPIO HIGH] ---> (PID Math: ~15 us) ---> [Timer ISR Exit: GPIO LOW] ---> [Logic Analyzer]
```
Pass/fail verification in simulation: `ctrl_runs == 10`, `telem_runs == 1`, and `final_state == "FAULT"`.

## 7. Checkpoint
Pass criteria: score $\ge 80\%$ ($4/4$) on the Skip test to pass this module, or score $\ge 80\%$ ($7/8$) on the Ladder Gate test below to unlock Step 1.5 (`04-embedded.T1.05`).

### Skip test
1. `[Recall] [Concept: non_blocking_tick_scheduler]` If a main loop calls `delay(50)` ($50\text{ ms}$) for an LED blink and `delay(20)` ($20\text{ ms}$) for a sensor wait, what is the maximum loop execution frequency $f_{\text{loop}} = \frac{1}{0.050 + 0.020}$ in $\text{Hz}$ (tolerance $\pm 0.01\text{ Hz}$)?
2. `[Apply] [Concept: hardware_isr_and_volatile_contract]` Compute the CPU utilization percentage $U_{\text{isr}}\% = 100 \times \frac{t_{\text{exec}}}{T_{\text{isr}}}$ (tolerance $\pm 10^{-6}$) for a $1\text{ kHz}$ ($1000\ \mu\text{s}$) timer ISR that takes $t_{\text{exec}} = 35\ \mu\text{s}$.
3. `[Transfer] [Concept: finite_state_machine_switch_enum]` An actuator FSM running inside a $f_{\text{isr}} = 20\text{ kHz}$ ($T_{\text{isr}} = 50\ \mu\text{s}$) timer ISR transitions from `RUN` to `FAULT` (forcing `pwm_cmd = 0.0`) after $N_{\text{debounce}} = 3$ consecutive overcurrent samples. Compute the total fault-detection latency $t_{\text{fault}} = N_{\text{debounce}} / f_{\text{isr}}$ in microseconds ($\mu\text{s}$, tolerance $\pm 10^{-9}$).
4. `[Spaced review -> 04-embedded.T1.04a — Concept: c_fixed_width_integer_types_and_overflow] [Concept: hardware_isr_and_volatile_contract]` Why must a global flag `bool tick_ready` written inside a hardware timer ISR and polled inside `main()` be declared `volatile bool tick_ready` in C/C++?
   - **A.** To make the variable use flash memory instead of RAM.
   - **B.** To prevent the compiler optimizer (`-O2`/`-O3`) from caching `tick_ready` in a CPU register and turning `while (!tick_ready)` into an infinite loop.
   - **C.** To automatically disable interrupts during math operations.
   - **D.** To convert the boolean into a 32-bit float.

**Answer key:**
```python
import math

q1_floop_hz = 1.0 / (0.050 + 0.020)
q2_cpu_pct = 100.0 * (35.0 / 1000.0)
q3_tfault_us = (3.0 / 20_000.0) * 1e6
q4_choice = "B"
assert math.isclose(q1_floop_hz, 14.2857, abs_tol=1e-2)
assert math.isclose(q2_cpu_pct, 3.5, rel_tol=1e-9)
assert math.isclose(q3_tfault_us, 150.0, rel_tol=1e-9)
assert q4_choice == "B"
```
- **Pass mark:** $4/4$ ($80\%+$). If you missed Q1, study `## 3. Formalization` item 1; if you missed Q2 or Q4, study `## 3. Formalization` item 3; if you missed Q3, study `## 3. Formalization` item 2. On pass, proceed to `## 10. Next modules`.


### Gate test
Covers the complete Track 04 Tier 1 bridge ladder (`04-embedded.T1.04a` $\to$ `04-embedded.T1.04b`) before Step 1.5 (`04-embedded.T1.05`):
1. `[Concept: c_fixed_width_integer_types_and_overflow]` Compute the unsigned 16-bit elapsed tick difference `(now - prev) & 0xFFFF` when `now = 12` and `prev = 65520`.
2. `[Concept: c_fixed_width_integer_types_and_overflow]` How many bytes does a packed struct `{ uint32_t tick_ms; int16_t enc_count; int16_t pwm_cmd; }` occupy in memory?
3. `[Concept: bitwise_masks_and_shifts]` Starting with `reg = 0x00`, compute the decimal value of `reg` after setting bits `1` and `4` (`reg |= (1 << 1) | (1 << 4)`).
4. `[Concept: bitwise_masks_and_shifts]` Starting with `reg = 0xFF` (`255`), compute the decimal value of `reg` after clearing bit `7` (`reg &= ~(1 << 7)`).
5. `[Concept: c_structs_and_pointers_pass_by_reference]` Why do embedded C functions accept `const TelemetryPacket *pkt` instead of passing `TelemetryPacket pkt` by value?
   - **A.** Passing a pointer copies only a 4-byte memory address instead of copying the entire struct onto the stack, while `const` prevents accidental modification.
   - **B.** C does not allow structs to be returned or passed by value.
   - **C.** Pointers automatically encrypt serial data.
   - **D.** Pointers run at twice the clock frequency.
6. `[Concept: non_blocking_tick_scheduler]` Why is `last_us += PERIOD_US` preferred over `last_us = now_us` in a periodic tick scheduler?
   - **A.** Because `last_us += PERIOD_US` advances the target deadline on an exact phase grid without accumulating positive timing drift when `now_us` is checked a few microseconds late.
   - **B.** Because `=` is slower than `+=`.
   - **C.** Because `now_us` is a floating-point number.
   - **D.** Because `last_us = now_us` causes a division by zero.
7. `[Concept: finite_state_machine_switch_enum]` Compute the number of $1\text{ kHz}$ control ticks executed over $0.25\text{ s}$ ($250{,}000\ \mu\text{s}$).
8. `[Concept: hardware_isr_and_volatile_contract]` Why must you **never** call `Serial.println()` or `delay()` inside a $1\text{ kHz}$ hardware timer ISR?
   - **A.** Because `Serial.println()` and `delay()` block for milliseconds (exceeding the $1000\ \mu\text{s}$ ISR period), starving the main loop and causing missed control ticks or watchdog resets.
   - **B.** Because ISRs can only use `float` variables.
   - **C.** Because timer ISRs run on the GPU.
   - **D.** Because `Serial.println()` resets the encoder counter to zero.

**Gate answer key:**
```python
import struct

g1_delta = (12 - 65520) & 0xFFFF
g2_bytes = struct.calcsize("<Ihh")
g3_set = (1 << 1) | (1 << 4)
g4_clear = 0xFF & ~(1 << 7)
g5_choice = "A"
g6_choice = "A"
g7_ticks = 250_000 // 1000
g8_choice = "A"

assert g1_delta == 28
assert g2_bytes == 8
assert g3_set == 18
assert g4_clear == 127
assert g5_choice == "A"
assert g6_choice == "A"
assert g7_ticks == 250
assert g8_choice == "A"
```
- **Pass mark:** $7/8$ ($80\%+$). Remediation: Q1–Q5 $\to$ `04-embedded.T1.04a`; Q6–Q8 $\to$ `04-embedded.T1.04b`.

## 8. Common mistakes
| Symptom | Root cause | 2-minute fix |
| :--- | :--- | :--- |
| `while (!isr_flag)` hangs forever when compiled with `-O2` | Forgot `volatile` on `isr_flag`. | Declare shared ISR flags as `volatile bool isr_flag = false;`. |
| Scheduler stops firing after ~71.6 minutes (`uint32_t` `micros()` rollover) | Wrote `if (now_us >= next_us)` instead of unsigned subtraction `if ((uint32_t)(now_us - last_us) >= PERIOD_US)`. | Always subtract unsigned timestamps before comparing against `PERIOD_US`. |
| Control loop jitter spikes to milliseconds whenever telemetry prints | Called `Serial.print()` inside the timer ISR or printed long ASCII strings at $9600\text{ bps}$. | Keep ISRs under $20\ \mu\text{s}$ and send compact binary structs from `loop()` at $\ge 115200\text{ bps}$ (Step 1.5). |

## 9. Resources
- **Lee & Seshia — *Introduction to Embedded Systems* (`leeseshia.org`, `resources/textbooks-and-papers.md`):** Free textbook covering finite state machines, interrupts, and `volatile` memory semantics `[VERIFIED 2026-10-15]`.
- **Track 04 (`04-embedded-and-realtime/README.md`):** Directly continues into Step 1.5 (`04-embedded.T1.05`) `[VERIFIED 2026-10-15]`.
## 10. Next modules
- Proceed to legacy **Step 1.5 (`04-embedded.T1.05`)** in [`04-embedded-and-realtime/README.md`](../04-embedded-and-realtime/README.md#tier-1-beginner--intuitive).
