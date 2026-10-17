#!/usr/bin/env python3
"""Model levels for the shared arm: what runs, what linearises, and what is not built yet.

`mechalab_plant.py` is **Level A** - the joint-space model every lesson's numbers come from. It is
deliberately simple: two joints, constant reflected inertias, gravity, damping, a torque clamp. A
control or estimation lesson needs more than one level, and the mistake this file exists to prevent
is silently replacing A with a richer model and calling the old numbers "wrong".

So each level is named, its terms are listed, and its status is explicit:

| Level | What it is | Status |
| :--- | :--- | :--- |
| A | joint-space arm, constant per-joint inertia, gravity + damping + torque clamp | implemented (`mechalab_plant`) |
| B | local linear model of A about an operating point, with three discretisations | implemented here |
| C | coupled arm dynamics (configuration-dependent mass matrix, Coriolis) | specified only |
| D | actuator/sensor/timing effects (current loop, quantisation, noise, delay) | primitives only |

Nothing here is the model of record: Level B is a *derivative* of A, and `compare_to_plant` proves
it at the operating point instead of asking you to trust the algebra. Level C and D are documented
in `docs/MODEL_LEVELS.md`; they are not implemented, and this module says so rather than shipping a
plausible-looking stand-in.

Stdlib only, Python 3.8+, so CI and a host interpreter run the same code. The browser embeds the
plant only; a lesson that needs Level B runs it natively (`verification: ci-native`).
"""

import math

import mechalab_plant as plant

LEVELS = {
    "A": {
        "name": "joint-space arm",
        "status": "implemented",
        "entry_point": "mechalab_plant.motor_dynamics / step_arm / simulate_arm",
        "state": "(q1, q2, dq1, dq2) - radians, radians/s",
        "input": "(tau1, tau2) - N*m, clamped to +/- plant.TAU_LIMIT",
        "includes": "constant reflected inertias I1, I2; gravity; viscous damping b1, b2; torque clamp",
        "omits": "configuration-dependent mass matrix, Coriolis/centrifugal terms, joint compliance, backlash",
        "provenance": "the Tier 1 capstone's stated values, one lesson per value (tier1_arm_motor.yaml)",
        "use_for": "every published run, the figure-8 capstone, and any lesson whose numbers are quoted",
    },
    "B": {
        "name": "local linear model of A",
        "status": "implemented",
        "entry_point": "linearize / discretize / simulate_linear / compare_to_plant",
        "state": "dx = (dq1, dq2, ddq1, ddq2) around an operating point - deviations, SI",
        "input": "du = (dtau1, dtau2) - N*m deviations",
        "includes": "gravity stiffness at the operating point, damping, inertia; Euler and ZOH discretisation",
        "omits": "large-angle validity: the model is first-order, so it is for small deviations and controller design",
        "provenance": "analytic Jacobian of A's own acceleration law; checked against finite differences and step_arm",
        "use_for": "LQR, pole placement, observer design, and the discretisation lessons",
    },
    "C": {
        "name": "coupled arm dynamics",
        "status": "specified only",
        "entry_point": "-",
        "state": "same as A",
        "input": "same as A",
        "includes": "a configuration-dependent mass matrix M(q), Coriolis/centrifugal C(q, qdot), and inertia coupling",
        "omits": "flexibility, friction nonlinearities",
        "provenance": "would be derived from link masses/inertias already in the YAML - not invented",
        "use_for": "nonlinear control and any lesson where coupling is the point; until then, lessons must not imply it",
    },
    "D": {
        "name": "actuator, sensor and timing",
        "status": "primitives only",
        "entry_point": "mechalab_plant.simulate_motor / quantize_angle / add_noise / simulate_uart_tx",
        "state": "motor current/speed/angle, encoder counts, queues",
        "input": "voltage, frame rate, noise scale",
        "includes": "DC-motor electrical/mechanical step, one-count encoder quantisation, seeded noise, UART drop model",
        "omits": "current loop, PWM/modulation, sensor delay, computation delay - none is wired into the arm loop",
        "provenance": "motor constants are required arguments (bench measurements), never defaults",
        "use_for": "the electrical, encoder and telemetry lessons; not for claims about the arm's closed-loop timing",
    },
}

DISCRETISATIONS = ("forward-euler", "semi-implicit", "zoh")


def level_info(level):
    """The dictionary for one level; raises KeyError for an unknown letter, on purpose."""
    return dict(LEVELS[level])


def _identity(n):
    return [[1.0 if i == j else 0.0 for j in range(n)] for i in range(n)]


def _matmul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(len(b))) for j in range(len(b[0]))] for i in range(len(a))]


def _matadd(a, b):
    return [[a[i][j] + b[i][j] for j in range(len(a[0]))] for i in range(len(a))]


def _scale(a, factor):
    return [[value * factor for value in row] for row in a]


