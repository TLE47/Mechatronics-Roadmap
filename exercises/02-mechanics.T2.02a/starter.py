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
    """The 2x2 geometric Jacobian of the tip: [[dx/dq1, dx/dq2], [dy/dq1, dy/dq2]].

    TODO 1: differentiate the planar forward kinematics.
    Only the elbow differentiates l2, so both entries of the second column carry the world
    angle q1 + q2.
    """
    raise NotImplementedError("TODO 1: build the Jacobian")


def joint_torques(J, force):
    """Joint torques (tau1, tau2) that a Cartesian tip force produces.

    TODO 2: the transpose is the whole point: do not multiply J by F.
    """
    raise NotImplementedError("TODO 2: map a tip force into joint torques")


def gravity_from_com_jacobians(q1, q2):
    """Gravity holding torques, built as sum_i J_com,i(q)^T (0, m_i g).

    TODO 3: two links, two CoM Jacobians. The elbow's CoM hangs off the shoulder, so it is
    rotated by the shoulder angle plus the elbow angle: its own joint angle is not its world angle.
    """
    raise NotImplementedError("TODO 3: sum the two CoM Jacobians")


def singular_elbow_angles():
    """The elbow angles in [0, pi] where det J = l1 * l2 * sin(q2) is zero.

    TODO 4: the elbow angles where the arm straightens out or folds back on itself, on the
    closed interval. Return a tuple of floats.
    """
    raise NotImplementedError("TODO 4: where is the arm singular?")


def potential_gradient(q1, q2, m_p=0.05, h=1e-6):
    """(dU/dq1, dU/dq2) of U = m_p * g * y_tip, by central differences.

    TODO 5: perturb one angle at a time, divide by 2h, and use plant.fk for the height.
    """
    raise NotImplementedError("TODO 5: energy route to the same torque")


def payload_run(m_payload, compensate):
    """Run the capstone's figure-8 with a point mass at the tip.

    Returns {"rms_mm": float, "peak_mm": float}. The payload reaches the plant twice:
      * as an external torque on `step_arm(dist=...)`, always;
      * as a feedforward term J(q)^T (0, m g) in the controller, when `compensate` is True.
    The controller is the capstone's PD + gravity law; keep it, do not retune it.
    """
    raise NotImplementedError("TODO 6: run the payload scenario")

# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
