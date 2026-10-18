"""Exercise 00-foundations.T2.00g - reference solution.

The state vector stops being a pair of scalars here. `mat_vec` is one row-by-row dot product,
`one_step` is that product plus the input column, and `simulate` is nothing but the same step
repeated - which is why a 2-state cart and a 4-state two-mass drivetrain run through identical
code. `two_mass_matrices` is the proof: the same three functions carry two more states without a
line of new arithmetic.
"""

import math


def mat_vec(A, x):
    """A @ x for a rectangular list-of-rows `A` and a column `x`; ValueError if shapes disagree."""
    if not A:
        raise ValueError("mat_vec: A has no rows")
    n = len(x)
    if any(len(row) != n for row in A):
        raise ValueError("mat_vec: every row of A must have %d entries, got %s"
                         % (n, [len(row) for row in A]))
    return [sum(a * xi for a, xi in zip(row, x)) for row in A]


def state_matrices(m, k, b, dt):
    """(Ad, Bd) for the mass-spring-damper Euler update, x = [position, velocity]."""
    if m <= 0.0:
        raise ValueError("state_matrices: mass must be positive, got %r" % (m,))
    Ad = [[1.0, dt],
          [-(k / m) * dt, 1.0 - (b / m) * dt]]
    Bd = [0.0, dt / m]
    return Ad, Bd


def one_step(Ad, Bd, x, u):
    """One simultaneous matrix step: both components use the OLD state."""
    if len(x) != len(Ad) or len(Bd) != len(Ad):
        raise ValueError("one_step: state, input and matrix dimensions disagree")
    Ax = mat_vec(Ad, x)
    return [Ax[i] + Bd[i] * u for i in range(len(Ax))]


def simulate(Ad, Bd, x0, u, steps):
    """Run `steps` matrix steps with constant input `u`; return the final state."""
    if steps < 0:
        raise ValueError("simulate: steps must be non-negative, got %r" % (steps,))
    x = list(x0)
    for _ in range(steps):
        x = one_step(Ad, Bd, x, u)
    return x


def two_mass_matrices(m1, m2, k, b, dt):
    """(Ad, Bd) for a force on `m1` coupled to `m2` by a spring `k` and damper `b`.

    State order is [x1, v1, x2, v2], so the 4x4 matrix is the 2-state one repeated along the
    diagonal with the coupling terms off it.
    """
    if m1 <= 0.0 or m2 <= 0.0:
        raise ValueError("two_mass_matrices: both masses must be positive")
    Ad = [
        [1.0, dt, 0.0, 0.0],
        [-(k / m1) * dt, 1.0 - (b / m1) * dt, (k / m1) * dt, (b / m1) * dt],
        [0.0, 0.0, 1.0, dt],
        [(k / m2) * dt, (b / m2) * dt, -(k / m2) * dt, 1.0 - (b / m2) * dt],
    ]
    Bd = [0.0, dt / m1, 0.0, 0.0]
    return Ad, Bd


def position_trace(Ad, Bd, x0, u, steps):
    """The first state component at every sample, starting with x0's, so len == steps + 1."""
    x = list(x0)
    out = [x[0]]
    for _ in range(steps):
        x = one_step(Ad, Bd, x, u)
        out.append(x[0])
    return out


# No `__main__` block on purpose: the browser grades this file's stdout against the appended
# self-check's single PASS line, and a second print here would be a mismatch for a correct answer.
