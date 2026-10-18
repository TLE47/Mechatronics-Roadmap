---
id: 05-control.T3.05a
title: "Joseph-Form Covariance Update, Suboptimal Kalman Gains & NEES Consistency"
track: "05"
tier: 3
prereqs:
  - 00-foundations.T3.00a
  - 05-control.T2.05a
new_concepts:
  - joseph_stabilized_covariance_update
uses:
est_hours: 2.0
hardware_required: false
safety_level: none
resources_verified: true
difficulty:
  math: 4
  coding: 2
  tools: 1
  hardware_risk: low
  simulation: full
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

### Use & Understand
The covariance you publish is a claim about how wrong you are, and these two tools are how the claim is kept honest:
- **Joseph form** is what you write whenever the posterior is computed in single precision, or with a gain that is not the optimal one - a frozen gain, a gain borrowed from a different sensor set, a gain a scheduler handed you from two frames ago. The naive $(I - KH)P^-$ subtracts and can return a negative variance; the Joseph form is a sum of two squares and cannot.
- **NEES** is what you compute while tuning $Q$ and $R$, or when a filter starts rejecting good measurements: it asks whether the error is the size the covariance said it would be. For $n$ states, a consistent filter has expectation exactly $n$.

Run the module's own numbers: with $P^- = 4.0$, $H = 1.0$, $R = 1.0$ the gain is $K = 0.8$ and the posterior is $0.80$ in both forms; at the corrupted gain $K = 1.5$ the naive form gives $-2.0$ while the Joseph form gives $3.25$; an error of $0.20$ against a claimed variance of $0.04$ scores a NEES of $1.0$, which for one state is exactly what consistency predicts.

The checks: $P^+ \ge 0$ and symmetric, the two forms agreeing **at the optimal gain** (a disagreement there is a sign or scaling bug, not a stabilisation), and a NEES near $n$ over many runs - far above $n$ means the claimed covariance is too small, far below means it is too pessimistic and the filter is ignoring the sensor.

### Derive & Extend
1. **The Joseph form is the covariance of the error, written out.** Suppose the update has the form $\hat{x}^+ = \hat{x}^- + K\nu$ with innovation $\nu = z - H\hat{x}^-$. The error then propagates as $e^+ = (I - KH)e^- - Kv$, where $v$ is the measurement noise. With $e^-$ independent of $v$, $\mathbb{E}[e^-v^\top] = 0$, and $\mathbb{E}[vv^\top] = R$:

$$
P^+ = \mathbb{E}[e^+ (e^+)^\top] = (I - KH)\,P^-\,(I - KH)^\top + K R K^\top
$$

   Every term is a quadratic form in a matrix times its own transpose, so $P^+$ is symmetric and positive semi-definite for **any** $K$ - including a $K$ that no one derived.
2. **At the optimal gain it is the subtraction.** Expand the first term and collect the gain-dependent pieces:

$$
P^+ = P^- - KHP^- - P^-H^\top K^\top + K\left(H P^- H^\top + R\right)K^\top
$$

   With $K = P^-H^\top S^{-1}$ and $S = HP^-H^\top + R$, the last term is $P^-H^\top S^{-1} S S^{-1} H P^- = K H P^-$, so it cancels the second term and leaves $P^+ = P^- - P^-H^\top K^\top = (I - KH)P^-$. At $P^- = 4.0$, $R = 1.0$, $H = 1.0$ and $K = 0.8$ that is $(1 - 0.8) \times 4.0 = 0.80$, the same number the Joseph line gives.
3. **NEES is a chi-square, which is why its expectation is $n$.** If the filter is consistent then $e \sim \mathcal{N}(0, P)$ with the same $P$ it publishes. Whiten by the symmetric square root, $z = P^{-1/2}e$, so $z \sim \mathcal{N}(0, I)$ and

