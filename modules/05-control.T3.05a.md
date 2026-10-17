---
id: 05-control.T3.05a
title: "Joseph-Form Covariance Update, Suboptimal Kalman Gains & NEES Consistency"
track: "05"
tier: 3
prereqs:
  - 00-foundations.T3.01
  - 05-control.T2.06
new_concepts:
  - joseph_stabilized_covariance_update
uses:
  - discrete_infinite_horizon_lqr
  - augmented_kalman_disturbance_observer
est_hours: 2.0
hardware_required: false
safety_level: none
resources_verified: true
verification: ci-native
plant: tier1_arm_motor
---

## 1. Why it matters
A propagating covariance matrix decides how much a filter trusts its own model, and in 32-bit `float` the textbook update $P^+ = (I - KH)P^-$ can hand back a **negative variance** - a state no real sensor can produce. The Joseph form rewrites the same algebra as a sum of two squares, so symmetry and positive semi-definiteness survive roundoff and even a wrong gain. This is the first of the three Track 05 Tier 3 bridges: it fixes the covariance, Step `05-control.T3.05b` fixes the attitude injection, and `05-control.T3.05c` builds the safety filter. Already know this? Take the Skip test in section 7 first.

## 2. Intuition first
A Kalman update is a weighted average: the prior says "I think $4.0$", the sensor says "I measured $1.0$ with noise $1.0$", and the gain decides how far to move. Subtract weighted numbers carelessly - especially with a gain someone else chose - and the "uncertainty" can come out below zero, which is like reporting a negative width for a ruler. The Joseph form avoids the subtraction entirely: it writes the answer as "the part of the prior you kept, squared" plus "the part of the measurement you used, squared". Squares cannot be negative, so the answer cannot either, no matter how bad the gain is.

## 3. Formalization
1. **Optimal Scalar Gain:** For prior variance $P^-$ (unit$^2$), measurement Jacobian $H$ (unitless for a direct measurement), and measurement noise variance $R$ (unit$^2$), the minimum-variance gain is:

$$
K = \frac{P^- H}{H P^- H + R}
$$

   With $P^- = 4.0$, $H = 1.0$, $R = 1.0$ this gives $K = 4.0/5.0 = 0.8$; more noise raises the denominator and shrinks the gain.
2. **Joseph-Form Posterior:** The same update as a sum of two squares,

$$
P^+ = (1 - KH)^2 P^- + K^2 R
$$

   which equals the naive $(1 - KH)P^-$ **only** at the optimal gain. At $K = 1.5$ the naive form returns $(1 - 1.5)(4.0) = -2.0$ while the Joseph form returns $(-0.5)^2(4.0) + (1.5)^2(1.0) = 3.25$ - positive, because every term is a square.
3. **NEES Consistency:** For an error vector $e$ and a diagonal covariance $\operatorname{diag}(v_1, \dots, v_n)$, the normalized estimation error squared is

$$
\text{NEES} = \sum_i \frac{e_i^2}{v_i}
$$

   With $e = [0.20, 0, 0]^\top$ and variances $0.04$ it is $0.04/0.04 = 1.0$; dividing by a *smaller* claimed variance reports a larger NEES, which is how an overconfident filter flags itself.

## 4. Worked example
**Predict first (before you run it):** commit to four numbers before the block runs: (1) the gain $K$ for $P^- = 4.0$, $H = 1.0$, $R = 1.0$ - nearer $0.2$, $0.8$ or $2.0$; (2) the Joseph posterior at that gain, which must equal the naive one; (3) what the naive update returns at the corrupted gain $K = 1.5$, and whether the Joseph form can share its sign; (4) the NEES of an error of $0.20$ against a claimed variance of $0.04$. Two tells that a wrong answer is a mistake rather than a surprise: a negative posterior from the *Joseph* line means the squared term was written as a subtraction, and a NEES of $0.0008$ means the variance was multiplied by the squared error instead of dividing by it.

Run the update twice - once at the optimal gain, once at a gain that a buggy integrator might hand you - and check the Joseph form stays positive through both.

