"""Exercise 00-foundations.T2.00g - the learner's file.

One matrix-vector product, one step, one loop - and then the same code carrying a four-state
drivetrain. Fill the six TODOs, then run the tests:

    EXERCISE_TARGET=exercises/00-foundations.T2.00g/starter.py \
        python3 -m unittest discover -s exercises/00-foundations.T2.00g -p 'test_*.py'

Units are the plant's: metres, seconds, kilograms, newtons. `Ad` and `x` are plain lists of lists
and plain lists; no numpy, so every row is a dot product you can read.
"""

import math

import mechalab_plant as plant


def mat_vec(A, x):
    """A @ x: one dot product per row of `A`, returned as a list of `len(A)` numbers.

    Refuse (ValueError) an empty matrix or one whose rows are not all `len(x)` long - the shape
    check is what turns a silent truncation into a message.
    """
    raise NotImplementedError("TODO 1: shape check, then one dot product per row")


def state_matrices(m, k, b, dt):
    """(Ad, Bd) for the mass-spring-damper Euler update, state [position, velocity].

    Ad = [[1, dt], [-k/m*dt, 1 - b/m*dt]],  Bd = [0, dt/m]
    """
    raise NotImplementedError("TODO 2: build Ad and Bd from m, k, b, dt")


def one_step(Ad, Bd, x, u):
    """A_d x + B_d u for one step, with every component read from the OLD x.

    Refuse (ValueError) a state or input column whose length disagrees with `Ad`.
    """
    raise NotImplementedError("TODO 3: dimension check, then both rows from the old state")


def simulate(Ad, Bd, x0, u, steps):
    """Run `steps` one_steps with a constant input `u`; return the final state.

    Refuse (ValueError) a negative `steps`.
    """
    raise NotImplementedError("TODO 4: copy x0, then loop")


def two_mass_matrices(m1, m2, k, b, dt):
    """(Ad, Bd) for a force on `m1` coupled to `m2` by spring `k` and damper `b`.

    State order is [x1, v1, x2, v2]: the 2-state matrices along the diagonal, coupling off it.
    The input pushes only `m1`, so `Bd` is zero everywhere except the v1 row.
    """
    raise NotImplementedError("TODO 5: fill the 4x4 with the two 2x2 blocks and their coupling")


def position_trace(Ad, Bd, x0, u, steps):
    """The first state component at every sample, starting with x0's: len == steps + 1."""
    raise NotImplementedError("TODO 6: record before the first step, then after each one")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
