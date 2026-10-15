---
id: 04-embedded.T3.04a
title: "Center-Aligned PWM Midpoint ADC Triggering, Q1.31 Fixed-Point Arithmetic, Lock-Free SeqLock & Embedded Rust/Zephyr Zero-Copy"
track: "04"
tier: 3
prereqs:
  - 03-sensors.T3.04
  - 04-embedded.T2.05
new_concepts:
  - center_aligned_pwm_midpoint_adc_sampling
  - q131_fixed_point_trig_scaling
  - seqlock_optimistic_even_odd_versioning
uses:
  - dma_double_buffered_ping_pong_isr
  - rate_monotonic_response_time_analysis
  - zephyr_static_threads_and_k_mutex
  - minmax_zero_sequence_svpwm_injection
est_hours: 5.0
hardware_required: false
safety_level: none
resources_verified: true
---

## 1. Why it matters
This is the final bridge module in the Track 04 Tier 3 ladder before Step 3.5 (`04-embedded.T3.05`). In Tier 2 (`04-embedded.T2.05`), you used RTOS mutexes (`FreeRTOS` / `Zephyr RTOS`) to share state between a $1\text{ kHz}$ control task and a CAN-FD thread. When you push the inner FOC current loop to $40\text{ kHz}$ ($25\ \mu\text{s}$ total period), RTOS context switches and mutex locks are **strictly forbidden** inside the Tier-0 fast ISR (`NVIC Priority 0`): a mutex cannot even be called from an ISR, and disabling interrupts during a slow reader copy adds unacceptable jitter. Production actuator firmware (`STM32G474` C++20, `Zephyr` zero-latency ISRs, or `Embassy` / `RTIC` Embedded Rust) relies on three hardware-software co-design primitives: (1) **Center-Aligned PWM Midpoint ADC Triggering (`TIM1_TRGO2`)** so the ADC samples shunt current automatically at the exact triangular counter peak where $di/dt$ switching transients are zero and average current equals instantaneous current, (2) **Q1.31 Fixed-Point Arithmetic** for deterministic hardware `CORDIC` $\sin/\cos$ coprocessor calls, and (3) a **Wait-Free Sequence Lock (`SeqLock`)** using an even/odd atomic sequence counter so the $40\text{ kHz}$ ISR never blocks for a single nanosecond! Already know this? Take the Skip test or the Ladder Gate test in section 7 first.

## 2. Intuition first
Three architectural ideas eliminate every source of software jitter in a $40\text{ kHz}$ loop:
- **Center-Aligned PWM Midpoint Sampling (`Why the Triangle Peak is Magic`):** An inductor current waveform under PWM is a triangle ripple wave: it ramps up while the switch is ON and ramps down while the switch is OFF, with noisy voltage ringing right at the switching edges. If you configure `TIM1` as an **up-down triangle counter** (`0 -> ARR -> 0`), all three low-side shunts conduct simultaneously around the peak `CNT == ARR`, AND the midpoint of the rising/falling inductor current ramp equals the **exact cycle-average current** with zero switching edge noise! Hardware `TIM1_TRGO2` fires the SAR ADC right at `CNT == ARR` with $< 1\text{ ns}$ jitter and zero CPU involvement.
- **Q1.31 Fixed-Point Scaling (`[-1.0, +1.0) -> int32_t`):** Hardware accelerators like the `STM32G4` `CORDIC` coprocessor represent normalized angles $\theta / \pi \in [-1.0, +1.0)$ and trig outputs $\sin\theta, \cos\theta \in [-1.0, +1.0)$ as signed 32-bit integers $q \in [-2^{31}, 2^{31}-1]$ via $q = \operatorname{round}(x \cdot 2^{31})$, computing 24-bit accurate $\sin$ and $\cos$ simultaneously in 6 clock cycles ($35\text{ ns}$ at $170\text{ MHz}$) while the CPU fetches ADC values!
- **Wait-Free `SeqLock` (`Optimistic Even/Odd Versioning`):** How can a $40\text{ kHz}$ ISR writer share a 32-byte telemetry struct with a $1\text{ kHz}$ RTOS/Zephyr/micro-ROS reader without a mutex and without disabling interrupts in the reader?
  - **Writer (`40 kHz ISR`):** Increments atomic `seq` from **even (`2k`) to odd (`2k + 1`)** (`memory_order_release`), writes the struct fields, and increments `seq` from **odd (`2k + 1`) to even (`2k + 2`)** (`memory_order_release`). The writer **never waits**!
  - **Reader (`1 kHz Task`):** Reads `s1 = seq` (`acquire`), copies the struct, and reads `s2 = seq`. If `s1` was odd (`s1 & 1`) OR `s1 != s2`, the writer preempted the reader mid-copy, so the reader simply retries immediately! In **Embedded Rust (`RTIC` / `Embassy`)** and **Zephyr zero-latency ISRs (`CONFIG_ZERO_LATENCY_IRQS`)**, this pattern (or static double-buffered SPSC queues) guarantees compile-time memory safety with zero lock contention.