def linearize(q1, q2, m1=plant.M1, m2=plant.M2, l1=plant.L1, lc1=plant.LC1, lc2=plant.LC2,
              g=plant.G, i1=plant.I1, i2=plant.I2, b1=plant.B1, b2=plant.B2):
    """Continuous A (4x4) and B (4x2) of Level A about (q1, q2), zero velocity.

    State order is (q1, q2, dq1, dq2); the input is joint torque. Gravity's slope is the only
    configuration-dependent term in Level A, so it is the only stiffness in A:

        d(tau_g2)/dq1 = d(tau_g2)/dq2 = -m2 g lc2 sin(q1 + q2)
        d(tau_g1)/dq1 = -(m1 lc1 + m2 l1) g sin(q1) + d(tau_g2)/dq1
    """
    s1, s12 = math.sin(q1), math.sin(q1 + q2)
    dg2 = -m2 * g * lc2 * s12
    dg1_q1 = -(m1 * lc1 + m2 * l1) * g * s1 + dg2
    dg1_q2 = dg2
    a = [
        [0.0, 0.0, 1.0, 0.0],
        [0.0, 0.0, 0.0, 1.0],
        [-dg1_q1 / i1, -dg1_q2 / i1, -b1 / i1, 0.0],
        [-dg2 / i2, -dg2 / i2, 0.0, -b2 / i2],
    ]
    b = [[0.0, 0.0], [0.0, 0.0], [1.0 / i1, 0.0], [0.0, 1.0 / i2]]
    return a, b


def discretize(a, b, dt, method="semi-implicit"):
    """(Ad, Bd) for one of three schemes, all with state [positions..., velocities...].

    * `forward-euler` - Ad = I + A dt, Bd = B dt. Simple, and it injects energy into oscillators.
    * `semi-implicit`  - velocity updated first, position uses the NEW velocity. This is what
      `step_arm` does, so it is the default; the resulting map is
      `Ad = [[I + dt^2 Avq, dt I + dt^2 Avv], [dt Avq, I + dt Avv]]`.
    * `zoh`            - the matrix exponential series, `Ad = exp(A dt)`, `Bd = sum (A dt)^k/(k+1)! dt B`.
    """
    n = len(a)
    half = n // 2
    if method not in DISCRETISATIONS:
        raise ValueError("method must be one of %s, not %r" % (list(DISCRETISATIONS), method))
    if method == "forward-euler":
        return _matadd(_identity(n), _scale(a, dt)), _scale(b, dt)
    if method == "semi-implicit":
        ad = _identity(n)
        for i in range(n):
            for j in range(n):
                ad[i][j] += a[i][j] * dt
        # The position rows use the new velocity: add one extra dt of the velocity rows' dynamics.
        for i in range(half):
            for j in range(n):
                ad[i][j] += a[half + i][j] * dt * dt
        bd = _scale(b, dt)
        for i in range(half):
            for j in range(len(b[0])):
                bd[i][j] = b[half + i][j] * dt * dt
        return ad, bd
    # zoh: exp(A dt) and its integral, both by the same series.
    m = _scale(a, dt)
    ad = _identity(n)
    term = _identity(n)
    bd = _scale(b, dt)
    for k in range(1, 25):
        term = _scale(_matmul(term, m), 1.0 / k)
        ad = _matadd(ad, term)
        bd = _matadd(bd, _scale(_matmul(term, b), dt / (k + 1)))
    return ad, bd


def simulate_linear(ad, bd, x0, u, steps):
    """Iterate the discrete linear model; returns the final state."""
    x = list(x0)
    for _ in range(steps):
        x = [sum(ad[i][j] * x[j] for j in range(len(x))) + sum(bd[i][j] * u[j] for j in range(len(u)))
             for i in range(len(x))]
    return x


def compare_to_plant(q1, q2, eps=1e-5, dt=plant.DT, steps=20, method="semi-implicit"):
    """Prove Level B against Level A: perturb about an equilibrium, compare the two.

    `(q1, q2)` must be an equilibrium, which needs the holding torque `plant.gravity_torque(q1, q2)`
    as the constant input - with zero torque the arm simply falls, and that bias is not part of A.
    Both start at `(q1 + eps, q2, 0, 0)` and the comparison is in deviations from the operating
    point. The gap is O(eps^2), so a large one means the Jacobian (or the discretisation) is wrong,
    not that the plant is nonlinear.
    """
    a, b = linearize(q1, q2)
    ad, bd = discretize(a, b, dt, method)
    holding = plant.gravity_torque(q1, q2)
    zero = (0.0, 0.0)
    state = (q1 + eps, q2, 0.0, 0.0)
    linear = [eps, 0.0, 0.0, 0.0]
    for _ in range(steps):
        state = plant.step_arm(state, holding, dist=zero, dt=dt, gravity=True)
        linear = [sum(ad[i][j] * linear[j] for j in range(4)) for i in range(4)]
    actual = [state[0] - q1, state[1] - q2, state[2], state[3]]
    return {
        "max_state_error": max(abs(actual[i] - linear[i]) for i in range(4)),
        "actual": actual,
        "linear": linear,
    }


if __name__ == "__main__":
    for letter in sorted(LEVELS):
        info = LEVELS[letter]
        print("Level %s: %-24s %s" % (letter, info["name"], info["status"]))
    result = compare_to_plant(0.30, 0.80)
    print("Level B vs Level A at q=(0.30, 0.80): max deviation %.2e"
          % result["max_state_error"])
