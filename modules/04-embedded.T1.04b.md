---
id: 04-embedded.T1.04b
title: "Arduino/Wiring Digital I/O, Non-Blocking State Machines, Hardware Timer ISRs & volatile"
track: "04"
tier: 1
prereqs:
  - 04-embedded.T1.04a
  - 01-electronics.T1.02
new_concepts:
  - non_blocking_millis_state_machine
  - hardware_timer_isr_and_jitter
  - volatile_qualifier_and_critical_sections
uses:
  - fixed_width_integers_and_twos_complement
  - bitwise_register_masks_and_shifts
  - cmos_logic_levels_esd_clamping
est_hours: 4.5
---

## 0. Skip Test
Pass without reading if you can answer both without looking anything up:
1. Why does calling `delay(10)` inside a motor control loop break a safety limit switch check or serial telemetry parser?
   - **Check:** `delay(10)` halts the CPU in a busy-wait loop for $10,000\,\mu\text{s}$, blinding the processor to limit switches, encoder transitions, and serial buffer overflows during that entire window.
2. Why must a flag shared between a hardware timer Interrupt Service Routine (ISR) and `main()` be declared `volatile`, and why do multi-byte variables also need an atomic critical section?
   - **Check:** `volatile` forces the compiler to re-read the variable from RAM on every access instead of caching it in a CPU register; an atomic critical section prevents the ISR from preempting `main()` halfway through reading a multi-byte value (tearing).

## 1. Why This Matters
Step 1.5 (`04-embedded.T1.05`) bans `delay()` and requires a deterministic $1\text{ kHz}$ hardware timer Interrupt Service Routine (ISR) with $< 5\,\mu\text{s}$ jitter. Following the decided firmware progression (`Arduino/Wiring -> non-blocking state machines -> HAL -> bare-metal register basics`), this module moves you from beginner `delay()` loops to non-blocking `enum` state machines and hardware timer interrupts with `volatile` flags.

## 2. Mental Model
1. **Why `delay()` Is Fatal in Mechatronics:**
   A CPU running at $160\text{ MHz}$ executes $1,600,000$ instructions during a single `delay(10)`. If a robot arm hits a hard stop during that $10\text{ ms}$, the CPU does nothing.
2. **Non-Blocking Cooperative State Machine (`enum` + Tick Counter):**
   Instead of pausing execution, store the system state in an `enum` (`IDLE`, `HOMING`, `ACTIVE`, `FAULT`) and check elapsed ticks (`now_us - last_tick_us >= period_us`) on every pass through `loop()`.
3. **Hardware Timer ISR & `volatile`:**
   Even a non-blocking `loop()` experiences timing jitter when a slow task (like formatting serial bytes) takes longer on some iterations. A dedicated hardware timer counter triggers an **Interrupt Service Routine (ISR)** at an exact hardware clock period (e.g., every $1000\,\mu\text{s}$). Variables written in the ISR and read in `main()` must be marked `volatile` so the compiler never optimizes away the RAM read.

## 3. Worked Example
Compare loop timing jitter between a naive polling loop that occasionally prints serial text ($350\,\mu\text{s}$ duration) and a hardware timer ISR running at $1\text{ kHz}$ ($1000\,\mu\text{s}$ period):
- **Polling Loop with `delay(1)` ($1000\,\mu\text{s}$):**
  On normal ticks, control executes at $t = 1000, 2000, 3000\,\mu\text{s}$. On tick 4, a serial print adds $350\,\mu\text{s}$, shifting the tick to $4350\,\mu\text{s}$ ($\text{jitter} = +350\,\mu\text{s} = 35\%$ of the sample period!).
- **Hardware Timer ISR:**
  The hardware timer preempts the background serial print at exactly $t = 4000\,\mu\text{s}$, runs the $8\,\mu\text{s}$ control calculation with $< 1\,\mu\text{s}$ jitter, and returns to finish the serial print in the background.

## 4. Code
```python
from enum import Enum

class ArmState(Enum):
    IDLE = 0
    HOMING = 1
    ACTIVE = 2
    FAULT = 3

def step_state_machine(state: ArmState, start_cmd: bool, home_switch: bool, estop_pressed: bool) -> ArmState:
    if estop_pressed:
        return ArmState.FAULT
    if state == ArmState.IDLE and start_cmd:
        return ArmState.HOMING
    if state == ArmState.HOMING and home_switch:
        return ArmState.ACTIVE
    return state

# Verify deterministic state transitions and immediate E-stop override
s = ArmState.IDLE
s = step_state_machine(s, start_cmd=True, home_switch=False, estop_pressed=False)
assert s == ArmState.HOMING
s = step_state_machine(s, start_cmd=False, home_switch=True, estop_pressed=False)
assert s == ArmState.ACTIVE
s = step_state_machine(s, start_cmd=False, home_switch=True, estop_pressed=True)
assert s == ArmState.FAULT

# Compare polling loop jitter vs hardware timer preemption
bg_print_us = 350
polling_intervals_us = [1000, 1000, 1000 + bg_print_us, 1000]
isr_intervals_us = [1000, 1000, 1000, 1000]
polling_jitter_us = max(abs(dt - 1000) for dt in polling_intervals_us)
isr_jitter_us = max(abs(dt - 1000) for dt in isr_intervals_us)
assert polling_jitter_us == 350 and isr_jitter_us == 0
print(f"Final state={s.name}, polling_jitter={polling_jitter_us} us, isr_jitter={isr_jitter_us} us")
```
Expected output:
```text
Final state=FAULT, polling_jitter=350 us, isr_jitter=0 us
```

## 5. Exercise
A $1\text{ kHz}$ ($1000\,\mu\text{s}$) hardware timer ISR takes $45\,\mu\text{s}$ to read an encoder and update a PID controller. Calculate the fraction of CPU time consumed by the ISR (CPU utilization $\%$) and the remaining background time per millisecond available for telemetry.
- **Check:** $\text{Utilization} = \frac{45}{1000} = 4.5\%$, leaving $955\,\mu\text{s}$ per millisecond for background tasks.

## 6. Gate Test
1. Why should you never call `Serial.println()` or `printf()` *inside* a $1\text{ kHz}$ hardware timer ISR? (Answer: Formatting and transmitting UART strings takes hundreds of microseconds or blocks on buffer space, causing ISR overruns and destroying real-time determinism.)
2. On an 8-bit AVR or when reading a 64-bit timestamp on a 32-bit MCU, why is `volatile` alone NOT enough to safely read a variable updated by an ISR? (Answer: The CPU reads the variable in multiple bus instructions; if the ISR fires between those instructions, `main()` reads half of the old value and half of the new value—"torn read"—unless interrupts are briefly disabled around the copy.)

## 7. Resources
- **Lee & Seshia — *Introduction to Embedded Systems* (Ch. 3, 9):** Extended state machines, interrupts, and concurrency (`resources/textbooks-and-papers.md`) `[VERIFIED 2026-10-15]`.
- **Track 04 (`04-embedded-and-realtime/README.md`):** Directly unlocks Step 1.5 (`04-embedded.T1.05`) zero-`delay()` timer ISR & packed telemetry `[VERIFIED 2026-10-15]`.
