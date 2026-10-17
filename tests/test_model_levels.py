#!/usr/bin/env python3
"""Model levels A-D: the linear model is proved against the plant, not asserted.

The one thing this file refuses to do is check the Jacobian against itself. Every derivative is
compared with a finite difference of `mechalab_plant.motor_dynamics`, every discretisation with
either the closed form or one `step_arm` step, and the integration order is pinned with a case where
forward Euler and semi-implicit Euler disagree.

Run: python3 tests/test_model_levels.py
"""

import math
import os
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLANT_DIR = os.path.join(ROOT, "resources", "plants")
if PLANT_DIR not in sys.path:
    sys.path.insert(0, PLANT_DIR)

import mechalab_models as models  # noqa: E402
import mechalab_plant as plant  # noqa: E402


def accelerations(state, tau=(0.0, 0.0)):
    return plant.motor_dynamics(state[0], state[1], state[2], state[3], tau[0], tau[1])


class JacobianTests(unittest.TestCase):
    POSES = [(0.30, 0.80), (0.0, 0.0), (1.20, 0.40), (-0.70, 1.30)]

    def test_jacobian_matches_finite_differences(self):
        h = 1e-7
        for q1, q2 in self.POSES:
            a, _ = models.linearize(q1, q2)
            base = (q1, q2, 0.0, 0.0)
            f0 = accelerations(base)
            for column in range(4):
                plus = list(base)
                minus = list(base)
                plus[column] += h
                minus[column] -= h
                fp = accelerations(plus)
                fm = accelerations(minus)
                for row in range(2):
                    numeric = (fp[row] - fm[row]) / (2 * h)
                    self.assertAlmostEqual(a[row + 2][column], numeric, delta=1e-6,
                                           msg="A[%d][%d] at q=(%.2f, %.2f)" % (row + 2, column, q1, q2))
            self.assertAlmostEqual(a[0][2], 1.0, delta=1e-12)
            self.assertAlmostEqual(a[1][3], 1.0, delta=1e-12)

    def test_input_matrix_is_one_over_inertia(self):
        _, b = models.linearize(0.30, 0.80)
        self.assertAlmostEqual(b[2][0], 1.0 / plant.I1, delta=1e-15)
        self.assertAlmostEqual(b[3][1], 1.0 / plant.I2, delta=1e-15)
        self.assertEqual(b[0], [0.0, 0.0])
        self.assertEqual(b[1], [0.0, 0.0])


