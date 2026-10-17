"""Behaviour tests for 08-capstones.T3.07a.

Each test names the mistake it catches:
  * a root-sum-square that adds the sigmas linearly, which is the course's first Common-mistakes
    row - a $0.43\\text{ mm}$ budget reported as $0.20\\text{ mm}$ and waved through;
  * systematic biases that are allowed to cancel each other instead of adding in magnitude;
  * a latency chain that forgets the zero-order hold, so $1.10\\text{ ms}$ is booked as
    $0.60\\text{ ms}$ and $9.45^\\circ$ of phase margin reappears from nowhere;
  * a phase subtraction done in radians and reported as degrees;
  * a sign-off that treats four out of five domains as good enough - the 4/5 `[SAFETY]` case.
"""

import math
import unittest

import harness

submission = harness.load_submission()

WORKED_BIASES = (0.01, 0.04, 0.03, 0.02)
WORKED_SIGMAS = (0.03, 0.06, 0.08, 0.03)


class SpatialBudgetTests(unittest.TestCase):
    def test_the_worked_rss(self):
        # 0.03^2 + 0.06^2 + 0.08^2 + 0.03^2 = 0.0118, whose root is 0.10863 mm.
        value = submission.rss(WORKED_SIGMAS)
        self.assertAlmostEqual(value * value, 0.0118, delta=1e-15)
        self.assertAlmostEqual(value, 0.1086278, delta=1e-7)
        self.assertLess(value, sum(WORKED_SIGMAS))

    def test_the_skip_test_rss(self):
        # 0.03^2 + 0.04^2 + 0.12^2 = 0.0169, exactly 0.13 mm.
        self.assertAlmostEqual(submission.rss((0.03, 0.04, 0.12)), 0.13, delta=1e-12)

    def test_the_systematic_offsets_add_linearly(self):
        self.assertAlmostEqual(submission.systematic_sum(WORKED_BIASES), 0.10, delta=1e-15)

    def test_the_worked_three_sigma_budget(self):
        # 0.10 mm of systematic bias plus three sigma of 0.10863 mm: 0.4259 mm against a 0.50 spec.
        total = submission.error_budget_3sigma(WORKED_BIASES, WORKED_SIGMAS)
        self.assertAlmostEqual(total, 0.4258834, delta=1e-6)
        self.assertLess(total, 0.50)

    def test_the_gate_test_three_sigma_budget(self):
        # b = 0.05 mm, sigmas 0.06 and 0.08 mm: 0.05 + 3 * 0.10 = 0.35 mm.
        self.assertAlmostEqual(submission.error_budget_3sigma((0.05,), (0.06, 0.08)),
                               0.35, delta=1e-12)

    def test_a_negative_bias_still_costs_accuracy(self):
        # An offset of -0.02 mm is an error, not a credit: 0.05 + 0.02 = 0.07 mm.
        self.assertAlmostEqual(submission.error_budget_3sigma((0.05, -0.02), (0.0, 0.0)),
                               0.07, delta=1e-12)

    def test_sensitivities_scale_each_source(self):
        # A 0.01 mm bias seen through a 2x lever arm is 0.02 mm, and 0.02 mm of sigma is 0.04.
        self.assertAlmostEqual(
            submission.error_budget_3sigma((0.01,), (0.02,), sensitivities=(2.0,)),
            0.14, delta=1e-12)

    def test_a_single_bias_may_face_two_random_sources(self):
        # The Gate test's own shape: one 0.05 mm offset, sigma 0.06 and 0.08. The lists are
        # separate sums, so they do not have to pair up.
        self.assertAlmostEqual(submission.error_budget_3sigma((0.05,), (0.06, 0.08)),
                               0.35, delta=1e-12)

    def test_an_empty_budget_is_refused(self):
        with self.assertRaises(ValueError):
            submission.error_budget_3sigma((), (0.03,))
        with self.assertRaises(ValueError):
            submission.error_budget_3sigma((0.01,), ())

    def test_a_sensitivity_list_that_cannot_pair_is_refused(self):
        with self.assertRaises(ValueError):
            submission.error_budget_3sigma((0.01, 0.02), (0.03, 0.04), sensitivities=(2.0,))

    def test_a_negative_sigma_is_refused(self):
        with self.assertRaises(ValueError):
            submission.rss((0.03, -0.02))


class VarianceTests(unittest.TestCase):
    def test_the_skip_test_variance_fraction(self):
        # 0.12^2 / 0.13^2 = 144/169 = 0.85207.
        self.assertAlmostEqual(submission.variance_fraction(2, (0.03, 0.04, 0.12)),
                               144.0 / 169.0, delta=1e-12)

    def test_the_fractions_sum_to_one(self):
        sigmas = (0.03, 0.06, 0.08, 0.03)
        total = sum(submission.variance_fraction(i, sigmas) for i in range(len(sigmas)))
        self.assertAlmostEqual(total, 1.0, delta=1e-12)

    def test_the_dominant_source_is_the_largest(self):
        sigmas = (0.03, 0.06, 0.08, 0.03)
        fractions = [submission.variance_fraction(i, sigmas) for i in range(len(sigmas))]
        self.assertEqual(fractions.index(max(fractions)), 2)
        self.assertGreater(max(fractions), 0.5)

    def test_a_zero_variance_budget_is_refused(self):
        with self.assertRaises(ValueError):
            submission.variance_fraction(0, (0.0, 0.0))
        with self.assertRaises(ValueError):
            submission.variance_fraction(3, (0.03, 0.04))


