"""Planted fault: J multiplied by F instead of J^T F.

Reads plausibly, runs, and is wrong by a transpose - the mistake that survives every zero check,
because zero times anything is still zero. Only virtual work (or an asymmetric Jacobian) sees it.
"""

from solution import jacobian as _jacobian


def jacobian(q1, q2, l1=0.10, l2=0.10):
    return _jacobian(q1, q2, l1, l2)


def joint_torques(J, force):
    return (J[0][0] * force[0] + J[0][1] * force[1],
            J[1][0] * force[0] + J[1][1] * force[1])