class DiscretisationTests(unittest.TestCase):
    def test_forward_euler_is_identity_plus_a_dt(self):
        a, b = models.linearize(0.30, 0.80)
        ad, bd = models.discretize(a, b, 1e-3, "forward-euler")
        for i in range(4):
            for j in range(4):
                expected = (1.0 if i == j else 0.0) + a[i][j] * 1e-3
                self.assertAlmostEqual(ad[i][j], expected, delta=1e-15)
        for i in range(4):
            for j in range(2):
                self.assertAlmostEqual(bd[i][j], b[i][j] * 1e-3, delta=1e-18)

    def test_semi_implicit_position_uses_the_new_velocity(self):
        a, b = models.linearize(0.30, 0.80)
        dt = 1e-3
        ad, bd = models.discretize(a, b, dt, "semi-implicit")
        # One linear step, and the plant's own one step, agree about an equilibrium.
        holding = plant.gravity_torque(0.30, 0.80)
        dx = [1e-6, 0.0, 0.0, 0.0]
        linear = [sum(ad[i][j] * dx[j] for j in range(4)) for i in range(4)]
        state = plant.step_arm((0.30 + 1e-6, 0.80, 0.0, 0.0), holding, dt=dt)
        self.assertAlmostEqual(linear[0], state[0] - 0.30, delta=1e-12)
        self.assertAlmostEqual(linear[2], state[2], delta=1e-12)

    def test_zoh_matches_the_matrix_exponential(self):
        a = [[0.0, 1.0], [-4.0, -1.0]]
        b = [[0.0], [1.0]]
        dt = 0.01
        ad, bd = models.discretize(a, b, dt, "zoh")
        # For this 2x2 the exact exp(A dt) can be checked through its series, term by term.
        expected = [[1.0, 0.0], [0.0, 1.0]]
        term = [[1.0, 0.0], [0.0, 1.0]]
        for k in range(1, 20):
            term = [[(term[0][0] * a[0][0] + term[0][1] * a[1][0]) * dt / k,
                     (term[0][0] * a[0][1] + term[0][1] * a[1][1]) * dt / k],
                    [(term[1][0] * a[0][0] + term[1][1] * a[1][0]) * dt / k,
                     (term[1][0] * a[0][1] + term[1][1] * a[1][1]) * dt / k]]
            for i in range(2):
                for j in range(2):
                    expected[i][j] += term[i][j]
        for i in range(2):
            for j in range(2):
                self.assertAlmostEqual(ad[i][j], expected[i][j], delta=1e-12)
        self.assertGreater(abs(bd[1][0]), 0.0)

    def test_schemes_differ_and_the_wrong_one_is_unstable(self):
        # A spring-mass oscillator at a step too big for forward Euler: it grows, while the
        # semi-implicit map stays bounded. That is the whole reason the plant integrates the way
        # it does, and why the docstring names the scheme.
        a = [[0.0, 1.0], [-400.0, 0.0]]
        b = [[0.0], [0.0]]
        dt = 0.06
        fe, _ = models.discretize(a, b, dt, "forward-euler")
        si, _ = models.discretize(a, b, dt, "semi-implicit")
        x_fe = models.simulate_linear(fe, b, [1.0, 0.0], [0.0], 200)
        x_si = models.simulate_linear(si, b, [1.0, 0.0], [0.0], 200)
        self.assertGreater(abs(x_fe[0]), 10.0, "forward Euler should diverge here")
        self.assertLess(abs(x_si[0]), 2.0, "semi-implicit Euler should stay bounded")


class PlantAgreementTests(unittest.TestCase):
    def test_linear_model_tracks_the_plant_about_an_equilibrium(self):
        for q1, q2 in ((0.30, 0.80), (0.0, 0.0), (1.20, 0.40)):
            result = models.compare_to_plant(q1, q2)
            self.assertLess(result["max_state_error"], 1e-9,
                            "Level B left Level A at q=(%.2f, %.2f)" % (q1, q2))

    def test_step_arm_updates_velocity_before_position(self):
        # The reconciliation in one assertion: position moves by the NEW velocity, so this is
        # semi-implicit (symplectic) Euler, not forward Euler. The two differ by dt^2 * ddq.
        state = (0.20, 0.10, 0.05, -0.02)
        tau = (0.10, -0.05)
        dt = 0.01
        ddq = accelerations(state, tau)
        moved = plant.step_arm(state, tau, dt=dt)
        new_velocity = state[2] + ddq[0] * dt
        self.assertAlmostEqual(moved[0], state[0] + new_velocity * dt, delta=1e-12)
        forward_euler = state[0] + state[2] * dt
        self.assertGreater(abs(moved[0] - forward_euler), 0.0)


class LevelTableTests(unittest.TestCase):
    REQUIRED = {"name", "status", "entry_point", "state", "input", "includes", "omits",
                "provenance", "use_for"}

    def test_every_level_documents_the_same_fields(self):
        self.assertEqual(sorted(models.LEVELS), ["A", "B", "C", "D"])
        for letter, info in models.LEVELS.items():
            self.assertEqual(set(info), self.REQUIRED, "Level %s is missing a field" % letter)
            self.assertTrue(info["includes"] and info["omits"])

    def test_only_a_and_b_claim_implementation(self):
        self.assertEqual(models.LEVELS["A"]["status"], "implemented")
        self.assertEqual(models.LEVELS["B"]["status"], "implemented")
        self.assertEqual(models.LEVELS["C"]["status"], "specified only")
        self.assertIn("primitives", models.LEVELS["D"]["status"])

    def test_unknown_level_is_an_error(self):
        with self.assertRaises(KeyError):
            models.level_info("E")


if __name__ == "__main__":
    unittest.main(verbosity=2)
