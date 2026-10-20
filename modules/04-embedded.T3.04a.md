---
id: 04-embedded.T3.04a
title: "Center-Aligned PWM Midpoint ADC Triggering, Q1.31 Fixed-Point Arithmetic & Lock-Free SeqLock"
track: "04"
tier: 3
prereqs:
  - 03-sensors.T3.03a
  - 04-embedded.T2.04b
  - 04-embedded.T2.04c
new_concepts:
  - center_aligned_pwm_midpoint_adc_sampling
  - q131_fixed_point_trig_scaling
  - seqlock_optimistic_even_odd_versioning
owns:
  - q131_cordic_hardware_coprocessor
uses:
  - dma_double_buffered_ping_pong_isr
  - rate_monotonic_response_time_analysis
  - zephyr_static_threads_and_k_mutex
  - minmax_zero_sequence_svpwm_injection
est_hours: 5.0
hardware_required: false
safety_level: none
resources_verified: true
difficulty:
  math: 4
  coding: 4
  tools: 3
  hardware_risk: low
  simulation: full
verification: ci-native
plant: tier1_arm_motor
---

<!-- run-callout:start -->
> **Run this in the workbench.** [Open MechaLab](https://tle47.github.io/Mechatronics-Roadmap/) → **Tab 2, Run Python Lessons** → search `EX.04-embedded.T3.04a` and pick it from the list. The starter code, hints and graded check live there; this page is the reading copy, and nothing you type here is saved.
<!-- run-callout:end -->

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

$$
f_{\text{PWM}} = \frac{f_{\text{tim}}}{2 \cdot \text{ARR}}, \qquad \text{ARR} = \frac{f_{\text{tim}}}{2 \, f_{\text{PWM}}}
$$

   For active high-side duty cycle $d_{\max} = \max(d_a, d_b, d_c)$ and dead-time $t_{\text{dead}}$, the low-side shunt conduction window centered around `CNT == ARR` has duration $t_{\text{low,min}} = (1 - d_{\max}) T_{\text{PWM}} - 2 t_{\text{dead}}$, which must exceed $t_{\text{ring}} + t_{\text{acq}}$ for valid 3-shunt sampling.
2. **Signed Q1.31 Fixed-Point Representation (`CORDIC` Format):** Mapping normalized real number $x \in [-1.0, +1.0 - 2^{-31}]$ to signed 32-bit integer $X_{Q31} \in [-2^{31}, 2^{31}-1]$:

$$
X_{Q31} = \operatorname{ clamp }\!\left(\operatorname{round}\!\left(x \cdot 2^{31}\right), -2^{31}, 2^{31}-1\right), \qquad \hat{x} = \frac{X_{Q31}}{2^{31}}
$$

   where an electrical angle $\theta_e \in [-\pi, +\pi)$ is normalized first to $x = \theta_e / \pi \in [-1.0, +1.0)$.

   - **Hardware `CORDIC` Iteration:** The coprocessor evaluates $\sin\theta$ and $\cos\theta$ with no multiplier at all. Starting from $(x_0, y_0) = (1/K, 0)$ and $z_0 = \theta$, it applies $n$ microrotations by the precomputed angles $\alpha_i = \tan^{-1}(2^{-i})$, choosing the sign $\sigma_i = \operatorname{sign}(z_i)$ so that $z$ is driven to zero:

$$
x_{i+1} = x_i - \sigma_i 2^{-i} y_i, \qquad y_{i+1} = y_i + \sigma_i 2^{-i} x_i, \qquad z_{i+1} = z_i - \sigma_i \alpha_i
$$

     Every step is an arithmetic shift and an add, which is what makes it a hardware block rather than a library call. The rotation lengthens the vector by $\sqrt{1 + 2^{-2i}}$, so the accumulated gain $K = \prod_i \sqrt{1 + 2^{-2i}} \approx 1.646760$ is pre-divided out in $x_0$. After $n$ steps the residual angle is bounded by $\alpha_{n-1} = \tan^{-1}(2^{-(n-1)})$, and because $\sum_i \alpha_i \approx 1.743\ \text{rad}$ ($99.9^\circ$), a quadrant fold has to precede the iteration for a full-turn angle.
3. **Wait-Free `SeqLock` Consistency Invariant:** Let $s_1$ be the sequence counter read before copying payload $P$ and $s_2$ be the sequence counter read after copying $P$. The snapshot $P$ is guaranteed tear-free iff:

$$
\text{Valid}(s_1, s_2) \iff ((s_1 \bmod 2) == 0) \;\land\; (s_1 == s_2)
$$


### Use & Understand
Three primitives, three reasons to reach for them, and a check for each that costs one line:
- **Centre-aligned midpoint sampling** is what you do when the loop period is short enough that a context switch is a measurable fraction of it - $25\ \mu\text{s}$ here - and the shunt is only meaningful away from a switching edge. Sampling at `CNT == ARR` costs no CPU time and removes the ringing that a free-running trigger would digitise.
- **Q1.31** is what a hardware `CORDIC` or a fixed-point DSP wants: the normalised angle $\theta_e/\pi$ and the trig result are 32-bit integers, so a $\sin/\cos$ pair comes back in clock cycles rather than a soft-float library call.
- **A `SeqLock`** is what you do when a $40\text{ kHz}$ ISR must publish a struct and must never wait for the $1\text{ kHz}$ reader. The writer bumps the sequence counter twice and never blocks; the reader validates the pair and retries.

Run the module's own numbers once: $\text{ARR} = 170\text{ MHz} / (2 \times 40\text{ kHz}) = 2125$ ticks, so $T_{\text{PWM}} = 25\ \mu\text{s}$; at $d_{\max} = 0.88$ with $250\text{ ns}$ of dead time at each edge the low-side window is $0.12 \times 25\,000 - 2 \times 250 = 2500\text{ ns}$, well clear of the $250\text{ ns}$ ringing plus $150\text{ ns}$ acquisition; $\cos(\pi/3) = 0.5$ encodes to `0x40000000`; and a reader that saw $s_1 = 4, s_2 = 6$ retries instead of using the snapshot.

The checks: `ARR` a positive integer (a value near $4250$ means the factor of two was dropped), $t_{\text{low,min}} > t_{\text{ring}} + t_{\text{acq}}$, a decoded word within half a step of the value it came from, and a valid snapshot whose $s_1$ is even **and** equal to $s_2$.

### Derive & Extend
1. **The period comes from the counter's own path.** In up-down mode the counter walks $0 \to \text{ARR}$ in `ARR` ticks and back in `ARR` ticks, so a full PWM period costs $2\,\text{ARR}$ timer ticks:

$$
T_{\text{PWM}} = \frac{2\,\text{ARR}}{f_{\text{tim}}} \quad\Longrightarrow\quad f_{\text{PWM}} = \frac{f_{\text{tim}}}{2\,\text{ARR}}, \qquad \text{ARR} = \frac{f_{\text{tim}}}{2 f_{\text{PWM}}}
$$

   At $f_{\text{tim}} = 170\text{ MHz}$ and $f_{\text{PWM}} = 40\text{ kHz}$ this is $2125$, an exact integer, which is why the carrier comes out at precisely $40\text{ kHz}$.
2. **The low-side window is what is left of the period.** One period is the high-side on-time $d\,T_{\text{PWM}}$, two dead-time gaps of $t_{\text{dead}}$ (one at each edge), and the low-side conduction that remains:

$$
t_{\text{low}} = T_{\text{PWM}} - d\,T_{\text{PWM}} - 2t_{\text{dead}} = (1 - d)\,T_{\text{PWM}} - 2t_{\text{dead}}
$$

   At $d_{\max} = 0.88$, $T_{\text{PWM}} = 25\ \mu\text{s}$ and $t_{\text{dead}} = 250\text{ ns}$: $0.12 \times 25\,000 - 500 = 2500\text{ ns}$. Subtracting one dead time instead of two gives $2750\text{ ns}$ - the worked example's own tell.
3. **The Q1.31 step and its rounding error.** Encoding is $X = \operatorname{round}(x \cdot 2^{31})$ and decoding is $\hat{x} = X/2^{31}$, so the representable step is $2^{-31}$ and rounding can move a value by at most half a step:

$$
\lvert\hat{x} - x\rvert \;\le\; \frac{1}{2 \cdot 2^{31}} = 2^{-32}
$$

   The upper end of the range is $2^{31} - 1$, so $+1.0$ itself is not representable and saturates at $1 - 2^{-31}$; the clamp is asymmetric on purpose, because wrapping $+1.0$ would read back as $-1.0$.
4. **Extend.** A reader copy takes $t_c$ and the writer republishes every $T_w$. A copy is torn exactly when a write begins inside it, which in steady state happens on a fraction $t_c/T_w$ of attempts, so attempts are geometric with success probability $1 - t_c/T_w$ and the expected number of attempts is

$$
\mathbb{E}[\text{attempts}] = \frac{1}{1 - t_c/T_w} = \frac{T_w}{T_w - t_c}
$$

   With $t_c = 2\ \mu\text{s}$ and $T_w = 25\ \mu\text{s}$ that is $25/23 \approx 1.09$ - one extra attempt in roughly eleven reads - and the reader's worst case is unbounded even though its expected cost is not. Work out the copy time at which the reader would spend more than five per cent of its own period retrying, and what a double-buffered SPSC queue would change about that bound.

## 4. Worked example
**Predict first (before you run it):** Commit to four values before the script runs. (1) What is `ARR` for $f_{\text{tim}} = 170\text{ MHz}$ and $f_{\text{PWM}} = 40\text{ kHz}$ in center-aligned mode, and what is $t_{\text{low,min}}$ at $d_{\max} = 0.88$ with $250\text{ ns}$ of dead time at each edge? (2) What `Q1.31` word encodes $\cos(\pi/3) = 0.5$? (3) Is a snapshot taken at $s_1 = 4, s_2 = 6$ valid? Two tells: an `ARR` of $4250$ means the up-down counter's factor of two was dropped, and $t_{\text{low,min}} = 2750\text{ ns}$ means dead time was subtracted at one edge instead of both.
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

### Graded package - the register, the word and the sequence counter
[`exercises/04-embedded.T3.04a/`](../exercises/04-embedded.T3.04a/) turns this section into a test. `starter.py` holds eight holes: `center_aligned_arr` and `pwm_frequency` (the up-down counter's factor of two, both ways round), `low_side_window_ns` (a dead time at each edge), `q31_encode` and `q31_decode` (the 2⁻³¹ scale with its asymmetric clamp), `angle_to_q31` (the $\theta_e/\pi$ normalisation, and the refusal to take an angle outside it), `seqlock_valid` (even **and** unchanged) and `isr_cpu_percent`. Edit it, then run the tests the way CI does:

```bash
EXERCISE_TARGET=exercises/04-embedded.T3.04a/starter.py \
  python3 -m unittest discover -s exercises/04-embedded.T3.04a -p 'test_*.py'
```

**40 tests.** The register is checked at the worked example's $2125$, the exercise's $3200$, the Skip test's $3000$ and the Gate test's $50\text{ kHz}$, so a missing factor of two fails; the window is checked at $2500\text{ ns}$ and $2100\text{ ns}$ and at a 99% duty where it correctly goes negative, so a single dead-time subtraction fails; the Q1.31 word is checked at $\cos(\pi/3) = 2^{30}$, at $-0.50 = -2^{30}$, at the Skip test's $2^{29}$, and at $+1.0$ clamping to `0x7FFFFFFF` instead of wrapping to $-2^{31}$; the sequence check rejects an odd snapshot even when $s_1 = s_2$, which is the case a bare equality test lets through; and the ISR load is checked at the Gate test's $12\%$. The transfer suite runs the **plant's own timing**: the 40 kHz carrier is exactly 40 periods inside one 1 ms plant tick, the same register arithmetic at the plant's rate gives ARR $= 85\,000$ and a $119.5\ \mu\text{s}$ low-side window, and a second of 1 kHz writes leaves `seq = 2000`. Five planted faults - `arr_forgets_the_half_period`, `dead_time_counted_once`, `q31_scale_is_2_pow_30`, `seqlock_ignores_parity`, `cpu_percent_forgets_the_hundred` - each fail the test named for them.


- **📚 What to Learn & Resources to Solve This Exercise:**
  - **Required Foundations Modules (`00-foundations`):** [`00-foundations.T2.00d`](00-foundations.T2.00d.md) (*Filter Group Delay*) and [`00-foundations.T2.00f`](00-foundations.T2.00f.md) (*Sampling, Aliasing & Decimation*).
  - **Prerequisite Bridge Modules:** [`04-embedded.T2.04a`](04-embedded.T2.04a.md)–[`04-embedded.T2.04d`](04-embedded.T2.04d.md) and Legacy **Step 2.5 (`04-embedded.T2.05`)**.
  - **Core Concepts to Review First:** C++20 `WaitFreeSeqLock<T>` even/odd sequence retry protocol, EtherCAT Distributed Clocks (`DC`) propagation-compensated clock offset + PI drift discipline, and Hogenauer `sinc³` $\Sigma\Delta$ decimation ($G = \text{OSR}^3$, group delay $\tau_g = \frac{3(\text{OSR}-1)}{2 f_{\text{mod}}}$) in `## 3. Formalization` and `## 4. Worked example` above.
  - **Study Links & Resources:** [Hans Boehm *Seqlocks Paper*](https://dl.acm.org/doi/10.1145/2247684.2247688), [Hogenauer CIC Filter Paper (IEEE TSP 1981)](https://ieeexplore.ieee.org/document/1163535), and [Track 04 Tier 3 (`04-embedded-and-realtime/README.md`)](../04-embedded-and-realtime/README.md#tier-3-advanced--production) (**Tab 8: Attitude ESKF & SeqLock**).

### Starter code
```python
# --- Exercise scaffold: fill in each TODO, then compare against the numbers in the full solution below ---
import math

Q31_SCALE = 1 << 31
Q31_MIN = -(1 << 31)
Q31_MAX = (1 << 31) - 1

def center_aligned_arr(f_tim_hz, f_pwm_hz):
    """ARR = f_tim / (2 f_pwm)."""
    # TODO 1: up-down mode spends TWO timer ticks per PWM period
    ...

def pwm_frequency(f_tim_hz, arr):
    """f_pwm = f_tim / (2 ARR)."""
    # TODO 2: the same factor of two, solved for the frequency
    ...

def low_side_window_ns(d_max, t_dead_ns, f_pwm_hz):
    """t_low,min = (1 - d_max) T_pwm - 2 t_dead."""
    # TODO 3: there is a dead time at BOTH switching edges, so subtract two of them
    ...

def q31_encode(x):
    """X = clamp(round(x * 2^31), -2^31, 2^31 - 1)."""
    # TODO 4: the scale is 2 to the 31, and +1.0 clamps to 0x7FFFFFFF instead of wrapping
    ...

def q31_decode(word):
    """x_hat = X / 2^31."""
    # TODO 5: divide by the same 2^31 - by 2^30 would read every word at double its value
    ...

def angle_to_q31(theta_rad):
    """x = theta / pi, then encoded."""
    # TODO 6: divide by PI first; the CORDIC format is the normalised angle
    ...

def seqlock_valid(s1, s2):
    """Tear-free iff s1 is even and s1 == s2."""
    # TODO 7: an odd s1 means a write was in flight, even when s1 == s2
    ...

def isr_cpu_percent(wcet_us, period_us):
    """100 * WCET / T_pwm."""
    # TODO 8: a percentage needs the multiply by 100
    ...

print("scaffold ready: 8 TODOs to fill, then compare against the numbers in the full solution")
```

**Expected numbers (the answer):** $\text{ARR} = 3200$; $X_{Q31} = -1{,}073{,}741{,}824$ (`-2**30`).

### Hint ladder
1. **One PWM period is two counter sweeps.** $160\ \text{MHz} / (2 \times 25\ \text{kHz}) = 3200$ ticks; the same factor of two turns $\text{ARR}$ back into a frequency, so verify $25{,}000\ \text{Hz}$ with it before moving on.
2. **Two edges, two dead times.** At $d_{\max} = 0.88$ over a $40\ \mu\text{s}$ carrier the low-side window is $0.12 \times 40{,}000 - 2 \times 250 = 4300\ \text{ns}$; subtracting one dead time reports $4550$, which is the worked example's own tell.
3. **$x = -0.50$ sits exactly on $-2^{30}$.** $\text{round}(-0.5 \times 2^{31}) = -1{,}073{,}741{,}824$, and decoding divides by $2^{31}$ to give back $-0.5$ with no residue.
4. **Parity, then equality.** `seqlock_valid(4, 4)` is true, `(5, 5)` is false because the writer was mid-update, and `(4, 6)` is false because the counter moved: both conditions are required.

5. **What the suite refuses.** `center_aligned_arr` refuses a non-positive timer clock or carrier, and a carrier too fast to give one tick per half period; `pwm_frequency` refuses a zero ARR; `low_side_window_ns` refuses a duty outside `[0, 1]`, a negative dead time and a zero carrier; `angle_to_q31` refuses `theta >= pi` or `theta < -pi` (the normalised range is `[-1, 1)`: `+pi` collides with the one value it excludes, while `-pi` encodes exactly); `q31_decode` refuses a word outside int32; `seqlock_valid` refuses a negative sequence; and `isr_cpu_percent` refuses a zero period or a negative execution time - each raises `ValueError`.

### Full Solution
```python
import math

Q31_SCALE = 1 << 31
Q31_MIN = -(1 << 31)
Q31_MAX = (1 << 31) - 1


def center_aligned_arr(f_tim_hz, f_pwm_hz):
    """ARR = f_tim / (2 f_pwm): an up-down counter spends two ticks per PWM period."""
    if f_tim_hz <= 0.0 or f_pwm_hz <= 0.0:
        raise ValueError("timer and PWM frequencies are positive")
    arr = int(round(f_tim_hz / (2.0 * f_pwm_hz)))
    if arr < 1:
        raise ValueError("the carrier is too fast for this timer: ARR would be zero")
    return arr


def pwm_frequency(f_tim_hz, arr):
    """f_pwm = f_tim / (2 ARR) - the inverse of the register the carrier is built from."""
    if f_tim_hz <= 0.0:
        raise ValueError("the timer clock is positive")
    if arr < 1:
        raise ValueError("ARR counts up and back down, so it needs at least one tick")
    return f_tim_hz / (2.0 * float(arr))


def low_side_window_ns(d_max, t_dead_ns, f_pwm_hz):
    """t_low,min = (1 - d_max) T_pwm - 2 t_dead, with one dead time at each switching edge."""
    if not 0.0 <= d_max <= 1.0:
        raise ValueError("a duty cycle is a fraction in [0, 1]")
    if t_dead_ns < 0.0:
        raise ValueError("dead time cannot be negative")
    if f_pwm_hz <= 0.0:
        raise ValueError("the PWM frequency is positive")
    period_ns = 1e9 / f_pwm_hz
    return (1.0 - d_max) * period_ns - 2.0 * t_dead_ns


def q31_encode(x):
    """X = clamp(round(x * 2^31), -2^31, 2^31 - 1): +1.0 has no representation, it overflows."""
    if not math.isfinite(x):
        raise ValueError("a Q1.31 input must be finite")
    word = int(round(x * Q31_SCALE))
    return max(Q31_MIN, min(Q31_MAX, word))


def q31_decode(word):
    """x_hat = X / 2^31 - the inverse of the encoding, exact for every representable word."""
    if not isinstance(word, int):
        raise ValueError("a Q1.31 word is a signed 32-bit integer")
    if not Q31_MIN <= word <= Q31_MAX:
        raise ValueError("a Q1.31 word lives in [-2^31, 2^31 - 1], not %d" % word)
    return word / float(Q31_SCALE)


def angle_to_q31(theta_rad):
    """Normalise the electrical angle to x = theta / pi in [-1, 1) before encoding it."""
    if not math.isfinite(theta_rad):
        raise ValueError("an electrical angle must be finite")
    if not -math.pi <= theta_rad < math.pi:
        raise ValueError("normalise the angle into [-pi, pi) first, not %g rad" % theta_rad)
    return q31_encode(theta_rad / math.pi)


def seqlock_valid(s1, s2):
    """A copy is tear-free iff the counter it started on was even and it never moved."""
    if not isinstance(s1, int) or not isinstance(s2, int):
        raise ValueError("sequence numbers are integers")
    if s1 < 0 or s2 < 0:
        raise ValueError("a sequence counter only counts up")
    return (s1 % 2 == 0) and s1 == s2


def isr_cpu_percent(wcet_us, period_us):
    """100 * WCET / T_pwm: the share of the CPU the fast ISR takes."""
    if wcet_us <= 0.0:
        raise ValueError("a worst-case execution time is positive")
    if period_us <= 0.0:
        raise ValueError("the ISR period is positive")
    return 100.0 * wcet_us / period_us


# No `__main__` block on purpose: the browser grades this file's stdout against the appended
# self-check's single PASS line, and a second print here would be a mismatch for a correct answer.

arr = center_aligned_arr(160_000_000.0, 25_000.0)
word = q31_encode(-0.50)
assert arr == 3200
assert math.isclose(pwm_frequency(160_000_000.0, 3200), 25_000.0, rel_tol=1e-12)
assert math.isclose(low_side_window_ns(0.88, 250.0, 25_000.0), 4300.0, rel_tol=1e-12)
assert word == -1073741824
assert math.isclose(q31_decode(word), -0.50, rel_tol=1e-12)
# The worked example's exact 2^30 word is cos(pi/3), i.e. 0.5 in Q1.31.
assert q31_encode(math.cos(math.pi / 3.0)) == 1073741824
assert seqlock_valid(4, 4) is True and seqlock_valid(5, 5) is False and seqlock_valid(4, 6) is False
assert math.isclose(isr_cpu_percent(3.0, 25.0), 12.0, rel_tol=1e-12)

print(f"ARR={arr} | f_pwm={pwm_frequency(160_000_000.0, arr):.1f} Hz | q31(-0.50)={word} | valid(5,5)={seqlock_valid(5, 5)}")

```

Printed: `ARR=3200 | f_pwm=25000.0 Hz | q31(-0.50)=-1073741824 | valid(5,5)=False`

**On the shared arm.** The package's Transfer suite measures this module's 40 kHz carrier against the plant's own 1 ms tick, and the Q1.31 word against the plant's 2.5 N*m clamp:

```python
import mechalab_plant as plant

carrier_hz = 170_000_000.0 / (2.0 * 2125)               # the module's own ARR
periods_per_tick = carrier_hz * plant.DT
word = round((plant.TAU_LIMIT / 10.0) * (1 << 31))

assert abs(periods_per_tick - 40.0) < 1e-9
assert word == 1 << 29
print("carrier=%.0f Hz -> %.0f periods in one %.0f ms tick | 2.5 N*m over 10 -> %d"
      % (carrier_hz, periods_per_tick, plant.DT * 1e3, word))
```

### Break it on purpose
Inject the parity slip the exercise plants (`seqlock_ignores_parity`), keeping the writer at $40\text{ kHz}$ and the reader at $1\text{ kHz}$:
- **Inject:** implement `seqlock_valid(s1, s2)` as `s1 == s2` only, dropping the even-parity test.
- **Symptom:** `valid(5, 5)` now returns `True` although the writer was mid-update, so the reader accepts a 32-byte telemetry struct whose first fields are from the previous tick and whose last fields are from the current one. `valid(4, 6)` is still rejected, which is why the bug survives a test that only ever starts on an even counter.
- **Diagnose:** the first read's parity is the only signal that separates "the writer finished before $s_1$" from "the writer had already started at $s_1$"; equality alone cannot see the difference, because a completed write returns the counter to an even value. A missing `acquire`/`release` fence produces a different symptom — fields that never change at all — and dropping the $s_1 = s_2$ check admits $4 \to 6$, not $5 \to 5$.
- **Fix:** restore `(s1 & 1) == 0 and s1 == s2`, then re-run the $100{,}000$-preemption stress test in **Tab 8 (Attitude ESKF & SeqLock)**: every torn copy must retry, and the retries per reader must stay bounded as the writer rate rises.

## 6. Simulation path
Open **Tab 8 (Attitude ESKF & SeqLock — C++20 `WaitFreeSeqLock`, `TIM1_TRGO2` Timing & `ITCM/DTCM` Budget)** in the MechaLab Workbench (`npm run dev`), or run the Worked Example Python script above to stress-test the `SeqLock` across $100{,}000$ simulated preemptions.

No hardware required for this module (`hardware_required: false`). In Step 3.5 (`04-embedded.T3.05`), the `STM32G474` bare-metal C++20 firmware (`08-capstone-projects/stm32g4-foc-firmware/main.cpp`) and Embedded Rust (`RTIC` / `Embassy`) implementations run this exact pipeline:
```text
[TIM1 Peak CNT==ARR] ==(TRGO2)==> [SAR ADC1/2 + DMA] ==> [40 kHz ISR: CORDIC Q1.31 + SeqLock Write] ==> [1 kHz RTOS/Rust Reader]
```
Pass/fail verification in simulation: `ARR == 2125`, `q31_cos == 1073741824`, `seqlock_valid(4, 6) == False`, and `seqlock_valid(6, 6) == True`.


```mermaid
flowchart LR
    A["04-embedded.T3.04a: center_aligned_pwm_midpoint_adc_sampling"] --> B["q131_fixed_point_trig_scaling"]
    B --> C["seqlock_optimistic_even_odd_versioning"]
    C --> D["Verified Simulation & Checkpoint Pass"]
```

## 7. Checkpoint
Pass criteria: score $\ge 80\%$ ($4/5$) on the Skip test or score $\ge 80\%$ ($8/10$) on the Ladder Gate test below to unlock Step 3.5 (`04-embedded.T3.05`).

### Skip test
<!-- skip-test:start -->
1. `[Recall] [Concept: center_aligned_pwm_midpoint_adc_sampling]` A microcontroller advanced timer clocked at $f_{\text{tim}} = 180\text{ MHz}$ ($1.8 \times 10^8\text{ Hz}$) operates in center-aligned (up-down) mode to generate a $f_{\text{PWM}} = 30\text{ kHz}$ ($3.0 \times 10^4\text{ Hz}$) carrier. Compute the auto-reload register value $\text{ARR} = \frac{f_{\text{tim}}}{2 \, f_{\text{PWM}}}$ (tolerance $\pm 10^{-9}$).
2. `[Apply] [Concept: center_aligned_pwm_midpoint_adc_sampling]` For a $f_{\text{PWM}} = 40\text{ kHz}$ carrier ($T_{\text{PWM}} = 25{,}000\text{ ns}$) with maximum phase duty cycle $d_{\max} = 0.90$ and dead-time $t_{\text{dead}} = 200\text{ ns}$, compute the minimum low-side shunt conduction window $t_{\text{low,min}} = (1 - d_{\max})T_{\text{PWM}} - 2 t_{\text{dead}}$ in nanoseconds ($\text{ns}$, tolerance $\pm 10^{-6}\text{ ns}$).
3. `[Transfer] [Concept: q131_fixed_point_trig_scaling]` Convert the normalized real value $x = +0.25$ into its signed 32-bit `Q1.31` integer representation $X_{Q31} = \operatorname{round}(x \cdot 2^{31})$ (tolerance $\pm 10^{-9}$).
4. `[Concept: seqlock_optimistic_even_odd_versioning]` In a Wait-Free Sequence Lock (`SeqLock`), a $1\text{ kHz}$ reader task reads `s1 = 12` before copying the shared struct and reads `s2 = 14` immediately after copying the struct. What happened during the copy, and what must the reader do?
   - **A.** The $40\text{ kHz}$ writer ISR preempted the reader mid-copy and completed a write (`12 -> 13 -> 14`), so the copied struct may be torn and the reader must discard it and retry the read loop immediately.
   - **B.** The copy succeeded without interruption; use the data.
   - **C.** The CPU clock stopped working.
   - **D.** The writer task is deadlocked waiting for the reader.
5. `[Spaced review -> 04-embedded.T2.04c — Concept: zephyr_static_threads_and_k_mutex]` Four static threads each reserve a $1024\,\text{byte}$ stack. Compute the total stack in bytes (tolerance $\pm 10^{-9}$).

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
q5_review = 4.0 * 1024.0
assert math.isclose(q5_review, 4096.0, rel_tol=1e-9, abs_tol=1e-09)
```
- **Pass mark:** $4/5$ ($80\%+$). If you missed Q1 or Q2, study `## 3. Formalization` item 1; Q3, study `## 3. Formalization` item 2; Q4, study `## 3. Formalization` item 3. If you missed  Q5, review `04-embedded.T2.04c`. On pass, proceed to `## 10. Next modules`.
<!-- skip-test:end -->

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

9. `[Concept: q131_cordic_hardware_coprocessor]` Compute the `CORDIC` microrotation angle $\alpha_3 = \tan^{-1}(2^{-3})$ in radians (tolerance $\pm 10^{-9}$).
10. `[Concept: q131_cordic_hardware_coprocessor]` Why does a `CORDIC` microrotation need no multiplier?
   - **A.** Because every factor is a power of two, so each product is an arithmetic shift of an integer, leaving only adds, shifts and a table of $\tan^{-1}$ constants.
   - **B.** Because the coprocessor caches every sine value in flash.
   - **C.** Because Q1.31 numbers are always integers.
   - **D.** Because the rotation gain $K$ is applied to the angle instead of the vector.

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
g9_alpha3 = math.atan(2.0 ** -3)
g10_choice = "A"

assert g1_choice == "A"
assert math.isclose(g2_fpwm_khz, 50.0, rel_tol=1e-9)
assert math.isclose(g3_norm_angle, -0.50, rel_tol=1e-9)
assert g4_choice == "A"
assert g5_seq_after_3 == 6
assert g6_choice == "A"
assert g7_choice == "A"
assert math.isclose(g8_cpu_pct, 12.0, rel_tol=1e-9)
assert math.isclose(g9_alpha3, 0.124354995, abs_tol=1e-9)
assert g10_choice == "A"
```
- **Pass mark:** $8/10$ ($80\%+$). Remediation: Q1, Q2, Q8 $\to$ `## 3. Formalization` item 1; Q3–Q4, Q9–Q10 $\to$ `## 3. Formalization` item 2; Q5–Q7 $\to$ `## 3. Formalization` item 3.

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
