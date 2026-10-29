"""Exercise 02-mechanics.T2.02a - the learner's file.

Fill the six TODOs below (the module's five, plus `payload_run`), then run the tests:

    EXERCISE_TARGET=exercises/02-mechanics.T2.02a/starter.py \
        python3 -m unittest discover -s exercises/02-mechanics.T2.02a -p 'test_behavior.py'

Every `raise NotImplementedError` is a hole; the file is still valid Python, so CI can import it
and confirm it *fails*, which is half of the three-way check.

The conventions are the plant's, not yours to pick: angles in radians, lengths in metres,
(x, y) in metres, torques in newton-metres, gravity downwards at -y.
"""

import math

import mechalab_plant as plant


def jacobian(q1, q2, l1=plant.L1, l2=plant.L2):
    """The 2x2 matrix that turns a small change in each joint into the tip's small motion."""
    raise NotImplementedError("TODO 1: the matrix that turns a small change in each joint into the tip's small motion")


def joint_torques(J, force):
    """The joint torques a Cartesian tip force produces."""
    raise NotImplementedError("TODO 2: the two joint torques this tip force produces")


def gravity_from_com_jacobians(q1, q2):
    """The joint torques that hold the arm against gravity."""
    raise NotImplementedError("TODO 3: the joint torques that hold both links against gravity")


def singular_elbow_angles():
    """The elbow angles in [0, pi] where the arm loses the ability to move the tip in some direction."""
    raise NotImplementedError("TODO 4: the elbow angles over the closed interval where the arm is at full stretch or fully folded")


def potential_gradient(q1, q2, m_p=0.05, h=1e-6):
    """How the payload's potential energy changes with each joint angle, by central differences."""
    raise NotImplementedError("TODO 5: how the payload's potential energy changes with each joint angle")


def payload_run(m_payload, compensate):
    """Run the capstone's figure-8 with a point mass at the tip.

    Returns {"rms_mm": float, "peak_mm": float}. The payload reaches the plant twice:
      * as an external torque on the arm, always;
      * as a feedforward term in the controller, when `compensate` is True.
    The controller is the capstone's PD + gravity law; keep it, do not retune it.
    """
    raise NotImplementedError("TODO 6: the figure-8's RMS and peak error, with and without the payload compensation")

# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