$$
\text{NEES} = \sum_{i=1}^{n} z_i^2 \;\sim\; \chi^2_n, \qquad \mathbb{E}[\text{NEES}] = n, \qquad \operatorname{Var}[\text{NEES}] = 2n
$$

   For one state the 95 per cent band is $[0.00098, 5.02]$, which is why the exercise's single score of $1.0$ is unremarkable and a single score of $4.0$ is not evidence on its own: one draw from a $\chi^2_1$ lands above $4$ about five per cent of the time. Consistency is judged over a run, not over a sample.
4. **Extend.** Both derivations assumed the gain is independent of the current innovation. A filter that recomputes $K$ from the same $z$ it is about to use - or one whose $R$ has off-diagonal terms - breaks that assumption: the cross term $\mathbb{E}[e^-v^\top]$ no longer vanishes, and the Joseph form still returns a positive matrix but no longer the error's true covariance. Derive the cross term for a gain that is one frame stale, $K_k = K_{k-1}$, and say what the published covariance would need to be for NEES to keep expectation $n$.

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

### Starter code
```python
# --- Exercise scaffold: fill in each TODO, then check against the numbers in the full solution ---
import math


def optimal_gain(p_minus, h, r):
    """K = P^- H / (H P^- H + R) for one scalar measurement."""
    # TODO 1: the denominator carries R as well as the prior term
    ...


def joseph_variance(p_minus, h, r, k):
    """P^+ = (1 - K H) P^- (1 - K H) + K R K: a sum of squares, never a subtraction."""
    # TODO 2: square the (1 - k * h) factor and add k^2 * r
    ...


def nees_diagonal(error, variances):
    """NEES = sum(e_i^2 / v_i) for a diagonal covariance."""
    # TODO 3: divide each squared error by its own variance - not the other way round
    ...


print("scaffold ready: 3 TODOs to fill, then compare against the numbers in the full solution")
```

**Expected numbers (the answer):** $K = 0.50$ at $P^- = 2.0$, $R = 2.0$ gives $P^+ = 1.0$; the corrupted gain $K = 1.20$ on $P^- = 10.0$, $R = 1.0$ gives $-2.0$ naively and $1.84$ in Joseph form; the NEES of $0.20$ against $0.04$ is $1.0$.

### Hint ladder
1. **The gain at $P^- = 2.0$, $R = 2.0$.** $K = HP^-/(HP^-H + R) = 2.0/4.0 = 0.50$, i.e. the sensor and the prior are equally trusted.
2. **The two terms of the Joseph form.** $(1 - KH) = 0.50$, so the prior term is $0.25 \times 2.0 = 0.50$ and the noise term is $0.25 \times 2.0 = 0.50$; they sum to $1.0$, which is also what the naive $(1 - 0.5)\times 2.0$ gives - agreement is a property of the *optimal* gain only.
3. **Why the corrupted case cannot go negative.** At $K = 1.20$ the factor is $-0.20$; squared it is $+0.04$, so $0.04 \times 10.0 + 1.44 \times 1.0 = 1.84$ while the unsigned $(1 - KH)P^-$ reads $-2.0$. A negative Joseph result means a sign was kept inside the square.
4. **NEES as a misfit score.** $0.20^2 / 0.04 = 1.0$ is a perfectly calibrated filter; the same error against a claimed $0.01$ reports $4$, which is an overconfident covariance flagging itself.
5. **What the suite refuses.** `optimal_gain` and `joseph_variance` refuse a negative prior variance, a zero Jacobian and zero measurement noise - a negative variance is not a covariance, and the other two make the update meaningless - and `nees_diagonal` refuses a zero claimed variance and any length mismatch between the error list and the covariance list, which is unanswerable rather than a shorter score. All raise `ValueError`.

