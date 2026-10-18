"""Transfer tests for 00-foundations.T3.00a - the arm, rotated and balanced.

Two claims, measured on the shared plant rather than restated:
  1. rotating the whole arm about its base by `exp_so3([0, 0, theta])` is exactly the same tip
     position as advancing `q1` by `theta`, and a full turn returns the arm to itself;
  2. the plant's published gravity torque *is* the gradient of the arm's potential energy, and the
     submission's power balance reproduces the central-difference rate of that energy.
"""

import math
import unittest

import harness

submission = harness.load_submission()
plant = harness.plant


def matvec(a, v):
    return [sum(a[i][j] * v[j] for j in range(3)) for i in range(3)]


def potential(q):
    """Gravitational potential energy of the two links, in joules (y is up, so H = sum m g y)."""
    m1, m2 = plant.M1, plant.M2
    l1, lc1, lc2 = plant.L1, plant.LC1, plant.LC2
    return ((m1 * lc1 + m2 * l1) * plant.G * math.sin(q[0])
            + m2 * lc2 * plant.G * math.sin(q[0] + q[1]))


class RotatingTheArmTests(unittest.TestCase):
    def test_a_base_rotation_is_the_same_as_advancing_q1(self):
        z = [0.0, 0.0, 1.0]
        for q, theta in (((0.3, 0.4), 0.9), ((-1.1, 0.7), -2.0), ((0.0, math.pi / 2.0), 0.5)):
            tip = list(plant.fk(q[0], q[1])) + [0.0]
            turned = matvec(submission.exp_so3([theta * value for value in z]), tip)
            expected = plant.fk(q[0] + theta, q[1])
            self.assertAlmostEqual(
                turned[0], expected[0], delta=1e-12,
                msg="expected rotating the tip about z to match advancing the shoulder by theta "
                    "at every pose in this loop; a mismatch likely rotated the point but "
                    "recomputed the target wrongly",
            )
            self.assertAlmostEqual(
                turned[1], expected[1], delta=1e-12,
                msg="expected the rotated y to match the plant's forward kinematics at q1 + "
                    "theta for every pose in this loop; a sign error likely turned the arm the "
                    "other way",
            )
            self.assertAlmostEqual(
                turned[2], 0.0, delta=1e-12,
                msg="expected the planar tip to stay at z = 0 after a base rotation; a nonzero "
                    "value likely used a rotation vector off the z axis",
            )

    def test_a_full_turn_returns_the_arm_to_itself(self):
        tip = list(plant.fk(0.2, 0.8)) + [0.0]
        turned = matvec(submission.exp_so3([0.0, 0.0, 2.0 * math.pi]), tip)
        self.assertAlmostEqual(
            turned[0], tip[0], delta=1e-12,
            msg="expected a full turn to return the tip's x unchanged; a small offset likely "
                "came from dropping the (1 - cos)/theta^2 coefficient",
        )
        self.assertAlmostEqual(
            turned[1], tip[1], delta=1e-12,
            msg="expected the tip's y to return unchanged after 2 pi; a residual large enough "
                "to see means the rotation matrix lost orthogonality",
        )


class EnergyBalanceTests(unittest.TestCase):
    def test_gravity_torque_is_the_potential_gradient(self):
        for q in ((0.4, 0.9), (-0.6, 0.2), (1.2, -0.7)):
            h = 1e-6
            grad = [
                (potential([q[0] + h, q[1]]) - potential([q[0] - h, q[1]])) / (2.0 * h),
                (potential([q[0], q[1] + h]) - potential([q[0], q[1] - h])) / (2.0 * h),
            ]
            tau_g = plant.gravity_torque(q[0], q[1])
            self.assertAlmostEqual(
                grad[0], tau_g[0], delta=1e-8,
                msg="expected the finite-difference dH/dq1 to equal the plant's gravity torque "
                    "at every pose in this loop; a sign mismatch likely defined H with the "
                    "wrong vertical direction - check G and sin",
            )
            self.assertAlmostEqual(
                grad[1], tau_g[1], delta=1e-8,
                msg="expected dH/dq2 to equal the second gravity torque at every pose in this "
                    "loop; a mismatch likely omitted the elbow's own centre of mass - check LC2",
            )

    def test_the_power_balance_matches_a_central_difference(self):
        q = [0.4, 0.9]
        q_dot = [0.3, -0.2]
        h = 1e-5
        numerical = (potential([q[0] + h * q_dot[0], q[1] + h * q_dot[1]])
                     - potential([q[0] - h * q_dot[0], q[1] - h * q_dot[1]])) / (2.0 * h)
        rate = submission.energy_rate(list(plant.gravity_torque(q[0], q[1])), q_dot)
        self.assertAlmostEqual(
            rate, numerical, delta=1e-9,
            msg="expected the submission's power balance to match the central-difference rate "
                "of the arm's energy; a mismatch likely forgot that the torque is the gradient "
                "of H - check the dot product",
        )

    def test_damping_only_ever_removes_energy(self):
        q, q_dot = (0.4, 0.9), (0.3, -0.2)
        rate = submission.energy_rate(list(plant.gravity_torque(*q)), list(q_dot))
        damped = submission.energy_rate(
            list(plant.gravity_torque(*q)), list(q_dot),
            plant.B1 * q_dot[0] ** 2 + plant.B2 * q_dot[1] ** 2,
        )
        self.assertLess(
            damped, rate,
            msg="expected adding joint damping to lower the energy rate, never raise it; a "
                "larger value means the dissipation sign is inverted",
        )
        self.assertAlmostEqual(
            rate - damped,
            plant.B1 * q_dot[0] ** 2 + plant.B2 * q_dot[1] ** 2, delta=1e-12,
            msg="expected the rate drop to equal the plant's own b dq^2 losses; another value "
                "likely used b dq rather than b dq^2 - check the units are watts",
        )


if __name__ == "__main__":
    unittest.main()
