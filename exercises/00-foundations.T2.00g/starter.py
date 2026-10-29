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
    """The matrix-vector product, as a list of `len(A)` numbers.

    Refuse (ValueError) an empty matrix or one whose rows are not all `len(x)` long - the shape
    check is what turns a silent truncation into a message.
    """
    raise NotImplementedError("TODO 1: the matrix-vector product, refusing a shape that does not line up")


def state_matrices(m, k, b, dt):
    """(Ad, Bd) for the mass-spring-damper Euler update, state [position, velocity]."""
    raise NotImplementedError("TODO 2: the state and input matrices for this mass-spring-damper at this step size")


def one_step(Ad, Bd, x, u):
    """The state one step later, with every component read from the OLD x.

    Refuse (ValueError) a state or input column whose length disagrees with `Ad`.
    """
    raise NotImplementedError("TODO 3: the state after one step, with every component read from the old state")


def simulate(Ad, Bd, x0, u, steps):
    """Run `steps` one_steps with a constant input `u`; return the final state.

    Refuse (ValueError) a negative `steps`.
    """
    raise NotImplementedError("TODO 4: the final state after this many steps, refusing a negative count")


def two_mass_matrices(m1, m2, k, b, dt):
    """(Ad, Bd) for a force on `m1` coupled to `m2` by spring `k` and damper `b`.

    State order is [x1, v1, x2, v2], and the force acts on the first mass.
    """
    raise NotImplementedError("TODO 5: the four-state matrices for the two-mass drivetrain")


def position_trace(Ad, Bd, x0, u, steps):
    """The first state component at every sample, starting with x0's: len == steps + 1."""
    raise NotImplementedError("TODO 6: the first state component at every sample, from the start through the last step")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