## 3. Formalization
1. **Center-Aligned Up-Down Timer Period & Midpoint Sampling Window:** For a timer clocked at $f_{\text{tim}}$ ($\text{Hz}$) in center-aligned (up-down) mode with auto-reload register $\text{ARR}$, one full PWM period requires $2 \cdot \text{ARR}$ timer ticks:
   $$f_{\text{PWM}} = \frac{f_{\text{tim}}}{2 \cdot \text{ARR}}, \qquad \text{ARR} = \frac{f_{\text{tim}}}{2 \, f_{\text{PWM}}}$$
   For active high-side duty cycle $d_{\max} = \max(d_a, d_b, d_c)$ and dead-time $t_{\text{dead}}$, the low-side shunt conduction window centered around `CNT == ARR` has duration $t_{\text{low,min}} = (1 - d_{\max}) T_{\text{PWM}} - 2 t_{\text{dead}}$, which must exceed $t_{\text{ring}} + t_{\text{acq}}$ for valid 3-shunt sampling.
2. **Signed Q1.31 Fixed-Point Representation (`CORDIC` Format):** Mapping normalized real number $x \in [-1.0, +1.0 - 2^{-31}]$ to signed 32-bit integer $X_{Q31} \in [-2^{31}, 2^{31}-1]$:
   $$X_{Q31} = \operatorname{ clamp }\!\left(\operatorname{round}\!\left(x \cdot 2^{31}\right), -2^{31}, 2^{31}-1\right), \qquad \hat{x} = \frac{X_{Q31}}{2^{31}}$$
   where an electrical angle $\theta_e \in [-\pi, +\pi)$ is normalized first to $x = \theta_e / \pi \in [-1.0, +1.0)$.
3. **Wait-Free `SeqLock` Consistency Invariant:** Let $s_1$ be the sequence counter read before copying payload $P$ and $s_2$ be the sequence counter read after copying $P$. The snapshot $P$ is guaranteed tear-free iff:
   $$\text{Valid}(s_1, s_2) \iff ((s_1 \bmod 2) == 0) \;\land\; (s_1 == s_2)$$

## 4. Worked example
Compute (1) the center-aligned `TIM1->ARR` register value and minimum low-side shunt conduction window $t_{\text{low,min}}$ at $f_{\text{tim}} = 170\text{ MHz}$ and $f_{\text{PWM}} = 40\text{ kHz}$, (2) `Q1.31` fixed-point encoding/decoding of $\theta_e = \pi/3\text{ rad}$ and $\cos(\pi/3) = 0.5$, and (3) prove that a `SeqLock` reader detects a mid-read ISR preemption (torn read) and succeeds on the immediate retry.

