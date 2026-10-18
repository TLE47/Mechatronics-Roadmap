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
        self.assertAlmostEqual(
            submission.first_order_response(0.010, 0.010), 1.0 - math.exp(-1), delta=1e-12,
            msg="expected one time constant to reach 63.2 percent, 0.6321; 0.5 likely used a "
                "straight-line approximation - check 1 - exp(-t/tau)",
        )

    def test_starts_at_zero_and_approaches_one(self):
        self.assertEqual(
            submission.first_order_response(0.0, 0.02), 0.0,
            msg="expected a zero response at t = 0; a nonzero start means the curve was offset "
                "so it could look symmetric - check the exponential",
        )
        self.assertAlmostEqual(
            submission.first_order_response(1.0, 0.02), 1.0, delta=1e-9,
            msg="expected the response to have reached 1.0 after fifty time constants; a smaller "
                "value likely divided by the time instead of the constant",
        )

    def test_uses_the_time_constant_it_is_given(self):
        fast = submission.first_order_response(0.01, 0.01)
        slow = submission.first_order_response(0.01, 0.02)
        self.assertGreater(
            fast, slow,
            msg="expected the shorter time constant to respond faster at the same instant; an "
                "equal or smaller value means tau was ignored - check the denominator",
        )
        self.assertAlmostEqual(
            slow, 1.0 - math.exp(-0.5), delta=1e-12,
            msg="expected t/tau = 0.5 to give 0.3935; 0.6321 likely used tau = 0.01 for both "
                "calls - check the second argument",
        )


class ParameterTests(unittest.TestCase):
    def test_worked_example(self):
        p = submission.second_order_params(0.02, 8.0, 0.40)
        self.assertAlmostEqual(
            p["wn"], 20.0, delta=1e-9,
            msg="expected sqrt(k/J) = sqrt(8/0.02) = 20 rad/s; 400 likely forgot the root - "
                "check the natural frequency",
        )
        self.assertAlmostEqual(
            p["zeta"], 0.50, delta=1e-9,
            msg="expected b / (2 sqrt(Jk)) = 0.5; 0.25 means the factor of 2 was dropped, which "
                "makes the joint read twice as springy as it is",
        )
        self.assertAlmostEqual(
            p["wd"], 20.0 * math.sqrt(0.75), delta=1e-9,
            msg="expected the damped frequency wn sqrt(1 - zeta^2) = 17.32 rad/s; 20.0 means "
                "zeta was left out of the root - check the 0.75",
        )
        self.assertAlmostEqual(
            p["mp"], 0.16303, delta=1e-5,
            msg="expected 16.3 percent overshoot at zeta = 0.5; 0.2079 is exp(-pi zeta), which "
                "is only close by coincidence - check the sqrt(1 - zeta^2) denominator",
        )

    def test_a_different_joint(self):
        p = submission.second_order_params(0.05, 20.0, 1.0)
        self.assertAlmostEqual(
            p["wn"], 20.0, delta=1e-9,
            msg="expected sqrt(20/0.05) = 20 rad/s for this joint; 400 means the ratio was left "
                "unrooted - check the parameter estimates",
        )
        self.assertAlmostEqual(
            p["zeta"], 0.5, delta=1e-9,
            msg="expected zeta = 0.5 for b = 1.0 on this joint; 1.0 means b was divided by sqrt(Jk) "
                "without the 2 - check the definition",
        )
        p2 = submission.second_order_params(0.008, 8.0, 0.10)
        self.assertAlmostEqual(
            p2["zeta"], 0.10 / (2.0 * math.sqrt(0.008 * 8.0)), delta=1e-12,
            msg="expected the light damping to give zeta = 0.125 on this joint; 0.25 means the "
                "factor of 2 vanished again - check the formula",
        )

    def test_overshoot_formula_is_not_exp_minus_pi_zeta(self):
        zeta = 0.30
        p = submission.second_order_params(1.0, 1.0, 2.0 * zeta)
        self.assertAlmostEqual(
            p["mp"], math.exp(-math.pi * zeta / math.sqrt(1 - zeta * zeta)), delta=1e-12,
            msg="expected the exact overshoot exp(-pi zeta / sqrt(1 - zeta^2)); the short form "
                "without the root is a different curve - check the denominator",
        )
        self.assertGreater(
            abs(p["mp"] - math.exp(-math.pi * zeta)), 1e-3,
            msg="expected the exact and approximate forms to differ measurably at zeta = 0.3, so "
                "the test can tell them apart; equality means the coincidence at 0.5 leaked in",
        )

    def test_critical_and_overdamped_have_no_overshoot(self):
        for b in (0.80, 1.20):
            p = submission.second_order_params(0.02, 8.0, b)
            self.assertEqual(
                p["mp"], 0.0,
                msg="expected no overshoot at or above critical damping for both b values in this "
                    "loop; a nonzero value means the square root went negative and was ignored",
            )
            self.assertEqual(
                p["wd"], 0.0,
                msg="expected no damped oscillation at or above critical damping; a nonzero wd "
                    "means the code took sqrt(1 - zeta^2) on a negative number",
            )