```python
import math

import mechalab_plant as plant

p_minus, h, r = 4.0, 1.0, 1.0
k = p_minus * h / (h * p_minus * h + r)
p_plus = (1.0 - k * h) ** 2 * p_minus + k * k * r
naive_at_optimal = (1.0 - k * h) * p_minus

k_bad = 1.5
naive_bad = (1.0 - k_bad * h) * p_minus
joseph_bad = (1.0 - k_bad * h) ** 2 * p_minus + k_bad ** 2 * r

nees = 0.20 ** 2 / 0.04

# The same update on the plant's own shoulder inertia against a 1e-6 rad^2 encoder:
arm_gain = plant.I1 * 1.0 / (plant.I1 * 1.0 + 1e-6)
arm_posterior = (1.0 - arm_gain) ** 2 * plant.I1 + arm_gain ** 2 * 1e-6

assert math.isclose(k, 0.8, rel_tol=1e-12)
assert math.isclose(p_plus, 0.80, rel_tol=1e-12)
assert math.isclose(p_plus, naive_at_optimal, rel_tol=1e-12)
assert math.isclose(naive_bad, -2.0, rel_tol=1e-12)
assert math.isclose(joseph_bad, 3.25, rel_tol=1e-12)
assert math.isclose(nees, 1.0, rel_tol=1e-12)
assert math.isclose(arm_posterior, 9.998750156230471e-07, rel_tol=1e-12)
print(f"K={k:.5f}, P_plus={p_plus:.5f}, naive_bad={naive_bad:.5f}, "
      f"joseph_bad={joseph_bad:.5f}, nees={nees:.5f}")
```
Expected output:
```text
K=0.80000, P_plus=0.80000, naive_bad=-2.00000, joseph_bad=3.25000, nees=1.00000
```

## 5. Exercise
A scalar filter carries a prior variance $P^- = 2.0$ against a direct measurement with $R = 2.0$ and an integrator-chosen gain $K = 0.50$. Compute the Joseph posterior, verify it equals the naive $(1 - KH)P^-$ at this gain, and then repeat the update with $K = 1.20$ on $P^- = 10.0$, $R = 1.0$: the naive form returns $-2.0$ while the Joseph form must stay at $1.84$ ($\pm 10^{-9}$).
- **If your result differs:** At the optimal gain the two forms agree to roundoff, so a mismatch there means a missing $K^2R$ term; a negative result at $K = 1.20$ means $(1 - KH)$ was not squared.

### Graded package - covariance, gain and consistency on the clock
[`exercises/05-control.T3.05a/`](../exercises/05-control.T3.05a/) turns this section into a test. `starter.py` holds three holes: `optimal_gain` ($P^-H/(HP^-H+R)$), `joseph_variance` (the squared form) and `nees_diagonal` ($e^\top P^{-1} e$). Edit it, then run the tests the way CI does:

```bash
EXERCISE_TARGET=exercises/05-control.T3.05a/starter.py \
  python3 -m unittest discover -s exercises/05-control.T3.05a -p 'test_*.py'
```

**17 tests.** The Joseph update is checked at the worked $0.80$, the Skip test's $1.0$ and the ladder gate's $1.84$, and - the point of the form - at a gain of $1.5$, where the naive $(1-KH)P^-$ is $-2.0$ and the Joseph form is $3.25$. The gain is checked against a noisier sensor (a larger $R$ must shrink $K$), and both functions refuse a negative prior, a zero Jacobian and zero noise. The NEES suite checks $1.0$ at the gate case, $4$ for an error doubled, and $4.0$ for the same $0.20$ error against a filter that claims $0.01$. The transfer suite runs **the plant's own shoulder**: the Joseph form reproduces the Riccati solution $PR/(P+R)$ at $\text{plant.I1}$ and a $1\text{e-}6$ sensor ($9.99875\times10^{-7}$), and a gain $20\%$ over optimal drives the naive update to $-5.3333\times10^{-4}$ while the Joseph form stays at $1.1733\times10^{-3}$. Five planted faults - `joseph_uses_naive_subtraction`, `optimal_gain_forgets_r`, `joseph_ignores_noise`, `joseph_forgets_prior`, `nees_uses_difference` - each fail the test named for them.