```python
import math

# 1. Center-aligned TIM1 at f_tim = 170 MHz, f_pwm = 40 kHz:
f_tim, f_pwm = 170_000_000, 40_000
ARR = f_tim // (2 * f_pwm)
T_pwm_ns = (1.0 / f_pwm) * 1e9
d_max, t_dead_ns = 0.88, 250.0
t_low_min_ns = (1.0 - d_max) * T_pwm_ns - 2.0 * t_dead_ns
assert ARR == 2125
assert math.isclose(t_low_min_ns, 2500.0, rel_tol=1e-9)
assert t_low_min_ns > 400.0  # Exceeds 250 ns ringing + 150 ns ADC acquisition!

# 2. Q1.31 fixed-point CORDIC encoding for theta_e = pi/3 rad (normalized x = (pi/3)/pi = 1/3):
SCALE_Q31 = 1 << 31
q31_angle = round((1.0 / 3.0) * SCALE_Q31)
q31_cos = round(math.cos(math.pi / 3.0) * SCALE_Q31)
cos_decoded = q31_cos / float(SCALE_Q31)
assert q31_cos == 1073741824  # Exact 0x40000000 = 2^30!
assert math.isclose(cos_decoded, 0.5, rel_tol=1e-12)

# 3. Wait-Free SeqLock tear detection and retry:
def seqlock_valid(s1: int, s2: int) -> bool:
    return (s1 & 1) == 0 and (s1 == s2)

assert seqlock_valid(4, 4) is True    # Clean read while seq stayed at 4
assert seqlock_valid(5, 5) is False   # Torn read: writer was in progress (odd seq=5)!
assert seqlock_valid(4, 6) is False   # Torn read: writer preempted reader between s1=4 and s2=6!
print(f"ARR={ARR}, t_low_min={t_low_min_ns:.0f} ns, q31_cos=0x{q31_cos:08X}, valid(4,4)={seqlock_valid(4,4)}, valid(4,6)={seqlock_valid(4,6)}")
```
Expected output:
```text
ARR=2125, t_low_min=2500 ns, q31_cos=0x40000000, valid(4,4)=True, valid(4,6)=False
```

## 5. Exercise
Suppose `TIM1` runs at $f_{\text{tim}} = 160\text{ MHz}$ in center-aligned up-down mode to generate a $f_{\text{PWM}} = 25\text{ kHz}$ carrier ($T_{\text{PWM}} = 40{,}000\text{ ns}$). Compute (a) the integer auto-reload value $\text{ARR} = \frac{f_{\text{tim}}}{2 f_{\text{PWM}}}$, and (b) the signed `Q1.31` integer representation $\operatorname{round}(x \cdot 2^{31})$ for $x = -0.50$. Verify that $\text{ARR} = 3200$ and $X_{Q31} = -1073741824$ (`-2**30`, tolerance $\pm 0$).
- **If your result differs:** Remember that center-aligned mode counts both up (`0 -> ARR`) and down (`ARR -> 0`) in each PWM period, dividing $f_{\text{tim}}$ by $2 \cdot \text{ARR}$.