class CriticalDampingTests(unittest.TestCase):
    def test_returns_zeta_one(self):
        self.assertAlmostEqual(
            submission.critical_damping(0.02, 8.0), 0.80, delta=1e-12,
            msg="expected 2 sqrt(Jk) = 0.8 for this joint; 0.32 is 2 J k, which is far too "
                "little damping - check the square root",
        )
        p = submission.second_order_params(0.02, 8.0, submission.critical_damping(0.02, 8.0))
        self.assertAlmostEqual(
            p["zeta"], 1.0, delta=1e-12,
            msg="expected the returned b to produce exactly zeta = 1; another value means the "
                "two functions disagree by the factor of 2",
        )

    def test_changed_plant(self):
        self.assertAlmostEqual(
            submission.critical_damping(0.05, 20.0), 2.0, delta=1e-12,
            msg="expected 2 sqrt(0.05 * 20) = 2.0; 2.0 from 2 J k would be 2.0 only by accident "
                "here, so check another pair if you are unsure - the formula is the root",
        )


class SettlingTests(unittest.TestCase):
    def test_formula(self):
        self.assertAlmostEqual(
            submission.settling_time(20.0, 0.7), 4.0 / 14.0, delta=1e-12,
            msg="expected 4 / (zeta wn) = 4/14 = 0.2857 s; 0.05 likely divided by wn alone - "
                "check the envelope term",
        )

    def test_refuses_a_system_that_never_settles(self):
        with self.assertRaises(ValueError):
            submission.settling_time(20.0, 0.0)

    def test_the_formula_matches_the_simulation(self):
        wn, zeta = 20.0, 0.7
        j, k = 0.02, 8.0
        b = 2.0 * zeta * math.sqrt(j * k)
        ts = submission.settling_time(wn, zeta)
        settled = submission.simulate_step(j, k, b, 1e-5, int(1.05 * ts / 1e-5))
        self.assertLess(
            abs(settled["theta"] - 1.0), 0.025,
            msg="expected the simulated joint to sit within 2.5 percent of target just after the "
                "predicted settling time; a larger error means the formula and simulation "
                "disagree - check the damping passed to each",
        )
        early = submission.simulate_step(j, k, b, 1e-5, int(0.5 * ts / 1e-5))
        self.assertGreater(
            abs(early["theta"] - 1.0), 0.05,
            msg="expected the joint to still be settling at half the settling time, so the "
                "measurement is meaningful; a smaller error means the system settled too early",
        )


class SimulationTests(unittest.TestCase):
    def test_worked_overshoot(self):
        p = submission.second_order_params(0.02, 8.0, 0.40)
        sim = submission.simulate_step(0.02, 8.0, 0.40, 1e-4, 10000)
        self.assertAlmostEqual(
            sim["mp"], p["mp"], delta=0.001,
            msg="expected the simulated overshoot to match the formula within 0.1 percent; a "
                "mismatch likely means the simulation used different j, k or b - check both calls",
        )
        self.assertAlmostEqual(
            sim["theta"], 1.0, delta=0.01,
            msg="expected the joint to settle on the target after 1 s; a residual offset means "
                "the simulation converged to the wrong equilibrium - check the k(1 - theta) term",
        )

    def test_critical_damping_does_not_overshoot(self):
        sim = submission.simulate_step(0.02, 8.0, 0.80, 1e-4, 20000)
        self.assertLess(
            sim["mp"], 1e-6,
            msg="expected critical damping to overshoot by less than a millionth; a visible "
                "overshoot means the damping is below 2 sqrt(Jk) - check the argument",
        )

    def test_stability_limit_is_real(self):
        dt_max = submission.max_stable_dt(0.02, 8.0)
        self.assertAlmostEqual(
            dt_max, 0.1, delta=1e-12,
            msg="expected the semi-implicit Euler limit 2/wn = 0.1 s; 0.05 likely used 1/wn - "
                "check the factor of 2",
        )
        bounded = submission.simulate_step(0.02, 8.0, 0.0, 0.9 * dt_max, 4000)
        self.assertLess(
            abs(bounded["max_theta"]), 10.0,
            msg="expected the run just inside the limit to stay bounded; a huge value means the "
                "limit is wrong or the update order changed",
        )
        diverged = submission.simulate_step(0.02, 8.0, 0.0, 1.5 * dt_max, 4000)
        self.assertGreater(
            abs(diverged["max_theta"]), 100.0,
            msg="expected the run past 1.5 times the limit to diverge, so the limit is real and "
                "not just a number the test repeats; a small value means the integrator was "
                "made unconditionally stable",
        )


if __name__ == "__main__":
    unittest.main()