- **📚 What to Learn & Resources to Solve This Exercise:**
  - **Required Foundations Modules (`00-foundations`):** [`00-foundations.T2.00e`](00-foundations.T2.00e.md)-[`00-foundations.T2.00f`](00-foundations.T2.00f.md) (*State-Space & Covariance*) and Legacy **Step 3.1 (`00-foundations.T3.01`)** (*Van Loan ZOH & Lie Groups*).
  - **Core Concepts to Review First:** the optimal scalar gain, the Joseph-form posterior and NEES in `## 3. Formalization` (Items 1-3) and the bad-gain comparison in `## 4. Worked example` above.
  - **Study Links & Resources:** [Joan Solà *Quaternion Kinematics for the ESKF* (`arXiv:1711.02508`)](https://arxiv.org/abs/1711.02508) and [Track 05 Tier 3 (`05-control-and-estimation/README.md#tier-3-advanced--production`)](../05-control-and-estimation/README.md#tier-3-advanced--production) (**Tab 8**).

### Break it on purpose
Inject the `## 8. Common mistakes` row about the naive subtraction, keeping the worked example's $P^- = 4.0$, $H = 1.0$, $R = 1.0$ and $K = 1.5$:
- **Inject:** write `p_plus = (1.0 - k * h) * p_minus` instead of the squared Joseph form, so the posterior is a subtraction with no $K^2R$ term.
- **Symptom:** the posterior reads $-2.00000$ instead of $3.25000$ - a negative variance - while the gain, the prior and the NEES of the same run are all unchanged, so the filter reports an impossible state and still looks healthy everywhere else.
- **Diagnose:** the sign is the signature. At the *optimal* gain both forms agree exactly, so the two only separate once $K$ leaves $K^\ast$: a result that is negative only at the corrupted gain, and correct at $0.8$, points at the update algebra rather than at the gain or the prior. Dropping just $K^2R$ would give $1.0$, still positive, which rules that variant out.
- **Fix:** restore `(1.0 - k * h) ** 2 * p_minus + k * k * r`. The same run then reads $3.25000$, and the $20\%$-over-optimal plant case lands at $1.1733\times10^{-3}$ instead of $-5.3333\times10^{-4}$.

## 6. Simulation path
Open **Tab 8 (6-DOF Manifold Attitude ESKF on $SO(3)$)** in the MechaLab Workbench (`npm run dev`) and watch the covariance diagonal stay positive across a long run, or run `05-control-and-estimation/lab/lab05_eskf_mpc_and_cbf.py` for the full filter with both updates.

The graded package is also a workbench entry: **Modules -> `EX.05-control.T3.05a`**, where `selfcheck.py` is appended below the starter and **Verify** compares it against the instructor copy of the same self-check. `scripts/e2e_pages_bundle.mjs` drives it on the built bundle, so the browser path is tested, not assumed.

No hardware required for this module (`hardware_required: false`). In Step 3.6 (`05-control.T3.06`) this update runs inside the $1\text{ kHz}$ attitude ESKF:
```text
[Prior P^-] ---> [K = P H / (H P H + R)] ---> [P^+ = (1-KH)^2 P^- + K^2 R] ---> [NEES check]
```
Pass/fail verification in simulation: `P_plus == 0.80`, `joseph_bad == 3.25` where `naive_bad == -2.0`, and `NEES == 1.0`.

### Safety notes
> **No hardware required (`safety_level: none`):** every number here is computed from the plant's model in the browser; nothing is energised.

```mermaid
flowchart LR
    A["05-control.T3.05a: joseph_stabilized_covariance_update"] --> B["Suboptimal gain stays positive"]
    B --> C["NEES consistency"]
    C --> D["Verified Simulation & Checkpoint Pass"]
```

## 7. Checkpoint
Pass criteria: run the worked example and the exercise asserts clean, or score $\ge 80\%$ ($3/4$) on the Skip test below.

### Skip test
1. `[Recall] [Concept: joseph_stabilized_covariance_update]` For a 1D Kalman update with $P^- = 2.0$, $H = 1.0$, $R = 2.0$ and $K = 0.50$, compute the Joseph posterior $P^+ = (1 - KH)^2 P^- + K^2 R$ (tolerance $\pm 10^{-9}$).
2. `[Apply] [Concept: joseph_stabilized_covariance_update]` At the optimal gain, does the Joseph form equal the naive $(1 - KH)P^-$? Answer `True` or `False`.
3. `[Transfer] [Concept: joseph_stabilized_covariance_update]` With $P^- = 10.0$, $H = 1.0$, $R = 1.0$ and a buggy gain $K = 1.20$, compute the **Joseph** posterior (tolerance $\pm 10^{-9}$) - the naive form is $-2.0$ here.
4. `[Concept: joseph_stabilized_covariance_update]` Why is the Joseph form mandatory in a 32-bit embedded navigation filter?
   - **A.** Because it is a sum of two positive semi-definite quadratic forms, so symmetry and non-negativity survive roundoff and suboptimal gains.
   - **B.** Because it does not use the measurement noise $R$.
   - **C.** Because it sets $P^+ = 0$ after one step.
   - **D.** Because it avoids the Kalman gain entirely.

**Answer key:**
```python
import math

q1_p_plus = ((1.0 - 0.50 * 1.0) ** 2) * 2.0 + (0.50 ** 2) * 2.0
q2_equal = math.isclose(q1_p_plus, (1.0 - 0.50) * 2.0, rel_tol=1e-9)
q3_p_joseph = ((1.0 - 1.20 * 1.0) ** 2) * 10.0 + (1.20 ** 2) * 1.0
q4_choice = "A"

assert math.isclose(q1_p_plus, 1.0, rel_tol=1e-9)
assert q2_equal is True
assert math.isclose(q3_p_joseph, 1.84, rel_tol=1e-9)
assert q4_choice == "A"
```
- **Pass mark:** $3/4$ ($80\%+$). If you missed Q1 or Q3, study `## 3. Formalization` item 2; if you missed Q2, study `## 4. Worked example`; if you missed Q4, study `## 2. Intuition first`. On pass, proceed to `05-control.T3.05b`.

The ladder's Gate test lives at the end of the ladder, in [`05-control.T3.05c`](05-control.T3.05c.md), and examines all three bridges together; this module's own checkpoint is the Skip test above and the graded package.

## 8. Common mistakes
| Symptom | Root cause | 2-minute fix |
| :--- | :--- | :--- |
| Covariance develops asymmetric off-diagonal entries or a negative diagonal entry after thousands of ticks | Used the textbook $(I - KH)P^-$ subtraction in 32-bit floating point. | Use the Joseph form $(I - KH)P^-(I - KH)^\top + KRK^\top$ and symmetrize: $P \leftarrow \frac{1}{2}(P + P^\top)$. |
| Posterior variance is negative after a suboptimal gain | Squared the prior term but kept the subtraction sign, or dropped $K^2R$ entirely. | Write both terms as squares: `(1 - k*h)**2 * p_minus + k*k*r`. |
| NEES is far below 1 on a filter that looks accurate | Divided the variance by the squared error instead of the error by the variance. | `sum(e*e/v for e, v in zip(error, variances))`. |

## 9. Resources
- **Joan Solà - [*Quaternion Kinematics for the Error-State Kalman Filter* (`arXiv:1711.02508`)](https://arxiv.org/abs/1711.02508):** the reference for ESKF covariance propagation and consistency `[VERIFIED 2026-10-15]`.
- **Brunton & Kutz - [*Data-Driven Science and Engineering* (`databookuw.com`)](https://databookuw.com/) ([`resources/textbooks-and-papers.md`](../resources/textbooks-and-papers.md)):** Kalman filtering as a least-squares update `[VERIFIED 2026-10-15]`.
- **Track 05 Tier 3 ([`05-control-and-estimation/README.md`](../05-control-and-estimation/README.md#tier-3-advanced--production)):** the module sequence this bridge feeds `[VERIFIED 2026-10-15]`.

## 10. Next modules
- Proceed to [`05-control.T3.05b`](05-control.T3.05b.md) (Tangent-Space Error Injection on $SO(3)$ & the ESKF Reset).
- Then [`05-control.T3.05c`](05-control.T3.05c.md) (*Control Barrier Function QP Safety Filter*) and Step 3.6 (`05-control.T3.06`).