### Full Solution
```python
import math


def optimal_gain(p_minus, h, r):
    """The scalar Kalman gain K = P^- H / (H P^- H + R)."""
    if p_minus < 0.0:
        raise ValueError("a variance cannot be negative")
    if h <= 0.0:
        raise ValueError("a zero measurement Jacobian carries no information")
    if r <= 0.0:
        raise ValueError("measurement noise variance is strictly positive")
    return p_minus * h / (h * p_minus * h + r)


def joseph_variance(p_minus, h, r, k):
    """P^+ = (1 - K H) P^- (1 - K H) + K R K: a sum of two squares, so never negative."""
    if p_minus < 0.0:
        raise ValueError("a variance cannot be negative")
    if r <= 0.0:
        raise ValueError("measurement noise variance is strictly positive")
    a = 1.0 - k * h
    return a * a * p_minus + k * k * r


def nees_diagonal(error, variances):
    """NEES = e^T P^-1 e for a diagonal covariance: the sum of each error over its own variance."""
    e = [float(item) for item in error]
    v = [float(item) for item in variances]
    if not e or len(e) != len(v):
        raise ValueError("the error and its variances must be non-empty and the same length")
    for item in v:
        if item <= 0.0:
            raise ValueError("a variance must be strictly positive to be inverted")
    return sum(item * item / var for item, var in zip(e, v))

k = optimal_gain(2.0, 1.0, 2.0)
p_plus = joseph_variance(2.0, 1.0, 2.0, k)
naive_same = (1.0 - k) * 2.0

k_bad = 1.20
naive_bad = (1.0 - k_bad) * 10.0
joseph_bad = joseph_variance(10.0, 1.0, 1.0, k_bad)

nees = nees_diagonal([0.20], [0.04])
overconfident = nees_diagonal([0.20], [0.01])

assert math.isclose(k, 0.50, rel_tol=1e-12)
assert math.isclose(p_plus, 1.0, abs_tol=1e-9)
assert math.isclose(p_plus, naive_same, rel_tol=1e-12)
assert math.isclose(naive_bad, -2.0, rel_tol=1e-12)
assert math.isclose(joseph_bad, 1.84, abs_tol=1e-9)
assert math.isclose(nees, 1.0, rel_tol=1e-12)
assert math.isclose(overconfident, 4.0, rel_tol=1e-12)
print(f"K={k:.5f}, P_plus={p_plus:.5f}, naive_bad={naive_bad:.5f}, "
      f"joseph_bad={joseph_bad:.5f}, nees={nees:.5f}, overconfident={overconfident:.5f}")

```

Printed: `K=0.50000, P_plus=1.00000, naive_bad=-2.00000, joseph_bad=1.84000, nees=1.00000, overconfident=4.00000`

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
Pass criteria: run the worked example and the exercise asserts clean, or score $\ge 80\%$ ($4/5$) on the Skip test below and $\ge 80\%$ ($5/6$) on the ladder's Gate test.

### Skip test
<!-- skip-test:start -->
1. `[Recall] [Concept: joseph_stabilized_covariance_update]` For a 1D Kalman update with $P^- = 2.0$, $H = 1.0$, $R = 2.0$ and $K = 0.50$, compute the Joseph posterior $P^+ = (1 - KH)^2 P^- + K^2 R$ (tolerance $\pm 10^{-9}$).
2. `[Apply] [Concept: joseph_stabilized_covariance_update]` At the optimal gain, does the Joseph form equal the naive $(1 - KH)P^-$? Answer `True` or `False`.
3. `[Transfer] [Concept: joseph_stabilized_covariance_update]` With $P^- = 10.0$, $H = 1.0$, $R = 1.0$ and a buggy gain $K = 1.20$, compute the **Joseph** posterior (tolerance $\pm 10^{-9}$) - the naive form is $-2.0$ here.
4. `[Concept: joseph_stabilized_covariance_update]` Why is the Joseph form mandatory in a 32-bit embedded navigation filter?
   - **A.** Because it is a sum of two positive semi-definite quadratic forms, so symmetry and non-negativity survive roundoff and suboptimal gains.
   - **B.** Because it does not use the measurement noise $R$.
   - **C.** Because it sets $P^+ = 0$ after one step.
   - **D.** Because it avoids the Kalman gain entirely.
