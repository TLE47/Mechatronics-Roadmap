"""Shared loader for this exercise's tests.

The submission under test is a single file that defines the six names in `exercise.json`.
`scripts/run_exercise.py` points `EXERCISE_TARGET` at it; a learner running the tests by hand
sets the same variable:

    EXERCISE_TARGET=exercises/02-mechanics.T2.02a/starter.py python3 -m unittest discover \
        -s exercises/02-mechanics.T2.02a -p 'test_*.py'

The tests import the submission as `submission`, never as `solution`, so a test can tell the
difference between the reference and whatever is being graded.
"""

import importlib.util
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
PLANT_DIR = os.path.join(ROOT, "resources", "plants")

if PLANT_DIR not in sys.path:
    sys.path.insert(0, PLANT_DIR)

import mechalab_plant as plant  # noqa: E402  (path set above, on purpose)


def target_path():
    path = os.environ.get("EXERCISE_TARGET")
    if not path:
        raise RuntimeError(
            "EXERCISE_TARGET is not set: point it at the file to grade, e.g. "
            "EXERCISE_TARGET=exercises/02-mechanics.T2.02a/solution.py"
        )
    if not os.path.isabs(path):
        path = os.path.join(ROOT, path)
    return path


def load_submission():
    """Import the file under test as a fresh module named `submission`."""
    path = target_path()
    if not os.path.exists(path):
        raise RuntimeError("EXERCISE_TARGET does not exist: %s" % path)
    spec = importlib.util.spec_from_file_location("submission", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def tip(q1, q2, l1=plant.L1, l2=plant.L2):
    """The oracle tip position, from the plant, not from the submission."""
    return plant.fk(q1, q2, l1=l1, l2=l2)


def numerical_jacobian(q1, q2, l1=plant.L1, l2=plant.L2, h=1e-6):
    """Central-difference Jacobian of `plant.fk`, computed one joint at a time."""
    x1p, y1p = tip(q1 + h, q2, l1, l2)
    x1m, y1m = tip(q1 - h, q2, l1, l2)
    x2p, y2p = tip(q1, q2 + h, l1, l2)
    x2m, y2m = tip(q1, q2 - h, l1, l2)
    return [
        [(x1p - x1m) / (2.0 * h), (x2p - x2m) / (2.0 * h)],
        [(y1p - y1m) / (2.0 * h), (y2p - y2m) / (2.0 * h)],
    ]


def det2(J):
    return J[0][0] * J[1][1] - J[0][1] * J[1][0]


def payload_torque(q1, q2, m_payload):
    """The oracle joint torque of a point mass at the tip, from the plant's own energy slope.

    Central differences of U = m g y, so this is independent of the submission's Jacobian.
    """
    h = 1e-6
    du_dq1 = (m_payload * plant.G * plant.fk(q1 + h, q2)[1] - m_payload * plant.G * plant.fk(q1 - h, q2)[1]) / (2 * h)
    du_dq2 = (m_payload * plant.G * plant.fk(q1, q2 + h)[1] - m_payload * plant.G * plant.fk(q1, q2 - h)[1]) / (2 * h)
    return (du_dq1, du_dq2)
