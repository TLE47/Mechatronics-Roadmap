---
id: 03-sensors.T3.03a
title: "Rotating-Frame Cross-Coupling (omega_e L i), Min-Max SVPWM Bus Utilization (1/sqrt(3)) & Encoder Harmonic Calibration"
track: "03"
tier: 3
prereqs:
  - 01-electronics.T3.01a
  - 03-sensors.T2.03a
new_concepts:
  - dq_inductive_cross_coupling_feedforward
  - svpwm_zero_sequence_hexagonal_limit
  - encoder_spatial_harmonic_error_fit
uses:
  - synchronous_dq_foc_current_loop
  - amplitude_invariant_clarke_park_transform
est_hours: 4.5
hardware_required: false
safety_level: none
resources_verified: true
difficulty:
  math: 4
  coding: 3
  tools: 2
  hardware_risk: low
  simulation: full
verification: ci-native
plant: tier1_arm_motor
---

<!-- run-callout:start -->
> **Run this in the workbench.** [Open MechaLab with `EX.03-sensors.T3.03a` loaded](https://tle47.github.io/Mechatronics-Roadmap/?lesson=EX.03-sensors.T3.03a) - it opens on the **Run Python Lessons** tab with that entry selected. Starter code, hints and the graded check are ready; this page is the reading copy, and nothing you type here is saved.
<!-- run-callout:end -->

## 1. Why it matters
This is the final bridge module in the Track 03 Tier 3 ladder before Step 3.4 (`03-sensors.T3.04`). In Tier 2 (`03-sensors.T2.04`), you closed two independent PI current loops on $i_d$ and $i_q$ using sinusoidal PWM (`SPWM`). When you spin a joint actuator at high electrical speed $\omega_e = p \omega_m$ ($> 1000\text{ rad/s}$), three production bottlenecks emerge: (1) rotating the reference frame at $\omega_e$ creates physical Coriolis-like **inductive cross-coupling voltages** ($-\omega_e L_q i_q$ on the $d$-axis and $+\omega_e L_d i_d + \omega_e \psi_m$ on the $q$-axis) that cause $i_d$ to sag and waste torque unless canceled by **decoupling feedforward**, (2) pure sine modulation clips at phase peak $V_{\text{bus}}/2 = 0.500\,V_{\text{bus}}$, whereas **Min-Max Zero-Sequence Space-Vector PWM (`SVPWM`)** shifts the floating neutral point to unlock the full hexagon inscribed circle $V_{\text{bus}}/\sqrt{3} \approx 0.5774\,V_{\text{bus}}$ (**$+15.47\%$ more speed/voltage for free!**), and (3) off-axis magnetic encoder mounting eccentricity injects $1\times$ and $2\times$ spatial angle ripple that causes torque ripple unless canceled by a **Fourier harmonic lookup table (LUT)**. Already know this? Take the Skip test or the Ladder Gate test in section 7 first.

## 2. Intuition first

<!-- figure: dq-coupling | The two axes are coupled by wL, and the decoupler cancels exactly those terms. -->

Three physical insights make high-speed FOC and precision metrology click:
- **Why $d$ and $q$ Cross-Couple at High Speed ($\omega_e L i$):** In a stationary coil, voltage is $v = R i + L \frac{di}{dt}$. When you jump into a reference frame spinning at electrical speed $\omega_e$, any magnetic flux vector $\psi_{dq} = [L_d i_d + \psi_m,\ L_q i_q]^\top$ rotating with the frame sweeps across the stationary stator windings at rate $\omega_e \times \psi_{dq}$—generating $-\omega_e L_q i_q$ along the $d$-axis and $+\omega_e(L_d i_d + \psi_m)$ along the $q$-axis! Adding those exact terms to the PI controller outputs makes the $d$ and $q$ axes behave like two completely independent DC RL circuits at any speed.
- **Min-Max Zero-Sequence SVPWM (`+15.47%` Voltage Boost):** In a 3-phase star-connected motor with floating neutral, only the **line-to-line voltages** ($v_a - v_b$, $v_b - v_c$, $v_c - v_a$) drive motor current! Adding the **same common-mode offset $v_0(t)$** to all three phases ($v_a + v_0, v_b + v_0, v_c + v_0$) cancels out completely in $v_a - v_b$! By setting $v_0 = -\frac{1}{2}(\max(v_a, v_b, v_c) + \min(v_a, v_b, v_c))$, we center the three phase voltages inside the $[0, V_{\text{bus}}]$ rail at every instant, creating the characteristic "saddle-wave" duty cycle that reaches phase amplitude $V_{\max} = V_{\text{bus}} / \sqrt{3} \approx 0.57735\,V_{\text{bus}}$ before clipping!
- **Fourier Encoder Eccentricity & Anticogging LUT:** If a diametric magnet is off-center by just $0.1\text{ mm}$ relative to the Hall/AMR sensor chip, the measured angle $\hat{\theta}_m$ oscillates once per mechanical revolution ($a_1 \cos\theta_m + b_1 \sin\theta_m$), and magnetic ovality adds a twice-per-revolution term ($2\theta_m$). Sweeping the rotor slowly at constant speed and fitting the first $H$ Fourier harmonics removes $> 95\%$ of systematic encoder error in a 2-line LUT lookup!

## 3. Formalization
1. **Synchronous $d$-$q$ Voltage Equations & Decoupling Feedforward:** In the rotor $d$-$q$ frame rotating at electrical speed $\omega_e = p \omega_m$ ($\text{rad/s}$):

$$
\begin{aligned}
v_d &= R_s i_d + L_d \frac{di_d}{dt} \underbrace{- \omega_e L_q i_q}_{\text{cross-coupling}}, \qquad &v_d^* &= u_{d,\text{PI}} - \omega_e \hat{L}_q i_q \\
v_q &= R_s i_q + L_q \frac{di_q}{dt} + \underbrace{\omega_e (L_d i_d + \psi_m)}_{\text{cross-coupling + back-EMF}}, \qquad &v_q^* &= u_{q,\text{PI}} + \omega_e (\hat{L}_d i_d + \hat{\psi}_m)
\end{aligned}
$$

2. **Min-Max Zero-Sequence Space-Vector PWM (`SVPWM`):** Given inverse-Clarke phase voltage references $(v_a^*, v_b^*, v_c^)$ with $v_a^ + v_b^* + v_c^* = 0$ and bus voltage $V_{\text{bus}}$:

$$
v_0 = -\frac{\max(v_a^*, v_b^*, v_c^*) + \min(v_a^*, v_b^*, v_c^*)}{2}, \qquad d_x = \frac{1}{2} + \frac{v_x^* + v_0}{V_{\text{bus}}} \in [0, 1] \quad (x \in \{a, b, c\})
$$

   Maximum unclipped fundamental phase peak: $V_{\phi,\max}^{\text{SVPWM}} = \frac{V_{\text{bus}}}{\sqrt{3}} = \frac{2}{\sqrt{3}} V_{\phi,\max}^{\text{SPWM}} \approx 1.1547 \, V_{\phi,\max}^{\text{SPWM}}$.
3. **Fourier Harmonic Encoder Error Model:** For mechanical angle $\theta \in [0, 2\pi)$, systematic eccentricity/ellipticity error $\Delta\theta(\theta)$ is parameterized by harmonics $h \in \{1, 2, \dots, H\}$:

$$
\Delta\theta(\theta) = c_0 + \sum_{h=1}^{H} \left(a_h \cos(h\theta) + b_h \sin(h\theta)\right), \qquad a_h = \frac{2}{N}\sum_{k=0}^{N-1} e_k \cos(h\theta_k), \quad b_h = \frac{2}{N}\sum_{k=0}^{N-1} e_k \sin(h\theta_k)
$$


### Use & Understand
Level A is the supported entry. Reach for the $d$-$q$ decoupling when a current loop must track at $1\text{–}25\ \text{kHz}$ and the back-EMF would otherwise arrive as an unmodelled disturbance; reach for min-max SVPWM when the bus is fixed and you want $15.47\%$ more fundamental voltage than sine PWM; reach for the harmonic fit when an encoder's error repeats once or twice per turn and can be subtracted from a lookup table. Run the worked case and check the physics:
- $v_{d,\text{ff}} = -3.60\ \text{V}$ uses the *other* axis's inductance, $-\omega_e L_q i_q$, while $v_{q,\text{ff}} = 12.00\ \text{V}$ is pure back-EMF at $i_d = 0$. A $0.00\ \text{V}$ $q$-axis term means $\psi_m$ was dropped, not that the machine is ideal.
- $V_{\text{bus}}/\sqrt3 = 27.71\ \text{V}$ on a $48\ \text{V}$ bus is $15.47\%$ above the $24\ \text{V}$ sine limit; the duties must stay in $[0, 1]$ while $d_a - d_b = (v_a^* - v_b^*)/V_{\text{bus}}$ is preserved to $10^{-12}$.
- $v_0 = -6.0\ \text{V}$ turns $(+24, -12, -12)\ \text{V}$ into $(0.875, 0.125, 0.125)$. The mean would give $v_0 = 0$ and pin phase A at $d_a = 1.0$.
- $a_1 = 0.012$ rad and $b_2 = -0.005$ rad return with their signs, and the amplitude is $\sqrt{a^2 + b^2} = 0.013$ rad in quadrature - adding the coefficients gives $0.007$, which is not an amplitude at all.

### Derive & Extend
**1. Why the inscribed circle is $V_{\text{bus}}/\sqrt3$.** A balanced command with phase peak $V_p$ has the space vector

$$
\vec{v} = \frac{2}{3}\left(v_a + v_b e^{j2\pi/3} + v_c e^{j4\pi/3}\right), \qquad \lvert\vec{v}\rvert = V_p .
$$

The inverter can apply only the six active states, each of magnitude $\frac{2}{3}V_{\text{bus}}$ and spaced $60^\circ$ apart, so the reachable set is a hexagon. A sinusoid of amplitude $V_p$ stays inside it at every angle only while $V_p$ fits the inscribed circle:

$$
V_{\phi,\max} = \frac{2}{3}V_{\text{bus}}\cos 30^\circ = \frac{V_{\text{bus}}}{\sqrt3} = \frac{2}{\sqrt3}\cdot\frac{V_{\text{bus}}}{2},
$$

which is exactly the $1.1547$ gain over sine PWM.

**2. What the min-max offset buys.** With $v_0 = -\frac12(\max v^* + \min v^*)$ the shifted set is symmetric about zero,

$$
\max(v^* + v_0) = \frac{\max - \min}{2}, \qquad \min(v^* + v_0) = -\frac{\max - \min}{2},
$$

so every duty lies in $\left[\frac12 - \frac{\max-\min}{2V_{\text{bus}}}, \frac12 + \frac{\max-\min}{2V_{\text{bus}}}\right]$. The duties fit in $[0,1]$ whenever $\max - \min \le V_{\text{bus}}$, and because the offset is common to all three legs every line-to-line voltage is unchanged. The mean would leave $v_0 = 0$, put $d_a$ on the upper rail, and buy nothing.

**3. Where $2/N$ comes from.** Sampling at $\theta_k = 2\pi k/N$, the discrete sums obey $\sum_k \cos(h\theta_k)\cos(g\theta_k) = \frac{N}{2}\delta_{hg}$ for $h, g < N/2$, while every sine-cosine sum vanishes. Projecting $\Delta\theta = \sum_h (a_h\cos h\theta + b_h\sin h\theta)$ onto $\cos(h\theta_k)$ therefore returns $\frac{N}{2}a_h$, so $a_h = \frac{2}{N}\sum_k e_k\cos(h\theta_k)$: the factor is two because a cosine has no DC term to spread over the basis, not a normalisation convention.

**Extend.** Add a 5th harmonic $0.004\cos 5\theta$ to the worked error and re-fit at $N = 64$: the 1st and 2nd coefficients must be unchanged to machine precision, because the harmonics are orthogonal while $2h < N$. Then find the smallest $N$ at which a 5th harmonic aliases into the 1st, and say what that bound implies for the $4096$-count encoder's calibration table.

## 4. Worked example
**Predict first (before you run it):** Commit to five numbers before the code runs. (1) At $\omega_e = 1500\text{ rad/s}$, $L_d = L_q = 120\ \mu\text{H}$, $\psi_m = 0.008\text{ Wb}$, $i_d = 0\text{ A}$ and $i_q = 20.0\text{ A}$, what are $v_{d,\text{ff}}$ and $v_{q,\text{ff}}$ — and which one carries the back-EMF? (2) On a $48.0\text{ V}$ bus, does a phase peak of $V_{\text{bus}}/\sqrt{3}$ keep all three duties inside $[0, 1]$, and what is the largest peak SPWM can reach before it clips? (3) For an error built from $0.012\cos\theta - 0.005\sin 2\theta$ sampled at $64$ points, what do $a_1$ and $b_2$ come out to, with which signs? Two tells that your result is wrong rather than the module: a $v_{q,\text{ff}}$ of $0.00\text{ V}$ means the $\omega_e \psi_m$ back-EMF term was dropped (the inductance term is zero at $i_d = 0$), and a $d_a$ that lands above $1.0$ on a command the inscribed circle can hold means the zero-sequence offset was never added.

Compute (1) the $d$-$q$ decoupling feedforward voltages $(v_{d,\text{ff}}, v_{q,\text{ff}})$ for a PMSM spinning at $\omega_e = 1500\text{ rad/s}$ with $i_d = 0\text{ A}, i_q = 20.0\text{ A}$, (2) verify that Min-Max SVPWM fits a phase amplitude of $V_{\text{peak}} = V_{\text{bus}}/\sqrt{3} \approx 27.71\text{ V}$ inside $[0, 1]$ duty cycles on a $48.0\text{ V}$ bus (where SPWM clips above $24.0\text{ V}$), and (3) extract 1st and 2nd harmonic encoder errors via discrete Fourier projection.

```python
import math

# 1. d-q decoupling feedforward at w_e = 1500 rad/s, L_d = L_q = 120 uH, psi_m = 0.008 Wb, i_d = 0, i_q = 20 A:
we, Ld, Lq, psi_m = 1500.0, 120e-6, 120e-6, 0.008
id_meas, iq_meas = 0.0, 20.0
vd_ff = -we * Lq * iq_meas
vq_ff = we * (Ld * id_meas + psi_m)
assert math.isclose(vd_ff, -3.60, rel_tol=1e-9)
assert math.isclose(vq_ff, 12.0, rel_tol=1e-9)

# 2. Min-Max SVPWM at peak inscribed voltage V_peak = V_bus / sqrt(3) on V_bus = 48.0 V at theta_e = 0 rad:
V_bus = 48.0
V_peak = V_bus / math.sqrt(3.0)
va = V_peak * math.cos(0.0)
vb = V_peak * math.cos(-2.0 * math.pi / 3.0)
vc = V_peak * math.cos(+2.0 * math.pi / 3.0)
v0 = -0.5 * (max(va, vb, vc) + min(va, vb, vc))
da, db, dc = [0.5 + (v + v0) / V_bus for v in (va, vb, vc)]
assert all(0.0 - 1e-12 <= d <= 1.0 + 1e-12 for d in (da, db, dc))
assert math.isclose(da - db, (va - vb) / V_bus, rel_tol=1e-12)  # Line-to-line preserved exactly!

# 3. Fourier 1st & 2nd harmonic encoder calibration over N = 64 points:
N = 64
thetas = [2.0 * math.pi * k / N for k in range(N)]
err_samples = [0.012 * math.cos(th) - 0.005 * math.sin(2.0 * th) for th in thetas]
a1_hat = (2.0 / N) * sum(err_samples[k] * math.cos(thetas[k]) for k in range(N))
b2_hat = (2.0 / N) * sum(err_samples[k] * math.sin(2.0 * thetas[k]) for k in range(N))
assert math.isclose(a1_hat, 0.012, rel_tol=1e-9)
assert math.isclose(b2_hat, -0.005, rel_tol=1e-9)
print(f"vd_ff={vd_ff:.2f}V, vq_ff={vq_ff:.2f}V, SVPWM da={da:.4f}, a1={a1_hat:.4f} rad, b2={b2_hat:.4f} rad")
```
Expected output:
```text
vd_ff=-3.60V, vq_ff=12.00V, SVPWM da=0.9330, a1=0.0120 rad, b2=-0.0050 rad
```

## 5. Exercise
For a 3-phase inverter with $V_{\text{bus}} = 48.0\text{ V}$ and instantaneous phase voltage references $v_a^* = +24.0\text{ V}$, $v_b^* = -12.0\text{ V}$, and $v_c^* = -12.0\text{ V}$, compute (a) the Min-Max zero-sequence offset $v_0 = -\frac{1}{2}(\max(v_{abc}^) + \min(v_{abc}^))$, and (b) the three SVPWM duty cycles $(d_a, d_b, d_c)$ using $d_x = 0.5 + (v_x^ + v_0)/V_{\text{bus}}$. Verify that $v_0 = -6.0\text{ V}$ and $(d_a, d_b, d_c) = (0.875, 0.125, 0.125)$ ($\pm 10^{-9}$), compared to SPWM $(1.000, 0.250, 0.250)$ which is already hitting the upper saturation rail!
- **If your result differs:** Check that $\max = +24.0\text{ V}$ and $\min = -12.0\text{ V}$, so $v_0 = -0.5 \times (24.0 - 12.0) = -6.0\text{ V}$ and $v_a^* + v_0 = +18.0\text{ V}$.

### Graded package - the decoupling voltage, the saddle wave and the encoder LUT
[`exercises/03-sensors.T3.03a/`](../exercises/03-sensors.T3.03a/) turns this section into a test. `starter.py` holds seven holes: `dq_feedforward` ($-\omega_e L_q i_q$ on $d$, $\omega_e(L_d i_d + \psi_m)$ on $q$), `svpwm_offset`, `svpwm_duties`, `hexagon_limit`, `hexagon_gain`, `harmonic_coefficients` and `harmonic_amplitude`. Edit it, then run the tests the way CI does:

```bash
EXERCISE_TARGET=exercises/03-sensors.T3.03a/starter.py \
  python3 -m unittest discover -s exercises/03-sensors.T3.03a -p 'test_*.py'
```

**34 tests.** The feedforward is checked at the worked example's $-3.60\text{ V}$ and $12.00\text{ V}$, the Skip test's $-4.50\text{ V}$, the Gate test's $18.0\text{ V}$, and on a salient machine whose two axes have different inductances, so a swapped axis fails; the offset and duties are checked at the exercise's $-6.0\text{ V}$ and $(0.875, 0.125, 0.125)$, the Skip test's $-3.0\text{ V}$, the Gate test's $0.875$, at the hexagon limit where $d_a = 1.0$ exactly, and at a command outside the inscribed circle, which must be refused rather than clamped leg by leg; the $27.7128\text{ V}$ limit and the $+15.47\%$ gain are pinned; and the Fourier fit is checked at the worked example's $a_1 = 0.012$ and $b_2 = -0.005$ and the Gate test's $0.010\text{ rad}$ amplitude. The transfer suite runs **the plant's own 12-bit encoder**: an ideal encoder must fit to zero error, one count is $2\pi/4096 = 0.001534\text{ rad}$, the module's $0.012\text{ rad}$ eccentricity is $7.82$ counts and cancels to machine precision, a 2nd harmonic leaks nothing into the 1st at $4096$ samples, and the 25 kHz loop of Brushless Motor Control Lab executes $25$ updates inside one $1\text{ ms}$ plant tick. Five planted faults - `feedforward_swaps_axes`, `svpwm_offset_uses_mean`, `duties_ignore_offset`, `hexagon_uses_half_bus`, `harmonic_amplitude_sums` - each fail the test named for them.

### Starter code
```python
# --- Exercise scaffold: fill in each TODO, then check against the full solution below ---
import math


def dq_feedforward(omega_e_rad_s, ld_h, lq_h, id_a, iq_a, psi_m_wb):
    """Return (v_d_ff, v_q_ff) in V."""
    # TODO 1: v_d = -omega_e * L_q * i_q (the OTHER axis's inductance); v_q = +omega_e (L_d i_d + psi_m)
    ...


def svpwm_offset(va_v, vb_v, vc_v):
    """Return the Min-Max zero-sequence voltage v_0 in V."""
    # TODO 2: minus HALF the sum of the extremes - not the mean
    ...


def svpwm_duties(va_v, vb_v, vc_v, vbus_v):
    """Return the three leg duties (d_a, d_b, d_c), each in [0, 1]."""
    # TODO 3: add the same v_0 to every leg, divide by V_bus; refuse a vector outside the circle
    ...


def hexagon_limit(vbus_v):
    """Return the largest unclipped fundamental phase peak for Min-Max SVPWM, in V."""
    # TODO 4: V_bus / sqrt(3), not V_bus / 2
    ...


def hexagon_gain():
    """Return SVPWM's linear-range gain over sine PWM."""
    # TODO 5: 2 / sqrt(3); the quoted percentage boost is 100 * (gain - 1)
    ...


def harmonic_coefficients(errors_rad, harmonic):
    """Return (a_h, b_h) for one harmonic, from samples spread evenly over one mechanical turn."""
    # TODO 6: a_h = 2/N sum e cos(h theta), b_h = 2/N sum e sin(h theta) - two separate sums
    ...


def harmonic_amplitude(a_h, b_h):
    """Return the peak-to-zero amplitude of one harmonic, in rad."""
    # TODO 7: amplitudes add in quadrature
    ...


print("scaffold ready: 7 TODOs to fill, then compare against the numbers in the full solution")
```

**Expected numbers (the answer):** for $v_a^* = +24.0\text{ V}$, $v_b^* = v_c^* = -12.0\text{ V}$ on a $48.0\text{ V}$ bus, $v_0 = -6.0\text{ V}$ and $(d_a, d_b, d_c) = (0.875, 0.125, 0.125)$; the inscribed-circle limit is $48.0/\sqrt{3} = 27.7128\text{ V}$ and SVPWM's gain over SPWM is $2/\sqrt{3} = 1.1547$ ($+15.47\%$).

### Hint ladder
1. **The $d$-axis term uses $L_q$.** A flux on the $q$-axis sweeps into the $d$-axis as the frame turns, so $v_{d,\text{ff}} = -\omega_e L_q i_q$, while $v_{q,\text{ff}} = \omega_e(L_d i_d + \psi_m)$ carries both its own-inductance term and the back-EMF. At the worked $1500\text{ rad/s}$, $i_d = 0$ and $i_q = 20\text{ A}$, the two terms are $-3.60\text{ V}$ and $12.00\text{ V}$.
2. **Mid-range, not mean.** Here the three commands already sum to zero, so the mean would give $v_0 = 0$ and phase A pinned on the rail; the mid-range $-\tfrac{1}{2}(\max + \min) = -\tfrac{1}{2}(24.0 - 12.0) = -6.0\text{ V}$ centers the envelope and drops $d_a$ to $0.875$. Every leg gets that same offset - that is what keeps $d_a - d_b$ equal to $(v_a^* - v_b^*)/V_{\text{bus}}$.
3. **Two thirds of a bus, not half.** The hexagon's inscribed circle is $V_{\text{bus}}/\sqrt{3} = 0.5774\,V_{\text{bus}}$, which is $2/\sqrt{3} = 1.1547$ times SPWM's $V_{\text{bus}}/2$; the percentage quote is $100 \times 0.1547 = 15.47\%$. A command whose envelope exceeds $V_{\text{bus}}$ does not fit and must be refused, not clamped leg by leg.
4. **The factor of two is real.** $a_h = \frac{2}{N}\sum e_k\cos(h\theta_k)$ and $b_h = \frac{2}{N}\sum e_k\sin(h\theta_k)$: the $2/N$ normalizes a full-turn projection, and the amplitude is $\sqrt{a_h^2 + b_h^2}$ - adding the coefficients instead can even give a negative "amplitude".
5. **What the suite refuses, not clamps.** A negative $L_d$, $L_q$ or flux linkage in `dq_feedforward`; a command whose envelope does not fit in the `svpwm_duties` rail; a zero or non-finite reference in `svpwm_offset`; a dead bus in `hexagon_limit`; a `harmonic_coefficients` fit with no samples or a zeroth harmonic; a non-finite coefficient in `harmonic_amplitude` - each raises `ValueError` rather than returning a clamped or `nan` number.
6. **Compare the rail with the tests' slack, not with zero.** $V_{\text{bus}}/\sqrt{3}$ puts a leg *exactly* on $1.0$, and the sinusoid at that limit lands on $1.0 \pm 10^{-16}$ in floating point, so a bare `0 <= d <= 1` refuses a command that genuinely fits. The transfer test allows $\pm 10^{-9}$ and so must your guard: refuse only outside $[-10^{-9}, 1 + 10^{-9}]$, and keep the refusal for a command that is truly past the rail (the $25\text{ V}$ envelope on a $24\text{ V}$ bus).

### Full Solution
```python
import math


def dq_feedforward(omega_e_rad_s, ld_h, lq_h, id_a, iq_a, psi_m_wb):
    """The voltages the PI loops must add to cancel the rotating frame: (v_d_ff, v_q_ff) in V.

        v_d_ff = -omega_e L_q i_q
        v_q_ff = +omega_e (L_d i_d + psi_m)

    `omega_e` is electrical, `p * omega_m`; signing it is the caller's job, and a negative speed
    simply reverses both terms.
    """
    if ld_h < 0.0 or lq_h < 0.0:
        raise ValueError("an inductance cannot be negative")
    if psi_m_wb < 0.0:
        raise ValueError("a permanent-magnet flux linkage is a magnitude, not a signed value")
    vd_ff = -omega_e_rad_s * lq_h * iq_a
    vq_ff = omega_e_rad_s * (ld_h * id_a + psi_m_wb)
    return vd_ff, vq_ff


def svpwm_offset(va_v, vb_v, vc_v):
    """The Min-Max zero-sequence voltage v_0 = -(max(v_abc) + min(v_abc)) / 2, in V.

    Centring the envelope is what lets the common-mode term cancel out of every line-to-line
    voltage while the leg duties stay inside [0, V_bus].
    """
    for value in (va_v, vb_v, vc_v):
        if not math.isfinite(value):
            raise ValueError("a phase voltage reference must be a finite number")
    return -0.5 * (max(va_v, vb_v, vc_v) + min(va_v, vb_v, vc_v))


def svpwm_duties(va_v, vb_v, vc_v, vbus_v):
    """The three leg duty cycles d_x = 0.5 + (v_x + v_0) / V_bus, in [0, 1].

    A command outside the hexagon's inscribed circle is refused rather than clamped: clamping the
    three legs independently is the module's second Common-mistakes row, and the cure is a radial
    scale of (v_alpha, v_beta) before the inverse Park, not a per-leg limit here.
    """
    if vbus_v <= 0.0:
        raise ValueError("the DC bus voltage must be positive")
    v0 = svpwm_offset(va_v, vb_v, vc_v)
    duties = tuple(0.5 + (v + v0) / vbus_v for v in (va_v, vb_v, vc_v))
    for duty in duties:
        if duty < -1e-12 or duty > 1.0 + 1e-12:
            raise ValueError(
                "phase reference %.6g V does not fit the %.6g V bus: the vector is outside the "
                "hexagon's inscribed circle, so scale (v_alpha, v_beta) radially first"
                % (max(abs(va_v), abs(vb_v), abs(vc_v)), vbus_v)
            )
    return duties


def hexagon_limit(vbus_v):
    """The largest unclipped fundamental phase peak Min-Max SVPWM reaches: V_bus / sqrt(3)."""
    if vbus_v <= 0.0:
        raise ValueError("the DC bus voltage must be positive")
    return vbus_v / math.sqrt(3.0)


def hexagon_gain():
    """SVPWM's linear-range gain over sine PWM: 2/sqrt(3) = 1.1547, i.e. +15.47%."""
    return 2.0 / math.sqrt(3.0)


def harmonic_coefficients(errors_rad, harmonic):
    """Fit (a_h, b_h) of one spatial harmonic to `errors_rad` sampled uniformly over one turn.

    Samples are assumed evenly spaced over [0, 2pi), N = len(errors_rad), and

        a_h = (2/N) sum e_k cos(h theta_k),   b_h = (2/N) sum e_k sin(h theta_k)

    so the reconstruction is a_h cos(h theta) + b_h sin(h theta) - the module's section 3, item 3.
    """
    samples = list(errors_rad)
    count = len(samples)
    if count < 2:
        raise ValueError("a Fourier fit needs at least two samples over the turn")
    if harmonic < 1:
        raise ValueError("the harmonic order is a positive integer")
    a_h = 0.0
    b_h = 0.0
    for k, error in enumerate(samples):
        angle = 2.0 * math.pi * k / count
        a_h += error * math.cos(harmonic * angle)
        b_h += error * math.sin(harmonic * angle)
    return (2.0 / count) * a_h, (2.0 / count) * b_h


def harmonic_amplitude(a_h, b_h):
    """Peak-to-zero amplitude sqrt(a_h^2 + b_h^2) of one harmonic, in rad."""
    if not math.isfinite(a_h) or not math.isfinite(b_h):
        raise ValueError("harmonic coefficients are finite numbers")
    return math.hypot(a_h, b_h)


# No `__main__` block on purpose: the browser grades this file's stdout against the appended
# self-check's single PASS line, and a second print here would be a mismatch for a correct answer.

va, vb, vc, vbus = 24.0, -12.0, -12.0, 48.0
v0_exercise = svpwm_offset(va, vb, vc)
duties = svpwm_duties(va, vb, vc, vbus)

v_d_ff, v_q_ff = dq_feedforward(1500.0, 120e-6, 120e-6, 0.0, 20.0, 0.008)
v_peak = hexagon_limit(vbus)
theta = [2.0 * math.pi * k / 64 for k in range(64)]
errors = [0.012 * math.cos(t) - 0.005 * math.sin(2.0 * t) for t in theta]
a1, b1 = harmonic_coefficients(errors, 1)
a2, b2 = harmonic_coefficients(errors, 2)
try:
    svpwm_duties(30.0, -30.0, 0.0, vbus)
    refused = False
except ValueError:
    refused = True

assert math.isclose(v0_exercise, -6.0, rel_tol=1e-12)
assert all(math.isclose(d, want, abs_tol=1e-12) for d, want in zip(duties, (0.875, 0.125, 0.125)))
assert math.isclose(duties[0] - duties[1], (va - vb) / vbus, rel_tol=1e-12)
assert math.isclose(v_d_ff, -3.60, rel_tol=1e-12) and math.isclose(v_q_ff, 12.0, rel_tol=1e-12)
assert math.isclose(v_peak, 27.7128129, abs_tol=1e-6)
assert math.isclose(100.0 * (hexagon_gain() - 1.0), 15.4700538, abs_tol=1e-6)
assert math.isclose(a1, 0.012, rel_tol=1e-9) and math.isclose(b2, -0.005, rel_tol=1e-9)
assert math.isclose(harmonic_amplitude(0.008, -0.006), 0.010, rel_tol=1e-9)
assert math.isclose(a2, 0.0, abs_tol=1e-9) and math.isclose(b1, 0.0, abs_tol=1e-9)
assert refused

print("v0=%.1f V | duties=(%.3f, %.3f, %.3f) | limit=%.4f V | gain=%.4f (+%.2f%%)"
      % (v0_exercise, duties[0], duties[1], duties[2], v_peak, hexagon_gain(),
         100.0 * (hexagon_gain() - 1.0)))
print("feedforward=(%.2f, %.2f) V | a1=%.4f rad, b2=%.4f rad | gate |(a1,b1)|=%.4f rad"
      % (v_d_ff, v_q_ff, a1, b2, harmonic_amplitude(0.008, -0.006)))

```

Printed: `v0=-6.0 V | duties=(0.875, 0.125, 0.125) | limit=27.7128 V | gain=1.1547 (+15.47%)`, then `feedforward=(-3.60, 12.00) V | a1=0.0120 rad, b2=-0.0050 rad | gate |(a1,b1)|=0.0100 rad`.

**On the shared arm.** The Transfer suite in `exercises/03-sensors.T3.03a/` fits the plant's encoder error with this module's Fourier projection, at the plant's own 4096 counts:

```python
import math
import mechalab_plant as plant

one_count = 2.0 * math.pi / plant.ENCODER_CPR
angles = [2.0 * math.pi * k / plant.ENCODER_CPR for k in range(plant.ENCODER_CPR)]
errors = [one_count * math.cos(a) for a in angles]
a1 = (2.0 / plant.ENCODER_CPR) * sum(e * math.cos(a) for e, a in zip(errors, angles))
b1 = (2.0 / plant.ENCODER_CPR) * sum(e * math.sin(a) for e, a in zip(errors, angles))

assert math.isclose(a1, one_count, rel_tol=1e-12)
assert abs(b1) < 1e-12                     # a cosine error has no sine component
assert math.isclose(plant.DT * 25000.0, 25.0, rel_tol=1e-12)
print("plant: one count=%.9f rad | fitted a1=%.9f rad, b1=%.1e | 25 kHz loop = %.0f updates per tick"
      % (one_count, a1, b1, plant.DT * 25000.0))
```

### Break it on purpose
Use the exercise's own commands $v_a^* = +24.0\text{ V}$, $v_b^* = v_c^* = -12.0\text{ V}$ on $V_{\text{bus}} = 48.0\text{ V}$ and plant the `svpwm_offset_uses_mean` fault:
- **Inject:** compute the zero sequence as $v_0 = -\tfrac{1}{3}(v_a^* + v_b^* + v_c^*)$, the mean, instead of the mid-range $-\tfrac{1}{2}(\max + \min)$.
- **Symptom:** these three commands sum to zero, so the mean is $0.0\text{ V}$ and the duties come out $(1.000, 0.250, 0.250)$ — phase A pinned exactly on the upper rail with no headroom, against the mid-range's $v_0 = -6.0\text{ V}$ and $(0.875, 0.125, 0.125)$.
- **Diagnose:** the line-to-line voltages are identical under both offsets, and the phase current is still sinusoidal, so a Clarke, inverse-Park or dead-time fault is ruled out; the tell is that only the *common-mode* placement of the three duties moved, and the $27.7128\text{ V}$ inscribed-circle limit is reached with a leg already saturated.
- **Fix:** restore $v_0 = -\tfrac{1}{2}(\max(v_{abc}^*) + \min(v_{abc}^*))$, then prove it twice: $d_a - d_b$ must equal $(v_a^* - v_b^*)/V_{\text{bus}}$ exactly, and a command at the full $V_{\text{bus}}/\sqrt{3} = 27.7128\text{ V}$ peak must produce every duty inside $[0, 1]$.

- **📚 What to Learn & Resources to Solve This Exercise:**
  - **Required Foundations Modules (`00-foundations`):** [`00-foundations.T2.00d`](00-foundations.T2.00d.md) (*First-Order Transfer Functions & Bandwidth*) and [`00-foundations.T2.00e`](00-foundations.T2.00e.md) (*Coupled State-Space Equations*).
  - **Prerequisite Bridge Module:** [`03-sensors.T2.03a`](03-sensors.T2.03a.md) and Legacy **Step 2.4 (`03-sensors.T2.04`)**.
  - **Core Concepts to Review First:** Synchronous $d$-$q$ voltage equations and feedforward decoupling ($v_{d,\text{ff}} = -\omega_e L_q i_q, v_{q,\text{ff}} = \omega_e(L_d i_d + \lambda_{pm})$), pole-zero cancellation PI gains ($K_p = L\omega_{\text{bw}}, K_i = R\omega_{\text{bw}}$), and Min-Max zero-sequence SVPWM injection in `## 3. Formalization` and `## 4. Worked example` above.
  - **Study Links & Resources:** [TI Clarke, Park & SVPWM Theory (SPRU585 / BPRA073)](https://www.ti.com/lit/pdf/bpra073) and [Track 03 Tier 3 (`03-sensors-and-actuators/README.md`)](../03-sensors-and-actuators/README.md#tier-3-advanced--production) (**25 kHz PMSM FOC**).

## 6. Simulation path
Open **25 kHz PMSM FOC — Decoupled d-q, SVPWM Saddle Wave & Anticogging** in the MechaLab Workbench (`npm run dev`), or run the Worked Example Python script above to compare coupled vs. decoupled step responses and SPWM vs. SVPWM duty waveforms (see [`03-sensors-and-actuators/README.md` §3.1–3.2](../03-sensors-and-actuators/README.md#tier-3-advanced--production)).

No hardware required for this module (`hardware_required: false`). In Step 3.4 (`03-sensors.T3.04`) and Step 3.5 (`04-embedded.T3.05`), these exact decoupling and Min-Max SVPWM equations execute in $< 3.2\ \mu\text{s}$ inside the `STM32G474` $40\text{ kHz}$ `ADC_DMA_TC` ISR:
```text
[i_d, i_q, omega_e] ---> [PI_dq + Cross-Coupling Decoupling] ---> [Inverse Park] ---> [Min-Max SVPWM] ---> [TIM1 CCR1..3]
```
Pass/fail verification in simulation: `vd_ff == -3.60 V`, `vq_ff == 12.0 V`, `da - db == (va - vb) / V_bus`, and `a1_hat == 0.012 rad`.


```mermaid
flowchart LR
    A["03-sensors.T3.03a: dq_inductive_cross_coupling_feedforward"] --> B["svpwm_zero_sequence_hexagonal_limit"]
    B --> C["encoder_spatial_harmonic_error_fit"]
    C --> D["Verified Simulation & Checkpoint Pass"]
```

## 7. Checkpoint
Pass criteria: score $\ge 80\%$ ($4/4$) on the Skip test or score $\ge 80\%$ ($7/8$) on the Ladder Gate test below to unlock Step 3.4 (`03-sensors.T3.04`).

### Skip test
<!-- skip-test:start -->
1. `[Recall] [Concept: dq_inductive_cross_coupling_feedforward]` A PMSM with $L_q = 150\ \mu\text{H}$ ($1.5 \times 10^{-4}\text{ H}$) operates at electrical speed $\omega_e = 2000.0\text{ rad/s}$ and quadrature current $i_q = 15.0\text{ A}$. Compute the $d$-axis inductive cross-coupling feedforward term $v_{d,\text{ff}} = -\omega_e L_q i_q$ in volts ($\text{V}$, tolerance $\pm 10^{-9}\text{ V}$).
2. `[Apply] [Concept: svpwm_zero_sequence_hexagonal_limit]` Compute the maximum unclipped fundamental phase peak voltage $V_{\phi,\max} = V_{\text{bus}} / \sqrt{3}$ in volts ($\text{V}$, tolerance $\pm 0.01\text{ V}$) achievable with Min-Max SVPWM on a $V_{\text{bus}} = 48.0\text{ V}$ DC bus.
3. `[Transfer] [Concept: svpwm_zero_sequence_hexagonal_limit]` Given instantaneous phase voltage commands $v_a^* = 18.0\text{ V}$, $v_b^* = -6.0\text{ V}$, and $v_c^* = -12.0\text{ V}$, compute the Min-Max zero-sequence offset $v_0 = -\frac{1}{2}(\max(v_a^*, v_b^*, v_c^*) + \min(v_a^*, v_b^*, v_c^*))$ in volts ($\text{V}$, tolerance $\pm 10^{-9}\text{ V}$).
4. `[Spaced review -> 03-sensors.T2.03a — Concept: synchronous_dq_foc_current_loop] [Concept: encoder_spatial_harmonic_error_fit]` Why does adding the same zero-sequence voltage $v_0(t)$ to all three inverter leg commands $(v_a^* + v_0, v_b^* + v_0, v_c^* + v_0)$ produce **zero** zero-sequence phase current in a 3-phase star-connected motor with an isolated (floating) neutral point?
   - **A.** Because the motor windings only respond to line-to-line voltage differences (such as $(v_a^* + v_0) - (v_b^* + v_0) = v_a^* - v_b^*$), so the common-mode offset $v_0(t)$ shifts the neutral potential without driving any current ($i_a + i_b + i_c \equiv 0$).
   - **B.** Because $v_0(t)$ is always zero at every angle.
   - **C.** Because the MOSFETs block common-mode voltages.
   - **D.** Because the encoder cancels $v_0(t)$.

**Answer key:**
```python
import math

q1_vd_ff = -2000.0 * 150e-6 * 15.0
q2_vmax_svpwm = 48.0 / math.sqrt(3.0)
q3_v0 = -0.5 * (max(18.0, -6.0, -12.0) + min(18.0, -6.0, -12.0))
q4_choice = "A"

assert math.isclose(q1_vd_ff, -4.50, rel_tol=1e-9)
assert math.isclose(q2_vmax_svpwm, 27.7128129, abs_tol=1e-2)
assert math.isclose(q3_v0, -3.0, rel_tol=1e-9)
assert q4_choice == "A"
```
- **Pass mark:** $4/4$ ($80\%+$). If you missed Q1, study `## 3. Formalization` item 1; Q2 or Q3, study `## 3. Formalization` item 2; Q4, study `## 3. Formalization` items 2–3. On pass, proceed to `## 10. Next modules`.
<!-- skip-test:end -->

### Gate test
Covers the complete Track 03 Tier 3 bridge ladder (`03-sensors.T3.03a`) before Step 3.4 (`03-sensors.T3.04`):
1. `[Concept: dq_inductive_cross_coupling_feedforward]` A PMSM with flux linkage $\psi_m = 0.010\text{ Wb}$, $L_d = 100\ \mu\text{H}$, and $i_d = 0.0\text{ A}$ spins at electrical speed $\omega_e = 1800.0\text{ rad/s}$. Compute the $q$-axis back-EMF + cross-coupling feedforward voltage $v_{q,\text{ff}} = \omega_e(L_d i_d + \psi_m)$ in volts ($\text{V}$, tolerance $\pm 10^{-9}\text{ V}$).
2. `[Concept: dq_inductive_cross_coupling_feedforward]` What happens to $i_d$ and $i_q$ during a fast torque step at high rotor speed $\omega_e$ if the PI current controllers omit the $-\omega_e L_q i_q$ and $+\omega_e(L_d i_d + \psi_m)$ decoupling feedforward terms?
   - **A.** A step in $i_q$ injects a transient disturbance $-\omega_e L_q i_q$ into the $d$-axis (pulling $i_d$ away from zero) while the $q$-axis integral term must wind up slowly to fight back-EMF $\omega_e \psi_m$, degrading current loop bandwidth and phase margin.
   - **B.** The motor stops spinning immediately.
   - **C.** The encoder resolution doubles.
   - **D.** The bus voltage increases by $50\%$.
3. `[Concept: svpwm_zero_sequence_hexagonal_limit]` Compute the percentage increase in maximum linear phase voltage amplitude $100 \times \left(\frac{2}{\sqrt{3}} - 1\right)$ provided by SVPWM over sinusoidal PWM (`SPWM`, tolerance $\pm 0.01\%$).
4. `[Concept: svpwm_zero_sequence_hexagonal_limit]` For $V_{\text{bus}} = 24.0\text{ V}$ and phase voltage commands $v_a^ = 12.0\text{ V}$, $v_b^ = -6.0\text{ V}$, $v_c^ = -6.0\text{ V}$ (giving $v_0 = -3.0\text{ V}$), compute the phase-A SVPWM duty cycle $d_a = 0.5 + \frac{v_a^ + v_0}{V_{\text{bus}}}$ (tolerance $\pm 10^{-9}$).
5. `[Concept: svpwm_zero_sequence_hexagonal_limit]` Why does the Min-Max zero-sequence formula $v_0 = -\frac{1}{2}(\max(v_{abc}^*) + \min(v_{abc}^*))$ produce the exact same duty cycles as traditional sector-based $T_1, T_2, T_0$ Space-Vector PWM with far less CPU computation?
   - **A.** Because centering the maximum and minimum phase envelope inside $\pm V_{\text{bus}}/2$ allocates equal duration to the two zero vectors $V_0(000)$ and $V_7(111)$ without requiring `atan2` sector lookup or `sin()` table calls.
   - **B.** Because it sets all three duty cycles to $0.5$.
   - **C.** Because it only drives one phase at a time.
   - **D.** Because it disables the high-side MOSFETs.
6. `[Concept: encoder_spatial_harmonic_error_fit]` If a magnetic encoder disk is mounted with a radial eccentricity offset $e$ relative to the shaft rotation axis, which spatial harmonic order $h$ (in cycles per mechanical revolution, tolerance $\pm 10^{-9}$) dominates the angle error $\Delta\theta(\theta_m)$?
7. `[Concept: encoder_spatial_harmonic_error_fit]` Given harmonic calibration coefficients $a_1 = 0.008\text{ rad}$ and $b_1 = -0.006\text{ rad}$ for $\Delta\theta(\theta) = a_1 \cos\theta + b_1 \sin\theta$, compute the peak-to-zero amplitude $\sqrt{a_1^2 + b_1^2}$ of the 1st-harmonic error in radians ($\text{rad}$, tolerance $\pm 10^{-9}\text{ rad}$).
8. `[Concept: encoder_spatial_harmonic_error_fit]` Why must anticogging and encoder harmonic LUT calibration sweeps be recorded in **both** forward ($+\omega$) and reverse ($-\omega$) directions and averaged ($\frac{1}{2}(\tau_+(\theta) + \tau_-(\theta))$) before building the lookup table?
   - **A.** Because direction-dependent Coulomb friction $+\tau_c \operatorname{sign}(\omega)$ cancels out when averaging forward and reverse sweeps, isolating the true position-dependent magnetic cogging torque $\tau_{\text{cog}}(\theta)$.
   - **B.** To warm up the motor windings.
   - **C.** Because encoders only count in one direction.
   - **D.** To erase the flash memory.

**Gate answer key:**
```python
import math

g1_vq_ff = 1800.0 * (100e-6 * 0.0 + 0.010)
g2_choice = "A"
g3_boost_pct = 100.0 * (2.0 / math.sqrt(3.0) - 1.0)
g4_da = 0.5 + (12.0 + (-3.0)) / 24.0
g5_choice = "A"
g6_harmonic = 1
g7_amp_rad = math.sqrt(0.008**2 + (-0.006)**2)
g8_choice = "A"

assert math.isclose(g1_vq_ff, 18.0, rel_tol=1e-9)
assert g2_choice == "A"
assert math.isclose(g3_boost_pct, 15.4700538, abs_tol=1e-2)
assert math.isclose(g4_da, 0.875, rel_tol=1e-9)
assert g5_choice == "A"
assert g6_harmonic == 1
assert math.isclose(g7_amp_rad, 0.010, rel_tol=1e-9)
assert g8_choice == "A"
```
- **Pass mark:** $7/8$ ($80\%+$). Remediation: Q1–Q2 $\to$ `## 3. Formalization` item 1; Q3–Q5 $\to$ `## 3. Formalization` item 2; Q6–Q8 $\to$ `## 3. Formalization` item 3.

## 8. Common mistakes
| Symptom | Root cause | 2-minute fix |
| :--- | :--- | :--- |
| Adding $d$-$q$ decoupling feedforward causes immediate current runaway at medium speed | Used mechanical speed $\omega_m$ instead of electrical speed $\omega_e = p \omega_m$, or swapped the signs ($+\omega_e L_q i_q$ on $d$-axis instead of $-\omega_e L_q i_q$). | Verify $\omega_e = p \omega_m$ and double-check that $v_{d,\text{ff}} = -\omega_e L_q i_q$ and $v_{q,\text{ff}} = +\omega_e(L_d i_d + \psi_m)$. |
| SVPWM duty cycles saturate harshly when $\sqrt{v_\alpha^2 + v_\beta^2} > V_{\text{bus}}/\sqrt{3}$, distorting phase current into square waves | Clamped $d_a, d_b, d_c$ independently instead of scaling the 2D vector $(v_\alpha^*, v_\beta^*)$ radially onto the $V_{\text{bus}}/\sqrt{3}$ circle. | Apply circular vector saturation: if $V_{\text{mag}} = \sqrt{v_d^{*2} + v_q^{*2}} > V_{\text{bus}}/\sqrt{3}$, scale both $(v_d^*, v_q^*)$ by $\frac{V_{\text{bus}}/\sqrt{3}}{V_{\text{mag}}}$ before Inverse Park. |
| Anticogging LUT increases vibration instead of canceling cogging torque | Indexed the LUT with electrical angle $\theta_e$ instead of mechanical angle $\theta_m \in [0, 2\pi)$, or applied $+i_{q,\text{cog}}$ with the wrong sign. | Index the LUT by mechanical rotor angle $\theta_m$ and verify that averaging forward and reverse slow sweeps removes Coulomb friction offset. |

## 9. Resources
- **instaspin / SimpleFOC & Ben Katz — *High-Bandwidth FOC & Anticogging Control for Quasi-Direct-Drive Actuators* (`resources/textbooks-and-papers.md`):** Synchronous $d$-$q$ decoupling, Min-Max SVPWM, and bidirectional cogging calibration `[VERIFIED 2026-10-15]`.
- **Track 03 (`03-sensors-and-actuators/README.md`):** Directly continues into Step 3.4 (`03-sensors.T3.04`) `[VERIFIED 2026-10-15]`.

## 10. Next modules
- Proceed to legacy **Step 3.4 (`03-sensors.T3.04`)** in [`03-sensors-and-actuators/README.md`](../03-sensors-and-actuators/README.md#tier-3-advanced--production).