class LatencyTests(unittest.TestCase):
    def test_the_gate_test_zoh_delay(self):
        # Half of a 1000 us sample period is 500 us of pure delay.
        self.assertAlmostEqual(submission.zoh_delay_us(1000.0), 500.0, delta=1e-12)
        self.assertAlmostEqual(submission.zoh_delay_us(2000.0), 1000.0, delta=1e-12)

    def test_the_worked_total_delay(self):
        # 20 + 180 + 250 + 150 + 500 = 1100 us = 0.0011 s.
        self.assertAlmostEqual(
            submission.total_latency_s(20.0, 180.0, 250.0, 150.0, 1000.0),
            0.0011, delta=1e-15)

    def test_the_exercise_total_delay(self):
        # The 10-tap moving average turns 250 us into 2550 us: 3400 us = 0.0034 s.
        self.assertAlmostEqual(
            submission.total_latency_s(20.0, 180.0, 2550.0, 150.0, 1000.0),
            0.0034, delta=1e-15)

    def test_a_negative_delay_is_refused(self):
        with self.assertRaises(ValueError):
            submission.total_latency_s(-1.0, 180.0, 250.0, 150.0, 1000.0)

    def test_a_zero_sample_period_is_refused(self):
        with self.assertRaises(ValueError):
            submission.zoh_delay_us(0.0)
        with self.assertRaises(ValueError):
            submission.total_latency_s(20.0, 180.0, 250.0, 150.0, 0.0)


class PhaseMarginTests(unittest.TestCase):
    def test_the_worked_net_margin(self):
        # 62.0 - 150 * 0.0011 * 180/pi = 62.0 - 9.4538 = 52.5462 deg, still above 45.
        margin = submission.net_phase_margin_deg(62.0, 150.0, 0.0011)
        self.assertAlmostEqual(margin, 52.546196, delta=1e-6)
        self.assertGreater(margin, 45.0)

    def test_the_exercise_net_margin(self):
        # 150 * 0.0034 = 0.51 rad = 29.2208 deg, so 62.0 - 29.2208 = 32.7792 deg: NO-GO.
        margin = submission.net_phase_margin_deg(62.0, 150.0, 0.0034)
        self.assertAlmostEqual(margin, 32.779152, delta=1e-6)
        self.assertLess(margin, 45.0)

    def test_the_skip_test_net_margin(self):
        # 60.0 - 200 * 0.001 * 180/pi = 60.0 - 11.4592 = 48.5408 deg.
        self.assertAlmostEqual(submission.net_phase_margin_deg(60.0, 200.0, 0.001),
                               48.540844, delta=1e-6)

    def test_the_gate_test_max_delay(self):
        # A 0.20 rad budget at 200 rad/s is 1.0 ms.
        self.assertAlmostEqual(submission.max_allowable_delay_ms(0.20, 200.0), 1.0, delta=1e-12)

    def test_the_45_degree_floor_in_delay(self):
        # 62 - 45 = 17 deg = 0.29671 rad; at 150 rad/s that is 1.97804 ms of total delay.
        budget = (62.0 - 45.0) * math.pi / 180.0
        delay = submission.max_allowable_delay_ms(budget, 150.0)
        self.assertAlmostEqual(delay, 1.978039819, delta=1e-9)
        self.assertGreater(delay, 1.0)

    def test_a_zero_crossover_has_no_delay_budget(self):
        with self.assertRaises(ValueError):
            submission.max_allowable_delay_ms(0.2, 0.0)
        with self.assertRaises(ValueError):
            submission.net_phase_margin_deg(60.0, -150.0, 0.001)


class SignoffTests(unittest.TestCase):
    def test_the_worked_example_is_go(self):
        self.assertTrue(submission.capstone_signoff(0.4258834, 52.546196, 0.42, 60.0, True))

    def test_the_exercise_is_no_go(self):
        # Every other gate passes; the eroded phase margin alone blocks first motion.
        self.assertFalse(submission.capstone_signoff(0.4258834, 32.779152, 0.42, 60.0, True))

    def test_the_sto_gate_is_mandatory(self):
        # Four of five is NO-GO: an unverified Category 3 STO is a hard stop.
        self.assertFalse(submission.capstone_signoff(0.20, 52.5, 0.42, 60.0, False))

    def test_out_of_window_termination_is_no_go(self):
        self.assertFalse(submission.capstone_signoff(0.20, 52.5, 0.42, 50.0, True))
        self.assertFalse(submission.capstone_signoff(0.20, 52.5, 0.42, 66.0, True))

    def test_boundaries_are_inclusive(self):
        self.assertTrue(submission.capstone_signoff(0.20, 52.5, 0.42, 55.0, True))
        self.assertTrue(submission.capstone_signoff(0.20, 52.5, 0.42, 65.0, True))
        self.assertTrue(submission.capstone_signoff(0.20, 45.0, 0.42, 60.0, True))

    def test_cpu_over_budget_is_no_go(self):
        self.assertTrue(submission.capstone_signoff(0.20, 52.5, 0.70, 60.0, True))
        self.assertFalse(submission.capstone_signoff(0.20, 52.5, 0.71, 60.0, True))

    def test_the_spec_boundary_is_inclusive(self):
        self.assertTrue(submission.capstone_signoff(0.50, 52.5, 0.42, 60.0, True))
        self.assertFalse(submission.capstone_signoff(0.5001, 52.5, 0.42, 60.0, True))

    def test_a_non_bool_sto_is_refused(self):
        with self.assertRaises(ValueError):
            submission.capstone_signoff(0.20, 52.5, 0.42, 60.0, 1)


if __name__ == "__main__":
    unittest.main()
