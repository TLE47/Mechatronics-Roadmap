"""Shared loader for this exercise's tests.

    EXERCISE_TARGET=exercises/01-electronics.T2.01a/starter.py \
        python3 -m unittest discover -s exercises/01-electronics.T2.01a -p 'test_*.py'
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
            "EXERCISE_TARGET=exercises/01-electronics.T2.01a/solution.py"
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