- **📚 What to Learn & Resources to Solve This Exercise:**
  - **Required Foundations Modules (`00-foundations`):** [`00-foundations.T2.00d`](00-foundations.T2.00d.md) (*Filter Group Delay*) and [`00-foundations.T2.00f`](00-foundations.T2.00f.md) (*Sampling, Aliasing & Decimation*).
  - **Prerequisite Bridge Modules:** [`04-embedded.T2.04a`](04-embedded.T2.04a.md)–[`04-embedded.T2.04d`](04-embedded.T2.04d.md) and Legacy **Step 2.5 (`04-embedded.T2.05`)**.
  - **Core Concepts to Review First:** C++20 `WaitFreeSeqLock<T>` even/odd sequence retry protocol, EtherCAT Distributed Clocks (`DC`) propagation-compensated clock offset + PI drift discipline, and Hogenauer `sinc³` $\Sigma\Delta$ decimation ($G = \text{OSR}^3$, group delay $\tau_g = \frac{3(\text{OSR}-1)}{2 f_{\text{mod}}}$) in `## 3. Formalization` and `## 4. Worked example` above.
  - **Study Links & Resources:** [Hans Boehm *Seqlocks Paper*](https://dl.acm.org/doi/10.1145/2247684.2247688), [Hogenauer CIC Filter Paper (IEEE TSP 1981)](https://ieeexplore.ieee.org/document/1163535), and [Track 04 Tier 3 (`04-embedded-and-realtime/README.md`)](../04-embedded-and-realtime/README.md#tier-3-advanced--production) (**Tab 8: Attitude ESKF & SeqLock**).

## 6. Simulation path
Open **Tab 8 (C++20 `WaitFreeSeqLock`, `TIM1_TRGO2` Timing & `ITCM/DTCM` Budget)** in the MechaLab Workbench (`npm run dev`), or run `04-embedded-and-realtime/lab/lab04_seqlock_cordic_and_wcet.py` to stress-test the `SeqLock` across $100{,}000$ simulated preemptions.

No hardware required for this module (`hardware_required: false`). In Step 3.5 (`04-embedded.T3.05`), the `STM32G474` bare-metal C++20 firmware (`08-capstone-projects/stm32g4-foc-firmware/main_foc_isr.cpp`) and Embedded Rust (`RTIC` / `Embassy`) implementations run this exact pipeline:
```text
[TIM1 Peak CNT==ARR] ==(TRGO2)==> [SAR ADC1/2 + DMA] ==> [40 kHz ISR: CORDIC Q1.31 + SeqLock Write] ==> [1 kHz RTOS/Rust Reader]
```
Pass/fail verification in simulation: `ARR == 2125`, `q31_cos == 1073741824`, `seqlock_valid(4, 6) == False`, and `seqlock_valid(6, 6) == True`.

## 7. Checkpoint
Pass criteria: score $\ge 80\%$ ($4/4$) on the Skip test or score $\ge 80\%$ ($7/8$) on the Ladder Gate test below to unlock Step 3.5 (`04-embedded.T3.05`).

### Skip test
1. `[Recall] [Concept: center_aligned_pwm_midpoint_adc_sampling]` A microcontroller advanced timer clocked at $f_{\text{tim}} = 180\text{ MHz}$ ($1.8 \times 10^8\text{ Hz}$) operates in center-aligned (up-down) mode to generate a $f_{\text{PWM}} = 30\text{ kHz}$ ($3.0 \times 10^4\text{ Hz}$) carrier. Compute the auto-reload register value $\text{ARR} = \frac{f_{\text{tim}}}{2 \, f_{\text{PWM}}}$ (tolerance $\pm 10^{-9}$).
2. `[Apply] [Concept: center_aligned_pwm_midpoint_adc_sampling]` For a $f_{\text{PWM}} = 40\text{ kHz}$ carrier ($T_{\text{PWM}} = 25{,}000\text{ ns}$) with maximum phase duty cycle $d_{\max} = 0.90$ and dead-time $t_{\text{dead}} = 200\text{ ns}$, compute the minimum low-side shunt conduction window $t_{\text{low,min}} = (1 - d_{\max})T_{\text{PWM}} - 2 t_{\text{dead}}$ in nanoseconds ($\text{ns}$, tolerance $\pm 10^{-6}\text{ ns}$).
3. `[Transfer] [Concept: q131_fixed_point_trig_scaling]` Convert the normalized real value $x = +0.25$ into its signed 32-bit `Q1.31` integer representation $X_{Q31} = \operatorname{round}(x \cdot 2^{31})$ (tolerance $\pm 10^{-9}$).
4. `[Spaced review -> 04-embedded.T2.05 — Concept: dma_double_buffered_ping_pong_isr] [Concept: seqlock_optimistic_even_odd_versioning]` In a Wait-Free Sequence Lock (`SeqLock`), a $1\text{ kHz}$ reader task reads `s1 = 12` before copying the shared struct and reads `s2 = 14` immediately after copying the struct. What happened during the copy, and what must the reader do?
   - **A.** The $40\text{ kHz}$ writer ISR preempted the reader mid-copy and completed a write (`12 -> 13 -> 14`), so the copied struct may be torn and the reader must discard it and retry the read loop immediately.
   - **B.** The copy succeeded without interruption; use the data.
   - **C.** The CPU clock stopped working.
   - **D.** The writer task is deadlocked waiting for the reader.

**Answer key:**
```python
import math

q1_arr = 180_000_000.0 / (2.0 * 30_000.0)
q2_tlow_ns = (1.0 - 0.90) * 25_000.0 - 2.0 * 200.0
q3_q31 = round(0.25 * (1 << 31))
q4_choice = "A"

assert math.isclose(q1_arr, 3000.0, rel_tol=1e-9)
assert math.isclose(q2_tlow_ns, 2100.0, rel_tol=1e-9)
assert math.isclose(q3_q31, 536870912.0, rel_tol=1e-9)
assert q4_choice == "A"
```
- **Pass mark:** $4/4$ ($80\%+$). If you missed Q1 or Q2, study `## 3. Formalization` item 1; Q3, study `## 3. Formalization` item 2; Q4, study `## 3. Formalization` item 3. On pass, proceed to `## 10. Next modules`.

### Gate test
Covers the complete Track 04 Tier 3 bridge ladder (`04-embedded.T3.04a`) before Step 3.5 (`04-embedded.T3.05`):
1. `[Concept: center_aligned_pwm_midpoint_adc_sampling]` Why does triggering the SAR ADC at the center-aligned PWM peak (`CNT == ARR` via hardware `TIM1_TRGO2`) eliminate the need for a heavy low-pass filter on the current-sense signal?
   - **A.** Because at the exact midpoint of the symmetrical PWM ON/OFF interval, the instantaneous inductor current equals the cycle-average phase current AND all MOSFET switching edges have already settled, avoiding `di/dt` switching spikes.
   - **B.** Because the motor stops drawing current at `CNT == ARR`.
   - **C.** Because the ADC turns off the PWM outputs.
   - **D.** Because center-aligned mode doubles the bus voltage.
2. `[Concept: center_aligned_pwm_midpoint_adc_sampling]` Compute the PWM switching frequency $f_{\text{PWM}} = \frac{f_{\text{tim}}}{2 \cdot \text{ARR}}$ in $\text{kHz}$ (tolerance $\pm 10^{-9}\text{ kHz}$) when $f_{\text{tim}} = 170\text{ MHz}$ and $\text{ARR} = 1700$.
3. `[Concept: q131_fixed_point_trig_scaling]` In the `STM32G4` hardware `CORDIC` `Q1.31` angle format where $[-1.0, +1.0)$ maps to $[-\pi, +\pi)\text{ rad}$, what normalized float $x = \theta_e / \pi$ corresponds to $\theta_e = -\pi/2\text{ rad}$ (tolerance $\pm 10^{-9}$)?
4. `[Concept: q131_fixed_point_trig_scaling]` Why cannot you represent exactly $+1.0$ in signed two's-complement `Q1.31` format (`int32_t`)?
   - **A.** Because the most positive signed 32-bit integer is $2^{31} - 1 = \text{0x7FFFFFFF}$, which represents $+1.0 - 2^{-31} \approx +0.99999999953$, whereas $+2^{31}$ overflows into $-2^{31}$ (`-1.0`).
   - **B.** Because `int32_t` only stores negative numbers.
   - **C.** Because `Q1.31` has only 8 bits.
   - **D.** Because $+1.0$ is an irrational number.
5. `[Concept: seqlock_optimistic_even_odd_versioning]` In a `SeqLock`, if the sequence counter starts at `seq = 0` and the $40\text{ kHz}$ writer ISR executes **3 complete write transactions**, what is the integer value of `seq` after the 3rd write finishes (tolerance $\pm 10^{-9}$)?
6. `[Concept: seqlock_optimistic_even_odd_versioning]` Why is a `SeqLock` writer completely **wait-free** (guaranteed to finish in a bounded number of instructions regardless of what any reader thread does)?
   - **A.** Because the single writer only increments the atomic counter (`even -> odd -> even`) and writes memory without ever spinning or waiting on any reader lock; readers detect interference optimistically and retry.
   - **B.** Because the writer deletes the reader thread.
   - **C.** Because the writer calls `sleep(1)`.
   - **D.** Because the reader disables all hardware interrupts.
7. `[Concept: seqlock_optimistic_even_odd_versioning]` On an ARM Cortex-M7 microcontroller with data cache (`D-Cache`) enabled, where must DMA buffers and zero-wait-state $40\text{ kHz}$ ISR code be placed to prevent cache-coherency corruption and flash wait-state jitter?
   - **A.** Place the $40\text{ kHz}$ ISR code in `ITCM` (Instruction Tightly Coupled Memory) and DMA/SeqLock buffers in non-cacheable `DTCM` (Data Tightly Coupled Memory) or MPU-configured non-cacheable SRAM.
   - **B.** Place them on an external SD card.
   - **C.** Place them in slow QSPI flash without cache.
   - **D.** Enable `malloc()` inside the DMA ISR.
8. `[Concept: center_aligned_pwm_midpoint_adc_sampling]` If a $40\text{ kHz}$ ISR ($25.0\ \mu\text{s}$ period) has a measured worst-case execution time of $\text{WCET} = 3.0\ \mu\text{s}$ at $170\text{ MHz}$, compute the percentage of CPU time $100 \times \frac{\text{WCET}}{T_{\text{PWM}}}$ consumed by the fast ISR (tolerance $\pm 10^{-9}\%$).

**Gate answer key:**
```python
import math

g1_choice = "A"
g2_fpwm_khz = (170_000_000.0 / (2.0 * 1700.0)) / 1000.0
g3_norm_angle = -0.50
g4_choice = "A"
g5_seq_after_3 = 3 * 2
g6_choice = "A"
g7_choice = "A"
g8_cpu_pct = 100.0 * (3.0 / 25.0)

assert g1_choice == "A"
assert math.isclose(g2_fpwm_khz, 50.0, rel_tol=1e-9)
assert math.isclose(g3_norm_angle, -0.50, rel_tol=1e-9)
assert g4_choice == "A"
assert g5_seq_after_3 == 6
assert g6_choice == "A"
assert g7_choice == "A"
assert math.isclose(g8_cpu_pct, 12.0, rel_tol=1e-9)
```
- **Pass mark:** $7/8$ ($80\%+$). Remediation: Q1, Q2, Q8 $\to$ `## 3. Formalization` item 1; Q3–Q4 $\to$ `## 3. Formalization` item 2; Q5–Q7 $\to$ `## 3. Formalization` item 3.

## 8. Common mistakes
| Symptom | Root cause | 2-minute fix |
| :--- | :--- | :--- |
| ADC current readings become wildly noisy whenever PWM duty cycle exceeds $92\%$ on a 3-shunt inverter | At $d > 92\%$, the low-side MOSFET ON window $(1 - d)T_{\text{PWM}}$ shrinks below the ringing + ADC acquisition time ($< 400\text{ ns}$). | Cap maximum modulation duty or reconstruct the 3rd phase current from the two phases with the widest low-side ON windows using $i_a + i_b + i_c = 0$. |
| `SeqLock` reader occasionally reads half-updated struct fields on `-O3` compiler optimization | Used a plain `int` without `std::atomic` `memory_order_acquire` / `memory_order_release` fences, allowing the compiler to hoist or sink struct reads outside the `s1`/`s2` sequence checks. | Use `std::atomic<uint32_t>` with explicit `memory_order_acquire` / `memory_order_release` (and `atomic_thread_fence(memory_order_acquire)` before reading `s2`). |
| Calling FreeRTOS `xSemaphoreTakeFromISR` inside the $40\text{ kHz}$ `ADC_DMA_TC` ISR triggers a hard `configASSERT` crash | Assigned the $40\text{ kHz}$ ISR to NVIC priority `0` (above `configMAX_SYSCALL_INTERRUPT_PRIORITY`), where RTOS kernel calls are forbidden to preserve zero-latency response. | Keep NVIC Priority `0` completely free of RTOS API calls and communicate with RTOS tasks exclusively via a lock-free `SeqLock` or SPSC ring buffer. |

## 9. Resources
- **STMicroelectronics *AN5305 (CORDIC Coprocessor on STM32G4)*, Embedded Rust *RTIC / Embassy Book (`rtic.rs`, `embassy.dev`)*, & Hans Boehm — *Can Seqlocks Get Along With Programming Language Memory Models?* (`resources/open-source-toolchains.md`):** Hardware `TIM1_TRGO2` triggering, `Q1.31` CORDIC math, and C++20/Rust lock-free concurrency `[VERIFIED 2026-10-15]`.
- **Track 04 (`04-embedded-and-realtime/README.md`):** Directly continues into Step 3.5 (`04-embedded.T3.05`) `[VERIFIED 2026-10-15]`.

## 10. Next modules
- Proceed to legacy **Step 3.5 (`04-embedded.T3.05`)** in [`04-embedded-and-realtime/README.md`](../04-embedded-and-realtime/README.md#tier-3-advanced--production).
