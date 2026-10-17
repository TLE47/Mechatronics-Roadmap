"""Behaviour tests for 00-foundations.T2.00c.

Each test names the mistake it catches:
  * a first-order response that is not normalised to 1, or that ignores tau;
  * zeta missing its factor of 2 (a system then reads half as damped as it is);
  * overshoot computed as exp(-pi zeta) - right at zeta ~ 0.5 by coincidence, wrong elsewhere;
  * b_crit computed as 2 J k instead of 2 sqrt(J k);
  * a settling time that ignores the envelope, or silently returns a number for zeta <= 0;
  * a simulation run past its own stability limit and reported as physics.
"""

import math
import unittest

import harness

submission = harness.load_submission()


class FirstOrderTests(unittest.TestCase):
    def test_time_constant_is_63_2_percent(self):
        self.assertAlmostEqual(submission.first_order_response(0.010, 0.010), 1.0 - math.exp(-1), delta=1e-12)

    def test_starts_at_zero_and_approaches_one(self):
        self.assertEqual(submission.first_order_response(0.0, 0.02), 0.0)
        self.assertAlmostEqual(submission.first_order_response(1.0, 0.02), 1.0, delta=1e-9)

    def test_uses_the_time_constant_it_is_given(self):
        fast = submission.first_order_response(0.01, 0.01)
        slow = submission.first_order_response(0.01, 0.02)
        self.assertGreater(fast, slow)
        self.assertAlmostEqual(slow, 1.0 - math.exp(-0.5), delta=1e-12)


class ParameterTests(unittest.TestCase):
    def test_worked_example(self):
        p = submission.second_order_params(0.02, 8.0, 0.40)
        self.assertAlmostEqual(p["wn"], 20.0, delta=1e-9)
        self.assertAlmostEqual(p["zeta"], 0.50, delta=1e-9)
        self.assertAlmostEqual(p["wd"], 20.0 * math.sqrt(0.75), delta=1e-9)
        self.assertAlmostEqual(p["mp"], 0.16303, delta=1e-5)

    def test_a_different_joint(self):
        p = submission.second_order_params(0.05, 20.0, 1.0)
        self.assertAlmostEqual(p["wn"], 20.0, delta=1e-9)
        self.assertAlmostEqual(p["zeta"], 0.5, delta=1e-9)
        p2 = submission.second_order_params(0.008, 8.0, 0.10)
        self.assertAlmostEqual(p2["zeta"], 0.10 / (2.0 * math.sqrt(0.008 * 8.0)), delta=1e-12)

    def test_overshoot_formula_is_not_exp_minus_pi_zeta(self):
        zeta = 0.30
        p = submission.second_order_params(1.0, 1.0, 2.0 * zeta)
        self.assertAlmostEqual(p["mp"], math.exp(-math.pi * zeta / math.sqrt(1 - zeta * zeta)), delta=1e-12)
        self.assertGreater(abs(p["mp"] - math.exp(-math.pi * zeta)), 1e-3)

    def test_critical_and_overdamped_have_no_overshoot(self):
        for b in (0.80, 1.20):
            p = submission.second_order_params(0.02, 8.0, b)
            self.assertEqual(p["mp"], 0.0)
            self.assertEqual(p["wd"], 0.0)


class CriticalDampingTests(unittest.TestCase):
    def test_returns_zeta_one(self):
        self.assertAlmostEqual(submission.critical_damping(0.02, 8.0), 0.80, delta=1e-12)
        p = submission.second_order_params(0.02, 8.0, submission.critical_damping(0.02, 8.0))
        self.assertAlmostEqual(p["zeta"], 1.0, delta=1e-12)

    def test_changed_plant(self):
        self.assertAlmostEqual(submission.critical_damping(0.05, 20.0), 2.0, delta=1e-12)


class SettlingTests(unittest.TestCase):
    def test_formula(self):
        self.assertAlmostEqual(submission.settling_time(20.0, 0.7), 4.0 / 14.0, delta=1e-12)

    def test_refuses_a_system_that_never_settles(self):
        with self.assertRaises(ValueError):
            submission.settling_time(20.0, 0.0)

    def test_the_formula_matches_the_simulation(self):
        wn, zeta = 20.0, 0.7
        j, k = 0.02, 8.0
        b = 2.0 * zeta * math.sqrt(j * k)
        ts = submission.settling_time(wn, zeta)
        settled = submission.simulate_step(j, k, b, 1e-5, int(1.05 * ts / 1e-5))
        self.assertLess(abs(settled["theta"] - 1.0), 0.025)
        early = submission.simulate_step(j, k, b, 1e-5, int(0.5 * ts / 1e-5))
        self.assertGreater(abs(early["theta"] - 1.0), 0.05)


class SimulationTests(unittest.TestCase):
    def test_worked_overshoot(self):
        p = submission.second_order_params(0.02, 8.0, 0.40)
        sim = submission.simulate_step(0.02, 8.0, 0.40, 1e-4, 10000)
        self.assertAlmostEqual(sim["mp"], p["mp"], delta=0.001)
        self.assertAlmostEqual(sim["theta"], 1.0, delta=0.01)

    def test_critical_damping_does_not_overshoot(self):
        sim = submission.simulate_step(0.02, 8.0, 0.80, 1e-4, 20000)
        self.assertLess(sim["mp"], 1e-6)

    def test_stability_limit_is_real(self):
        dt_max = submission.max_stable_dt(0.02, 8.0)
        self.assertAlmostEqual(dt_max, 0.1, delta=1e-12)
        bounded = submission.simulate_step(0.02, 8.0, 0.0, 0.9 * dt_max, 4000)
        self.assertLess(abs(bounded["max_theta"]), 10.0)
        diverged = submission.simulate_step(0.02, 8.0, 0.0, 1.5 * dt_max, 4000)
        self.assertGreater(abs(diverged["max_theta"]), 100.0,
                           "the scheme is stable past 2/wn - check the limit, not just the numbers")


if __name__ == "__main__":
    unittest.main()