5. `[Spaced review -> 05-control.T2.05a — Concept: luenberger_observer_and_brysons_lqr_weights]` A state-feedback law is $u = -Kx$ with $K = [2.0,\; 1.0]$ and $x = [0.50,\; 1.0]^\top$. Compute $u$ (tolerance $\pm 10^{-9}$).

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
q5_review = -(2.0 * 0.50 + 1.0 * 1.0)
assert math.isclose(q5_review, -2.0, rel_tol=1e-9, abs_tol=1e-09)
```
- **Pass mark:** $4/5$ ($80\%+$). If you missed Q1 or Q3, study `## 3. Formalization` item 2; if you missed Q2, study `## 4. Worked example`; if you missed Q4, study `## 2. Intuition first`. If you missed  Q5, review `05-control.T2.05a`. On pass, proceed to `05-control.T3.05b`.
<!-- skip-test:end -->

### Gate test
Covers the complete Track 05 Tier 3 ladder ([`05-control.T3.05a`](05-control.T3.05a.md) $\to$ [`05-control.T3.05b`](05-control.T3.05b.md) $\to$ [`05-control.T3.05c`](05-control.T3.05c.md)) before Step 3.6 (`05-control.T3.06`):
1. `[Concept: joseph_stabilized_covariance_update]` A scalar update carries $P^- = 6.0$, $H = 1.0$, $R = 2.0$ and a buggy gain $K = 1.25$. Compute the Joseph posterior $(1 - KH)^2 P^- + K^2 R$ (tolerance $\pm 10^{-9}$).
2. `[Concept: joseph_stabilized_covariance_update]` Why can the Joseph posterior never go negative, even at a gain nobody tuned?
   - **A.** Because it is the sum of two squares, each non-negative whatever $K$ is, while the textbook $(1 - KH)P^-$ can change sign.
   - **B.** Because it replaces $R$ with zero.
   - **C.** Because it clamps the result at zero afterwards.
   - **D.** Because it only runs at the optimal gain.
3. `[Concept: tangent_space_eskf_error_injection]` A filter injects a $0.04$ rad correction, resets the error-state mean, then takes one measurement whose innovation is exactly zero. What angle has the frame turned in total (tolerance $\pm 10^{-12}$ rad)?
4. `[Concept: tangent_space_eskf_error_injection]` One count of an $8192$-count-per-revolution encoder is $2\pi/8192$ rad. Compute that tangent-space step (tolerance $\pm 10^{-12}$ rad).
5. `[Concept: control_barrier_forward_invariance_qp]` At $h = -0.03\,\text{rad}$, $\alpha = 6.0\,\text{s}^{-1}$, $u_{\text{nom}} = 0$ and $u \in [-2, +2]\,\text{rad/s}$, what command does the CBF-QP return (tolerance $\pm 10^{-9}\,\text{rad/s}$)?
6. `[Concept: control_barrier_forward_invariance_qp]` At $h = -0.40\,\text{rad}$, $\alpha = 6.0\,\text{s}^{-1}$ and $u \in [-2, +2]\,\text{rad/s}$, is the QP feasible? Answer `True` or `False`.

**Gate answer key:**
```python
import math

g1_p_joseph = ((1.0 - 1.25 * 1.0) ** 2) * 6.0 + (1.25 ** 2) * 2.0
g2_choice = "A"
g3_angle = 0.04
g4_count = 2.0 * math.pi / 8192.0
g5_u = min(max(0.0, -2.0), min(2.0, 6.0 * -0.03))
g6_feasible = (6.0 * -0.40) >= -2.0

assert math.isclose(g1_p_joseph, 3.5, rel_tol=1e-9)
assert g2_choice == "A"
assert math.isclose(g3_angle, 0.04, abs_tol=1e-12)
assert math.isclose(g4_count, 7.669903939428206e-04, rel_tol=1e-12)
assert math.isclose(g5_u, -0.18, rel_tol=1e-9)
assert g6_feasible is False
```
- **Pass mark:** $\ge 80\%$ ($5/6$ on the Gate test). Missed Q1–Q2: study `05-control.T3.05a`; Q3–Q4: `05-control.T3.05b`; Q5–Q6: `05-control.T3.05c`.

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
