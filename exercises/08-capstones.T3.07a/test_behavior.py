"""Behaviour tests for 08-capstones.T3.07a.

Each test names the mistake it catches:
  * a root-sum-square that adds the sigmas linearly, which is the course's first Common-mistakes
    row - a $0.43\\text{ mm}$ budget reported as $0.20\\text{ mm}$ and waved through;
  * systematic biases that are allowed to cancel each other instead of adding in magnitude;
  * a latency chain that forgets the zero-order hold, so $1.10\\text{ ms}$ is booked as
    $0.60\\text{ ms}$ and $9.45^\\circ$ of phase margin reappears from nowhere;
  * a phase subtraction done in radians and reported as degrees;
  * a sign-off that treats four out of five domains as good enough - the 4/5 `[SAFETY]` case.

Every assertion carries the expected value, the likely cause of a different answer, and what to check:
the message is the only mentor a solo learner has when a test goes red.
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
        self.assertAlmostEqual(
            value * value, 0.0118, delta=1e-15,
            msg="expected the summed squares 0.0118 from sigmas 0.03/0.06/0.08/0.03 mm; a value near 0.0004 likely means the sigmas were averaged instead of squared - check every term is sigma**2")
        self.assertAlmostEqual(
            value, 0.1086278, delta=1e-7,
            msg="expected 0.1086 mm from the four sigmas; an answer near 0.20 mm likely means the sigmas were added linearly - check the square root is applied to the summed squares")
        self.assertLess(
            value, sum(WORKED_SIGMAS),
            msg="expected the RSS to fall below the linear sum 0.20 mm; a larger value likely means one sigma entered the sum twice - check each of the four sources appears once")

    def test_the_skip_test_rss(self):
        # 0.03^2 + 0.04^2 + 0.12^2 = 0.0169, exactly 0.13 mm.
        self.assertAlmostEqual(
            submission.rss((0.03, 0.04, 0.12)), 0.13, delta=1e-12,
            msg="expected a perfect 0.13 mm from 0.03/0.04/0.12 mm; a 0.19 mm answer likely means the sigmas were summed instead of root-sum-squared - check the squares")

    def test_the_systematic_offsets_add_linearly(self):
        self.assertAlmostEqual(
            submission.systematic_sum(WORKED_BIASES), 0.10, delta=1e-15,
            msg="expected 0.10 mm from biases 0.01/0.04/0.03/0.02; a value near 0.055 mm likely means the biases were combined as an RSS - check they add in magnitude")

    def test_the_worked_three_sigma_budget(self):
        # 0.10 mm of systematic bias plus three sigma of 0.10863 mm: 0.4259 mm against a 0.50 spec.
        total = submission.error_budget_3sigma(WORKED_BIASES, WORKED_SIGMAS)
        self.assertAlmostEqual(
            total, 0.4258834, delta=1e-6,
            msg="expected 0.4259 mm = 0.10 bias + 3 x 0.1086 sigma; a 0.3259 mm answer likely means the systematic sum was dropped - check the bias term is added once")
        self.assertLess(
            total, 0.50,
            msg="expected the worked budget under the 0.50 mm spec; a bigger number likely means the sigmas were added linearly or a bias was scaled five times - check which term grew")

    def test_the_gate_test_three_sigma_budget(self):
        # b = 0.05 mm, sigmas 0.06 and 0.08 mm: 0.05 + 3 * 0.10 = 0.35 mm.
        self.assertAlmostEqual(
            submission.error_budget_3sigma((0.05,), (0.06, 0.08)),
            0.35, delta=1e-12,
            msg="expected 0.35 mm = 0.05 + 3 x 0.10 from sigmas 0.06 and 0.08; a 0.15 mm answer likely means the three-sigma factor is missing - check the multiplier")

    def test_a_negative_bias_still_costs_accuracy(self):
        # An offset of -0.02 mm is an error, not a credit: 0.05 + 0.02 = 0.07 mm.
        self.assertAlmostEqual(
            submission.error_budget_3sigma((0.05, -0.02), (0.0, 0.0)),
            0.07, delta=1e-12,
            msg="expected the -0.02 mm offset to add 0.02 mm of error, giving 0.07; a 0.03 mm answer likely means the signs cancelled - check abs() before summing biases")

    def test_sensitivities_scale_each_source(self):
        # A 0.01 mm bias seen through a 2x lever arm is 0.02 mm, and 0.02 mm of sigma is 0.04.
        self.assertAlmostEqual(
            submission.error_budget_3sigma((0.01,), (0.02,), sensitivities=(2.0,)),
            0.14, delta=1e-12,
            msg="expected 0.14 mm with sensitivity 2.0: bias 0.02 and three sigma of 0.04; a 0.08 mm answer likely means only the bias was scaled - check both lists use the sensitivity")

    def test_a_single_bias_may_face_two_random_sources(self):
        # The Gate test's own shape: one 0.05 mm offset, sigma 0.06 and 0.08. The lists are
        # separate sums, so they do not have to pair up.
        self.assertAlmostEqual(
            submission.error_budget_3sigma((0.05,), (0.06, 0.08)),
            0.35, delta=1e-12,
            msg="expected 0.35 mm from one 0.05 bias and sigmas 0.06/0.08; a ValueError likely means the lists were zipped - check the two sums stay independent")

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
        self.assertAlmostEqual(
            submission.variance_fraction(2, (0.03, 0.04, 0.12)),
            144.0 / 169.0, delta=1e-12,
            msg="expected 144/169 = 0.8521 for the 0.12 mm source; a much smaller fraction likely means the denominator is the sum of sigmas, not of their squares - check it")

    def test_the_fractions_sum_to_one(self):
        sigmas = (0.03, 0.06, 0.08, 0.03)
        total = sum(submission.variance_fraction(i, sigmas) for i in range(len(sigmas)))
        self.assertAlmostEqual(
            total, 1.0, delta=1e-12,
            msg="expected the variance fractions to sum to 1.0; a sum above or below it likely means a source was skipped or counted twice - check the loop covers every sigma")

    def test_the_dominant_source_is_the_largest(self):
        sigmas = (0.03, 0.06, 0.08, 0.03)
        fractions = [submission.variance_fraction(i, sigmas) for i in range(len(sigmas))]
        self.assertEqual(
            fractions.index(max(fractions)), 2,
            msg="expected the 0.08 mm source at index 2 to dominate; another index likely means the fractions were sorted or read from a different list - check the index order")
        self.assertGreater(
            max(fractions), 0.5,
            msg="expected the dominant source to hold more than half the variance; a smaller value likely means one large sigma is being divided across equal shares - check the sigmas")

    def test_a_zero_variance_budget_is_refused(self):
        with self.assertRaises(ValueError):
            submission.variance_fraction(0, (0.0, 0.0))
        with self.assertRaises(ValueError):
            submission.variance_fraction(3, (0.03, 0.04))


class LatencyTests(unittest.TestCase):
    def test_the_gate_test_zoh_delay(self):
        # Half of a 1000 us sample period is 500 us of pure delay.
        self.assertAlmostEqual(
            submission.zoh_delay_us(1000.0), 500.0, delta=1e-12,
            msg="expected half of a 1000 us sample period, 500 us; a full 1000 us likely means the zero-order hold was not halved - check the 0.5 factor")
        self.assertAlmostEqual(
            submission.zoh_delay_us(2000.0), 1000.0, delta=1e-12,
            msg="expected 1000 us for a 2000 us period, so the delay scales with Ts; a 2000 us answer likely means the halving is missing - check the function halves inside")

    def test_the_worked_total_delay(self):
        # 20 + 180 + 250 + 150 + 500 = 1100 us = 0.0011 s.
        self.assertAlmostEqual(
            submission.total_latency_s(20.0, 180.0, 250.0, 150.0, 1000.0),
            0.0011, delta=1e-15,
            msg="expected 1100 us = 20+180+250+150+500; a 600 us answer likely means the ZOH half-period was left out - check the last argument is used")

    def test_the_exercise_total_delay(self):
        # The 10-tap moving average turns 250 us into 2550 us: 3400 us = 0.0034 s.
        self.assertAlmostEqual(
            submission.total_latency_s(20.0, 180.0, 2550.0, 150.0, 1000.0),
            0.0034, delta=1e-15,
            msg="expected 3400 us with the 10-tap average at 2550 us; 1100 us likely means the filter term was not substituted - check the third argument")

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
        self.assertAlmostEqual(
            margin, 52.546196, delta=1e-6,
            msg="expected 62.0 - 9.4538 = 52.5462 deg; a value near 9.45 likely means the delay was reported as the margin - check the subtraction order")
        self.assertGreater(
            margin, 45.0,
            msg="expected the worked margin to clear the 45 deg floor; a smaller value likely means the delay was converted with the wrong radians factor - check 180/pi")

    def test_the_exercise_net_margin(self):
        # 150 * 0.0034 = 0.51 rad = 29.2208 deg, so 62.0 - 29.2208 = 32.7792 deg: NO-GO.
        margin = submission.net_phase_margin_deg(62.0, 150.0, 0.0034)
        self.assertAlmostEqual(
            margin, 32.779152, delta=1e-6,
            msg="expected 62.0 - 29.2208 = 32.7792 deg; a value near 52.5 likely means the 0.0011 s delay was reused - check the third argument")
        self.assertLess(
            margin, 45.0,
            msg="expected the exercise margin below the 45 deg floor; a pass here likely means the extra 2.4 ms of filter latency was ignored - check the latency chain")

    def test_the_skip_test_net_margin(self):
        # 60.0 - 200 * 0.001 * 180/pi = 60.0 - 11.4592 = 48.5408 deg.
        self.assertAlmostEqual(
            submission.net_phase_margin_deg(60.0, 200.0, 0.001),
            48.540844, delta=1e-6,
            msg="expected 60.0 - 11.4592 = 48.5408 deg; a value near 0.847 likely means the result stayed in radians - check the 180/pi conversion")

    def test_the_gate_test_max_delay(self):
        # A 0.20 rad budget at 200 rad/s is 1.0 ms.
        self.assertAlmostEqual(
            submission.max_allowable_delay_ms(0.20, 200.0), 1.0, delta=1e-12,
            msg="expected 0.20 rad / 200 rad/s = 1.0 ms; a value near 0.001 likely means seconds were returned instead of milliseconds - check the unit conversion")

    def test_the_45_degree_floor_in_delay(self):
        # 62 - 45 = 17 deg = 0.29671 rad; at 150 rad/s that is 1.97804 ms of total delay.
        budget = (62.0 - 45.0) * math.pi / 180.0
        delay = submission.max_allowable_delay_ms(budget, 150.0)
        self.assertAlmostEqual(
            delay, 1.978039819, delta=1e-9,
            msg="expected 0.29671 rad / 150 rad/s = 1.978 ms; a value near 0.0013 likely means the budget was passed in degrees - check the radians conversion")
        self.assertGreater(
            delay, 1.0,
            msg="expected a budget above 1 ms; a smaller value likely means the full 62 deg margin was used instead of the 17 deg floor - check the subtraction")

    def test_a_zero_crossover_has_no_delay_budget(self):
        with self.assertRaises(ValueError):
            submission.max_allowable_delay_ms(0.2, 0.0)
        with self.assertRaises(ValueError):
            submission.net_phase_margin_deg(60.0, -150.0, 0.001)


class SignoffTests(unittest.TestCase):
    def test_the_worked_example_is_go(self):
        self.assertTrue(
            submission.capstone_signoff(0.4258834, 52.546196, 0.42, 60.0, True),
            msg="expected a GO when every gate is inside its window; a NO-GO here likely means a comparison became strict - check each bound against the spec")

    def test_the_exercise_is_no_go(self):
        # Every other gate passes; the eroded phase margin alone blocks first motion.
        self.assertFalse(
            submission.capstone_signoff(0.4258834, 32.779152, 0.42, 60.0, True),
            msg="expected NO-GO on the eroded 32.78 deg margin alone; a GO likely means the margin gate is not read - check the second argument")

    def test_the_sto_gate_is_mandatory(self):
        # Four of five is NO-GO: an unverified Category 3 STO is a hard stop.
        self.assertFalse(
            submission.capstone_signoff(0.20, 52.5, 0.42, 60.0, False),
            msg="expected NO-GO with STO unverified even though four gates pass; a GO likely means the boolean is ignored - check the last argument blocks first")

    def test_out_of_window_termination_is_no_go(self):
        self.assertFalse(
            submission.capstone_signoff(0.20, 52.5, 0.42, 50.0, True),
            msg="expected NO-GO at 50 C, below the 55-65 C window; a GO likely means the lower bound is exclusive or missing - check the comparison")
        self.assertFalse(
            submission.capstone_signoff(0.20, 52.5, 0.42, 66.0, True),
            msg="expected NO-GO at 66 C, above the window; a GO likely means only the lower bound is checked - check the upper bound too")

    def test_boundaries_are_inclusive(self):
        self.assertTrue(
            submission.capstone_signoff(0.20, 52.5, 0.42, 55.0, True),
            msg="expected 55 C on the lower edge to pass; a NO-GO likely means the window bound is written as a strict inequality - check <=")
        self.assertTrue(
            submission.capstone_signoff(0.20, 52.5, 0.42, 65.0, True),
            msg="expected 65 C on the upper edge to pass; a NO-GO likely means the upper bound excludes equality - check <=")
        self.assertTrue(
            submission.capstone_signoff(0.20, 45.0, 0.42, 60.0, True),
            msg="expected exactly 45.0 deg to clear the floor; a NO-GO likely means the margin comparison is strict - check >=")

    def test_cpu_over_budget_is_no_go(self):
        self.assertTrue(
            submission.capstone_signoff(0.20, 52.5, 0.70, 60.0, True),
            msg="expected 0.70 CPU to pass its 0.70 budget; a NO-GO likely means the CPU comparison is strict - check the inclusive bound")
        self.assertFalse(
            submission.capstone_signoff(0.20, 52.5, 0.71, 60.0, True),
            msg="expected 0.71 CPU over budget to be NO-GO; a GO likely means the CPU term is never compared - check the third argument")

    def test_the_spec_boundary_is_inclusive(self):
        self.assertTrue(
            submission.capstone_signoff(0.50, 52.5, 0.42, 60.0, True),
            msg="expected exactly 0.50 mm to pass the spec; a NO-GO likely means the spec comparison excludes equality - check <=")
        self.assertFalse(
            submission.capstone_signoff(0.5001, 52.5, 0.42, 60.0, True),
            msg="expected 0.5001 mm to fail the spec; a GO likely means the budget is rounded before the check - check the tolerance")

    def test_a_non_bool_sto_is_refused(self):
        with self.assertRaises(ValueError):
            submission.capstone_signoff(0.20, 52.5, 0.42, 60.0, 1)


if __name__ == "__main__":
    unittest.main()
