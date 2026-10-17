"""Transfer tests for 00-foundations.T2.00b - the arm, not the worked-example numbers.

Two changed scenarios, both on the shared plant:
  1. a payload's weight at the tip, whose moment about the shoulder must equal the shoulder torque
     the plant already computes - and must equal `-m g x`, a formula no test here hard-codes;
  2. the arm's own tip Jacobian used as a basis: tip velocity -> joint rates -> tip velocity, with
     the singular pose refusing the inversion instead of returning infinities.
"""

import math
import unittest

import harness

submission = harness.load_submission()
plant = harness.plant


class ArmMomentTests(unittest.TestCase):
    def test_payload_moment_equals_the_shoulder_torque(self):
        q = plant.ik(0.08, 0.05)
        x, y = plant.fk(*q)
        mass = 0.20
        force = [0.0, -mass * plant.G, 0.0]
        tau = submission.moment([x, y, 0.0], force)
        self.assertAlmostEqual(tau[2], -mass * plant.G * x, delta=1e-12)
        self.assertAlmostEqual(tau[0], 0.0, delta=1e-12)
        self.assertAlmostEqual(tau[1], 0.0, delta=1e-12)

        # The same number from the plant: (J^T F)_shoulder with J from finite differences.
        jac = harness.numerical_tip_jacobian(*q)
        shoulder = jac[0][0] * force[0] + jac[1][0] * force[1]
        # The Jacobian column is a finite difference, so the agreement is limited by h^2: 1e-9 N*m
        # is still eight significant figures tighter than any published number in the module.
        self.assertAlmostEqual(tau[2], shoulder, delta=1e-9)


class ArmBasisTests(unittest.TestCase):
    POSES = [(0.30, 0.60), (-0.80, 1.10), (1.40, 0.35)]

    def test_jacobian_columns_are_a_basis_for_tip_velocity(self):
        for q1, q2 in self.POSES:
            jac = harness.numerical_tip_jacobian(q1, q2)
            b1 = [jac[0][0], jac[1][0]]
            b2 = [jac[0][1], jac[1][1]]
            joint_rates = (0.40, -0.20)
            tip_velocity = [b1[0] * joint_rates[0] + b2[0] * joint_rates[1],
                            b1[1] * joint_rates[0] + b2[1] * joint_rates[1]]
            c1, c2 = submission.coordinates_in_basis(tip_velocity, b1, b2)
            self.assertAlmostEqual(c1, joint_rates[0], delta=1e-6)
            self.assertAlmostEqual(c2, joint_rates[1], delta=1e-6)
            rebuilt = submission.in_basis(tip_velocity, b1, b2)
            for got, want in zip(rebuilt, tip_velocity):
                self.assertAlmostEqual(got, want, delta=1e-12)

    def test_determinant_is_the_arm_singularity_test(self):
        for q1, q2 in self.POSES:
            jac = harness.numerical_tip_jacobian(q1, q2)
            det = submission.det2([jac[0][0], jac[1][0]], [jac[0][1], jac[1][1]])
            self.assertAlmostEqual(det, plant.L1 * plant.L2 * math.sin(q2), delta=1e-8)

    def test_stretched_arm_refuses_the_basis_change(self):
        jac = harness.numerical_tip_jacobian(0.30, 0.0)      # elbow straight: singular
        b1 = [jac[0][0], jac[1][0]]
        b2 = [jac[0][1], jac[1][1]]
        with self.assertRaises(ValueError):
            submission.coordinates_in_basis([1.0, 0.0], b1, b2)


if __name__ == "__main__":
    unittest.main()
