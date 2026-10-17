"""Shared loader for this exercise's tests.

    EXERCISE_TARGET=exercises/00-foundations.T2.00b/starter.py \
        python3 -m unittest discover -s exercises/00-foundations.T2.00b -p 'test_*.py'
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
            "EXERCISE_TARGET=exercises/00-foundations.T2.00b/solution.py"
        )
    if not os.path.isabs(path):
        path = os.path.join(ROOT, path)
    return path


def load_submission():
    path = target_path()
    if not os.path.exists(path):
        raise RuntimeError("EXERCISE_TARGET does not exist: %s" % path)
    spec = importlib.util.spec_from_file_location("submission", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def numerical_tip_jacobian(q1, q2, h=1e-6):
    """Columns of the tip Jacobian, from the plant's own forward kinematics."""
    x1p, y1p = plant.fk(q1 + h, q2)
    x1m, y1m = plant.fk(q1 - h, q2)
    x2p, y2p = plant.fk(q1, q2 + h)
    x2m, y2m = plant.fk(q1, q2 - h)
    return [[(x1p - x1m) / (2 * h), (x2p - x2m) / (2 * h)],
            [(y1p - y1m) / (2 * h), (y2p - y2m) / (2 * h)]]
