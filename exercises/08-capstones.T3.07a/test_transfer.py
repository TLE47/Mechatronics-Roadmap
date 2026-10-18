"""Transfer tests for 08-capstones.T3.07a - the same three budgets on the plant's own numbers.

Four claims:
  1. one count of the plant's 12-bit encoder, seen at the full 0.20 m reach, is 0.3068 mm of
     spatial error - so at 3 sigma the encoder alone blows a 0.50 mm capstone spec;
  2. the plant's 1 kHz tick is exactly the worked example's 1000 us sample period, and its ZOH
     costs 500 us of the 1100 us chain;
  3. at 150 rad/s crossover, one plant tick of delay erodes 8.59 degrees of phase margin;
  4. the 17 degrees between the nominal margin and the 45 degree floor buys 1.978 ms, and the
     module's 10-tap filter spends nearly twice that on its own.
"""

import math
import unittest

import harness

submission = harness.load_submission()
plant = harness.plant

ONE_COUNT_MM = (2.0 * math.pi / 4096.0) * 0.20 * 1e3


class EncoderBudgetTests(unittest.TestCase):
    def test_one_encoder_count_at_full_reach(self):
        # 2*pi/4096 rad * 0.20 m = 0.30680 mm.
        self.assertAlmostEqual(
            ONE_COUNT_MM, 0.3067961575771282, delta=1e-15,
            msg="expected one 4096-count step at the 0.20 m reach to be 0.3068 mm; a value near "
                "0.1534 means 8192 was used for the count, which would halve the real error - "
                "check the encoder resolution",
        )
        self.assertLess(
            ONE_COUNT_MM, 0.50,
            msg="expected a single count to sit under the 0.50 mm spec on its own, which is why "
                "the budget is not hopeless; a larger value means the reach or the count is "
                "wrong - check the 0.20 m lever",
        )

    def test_three_sigma_of_the_encoder_alone_breaks_the_spec(self):
        # 3 * 0.30680 = 0.92039 mm: already no-go before any other source is counted.
        total = submission.error_budget_3sigma((0.0,), (ONE_COUNT_MM,))
        self.assertAlmostEqual(
            total, 0.920388473, delta=1e-9,
            msg="expected 3 sigma of the encoder alone to be 0.92039 mm; a third of that means "
                "the coverage factor was dropped - check nsig multiplies the RSS term",
        )
        self.assertGreater(
            total, 0.50,
            msg="expected the encoder alone to blow the 0.50 mm capstone spec at 3 sigma, the "
                "result that forces a finer sensor; a smaller total means the RSS or the "
                "coverage factor was applied wrongly",
        )

    def test_it_stays_no_go_when_the_link_deflection_is_added(self):
        # The module's 0.08 mm deflection adds in quadrature: 3 * 0.31706 = 0.95117 mm.
        total = submission.error_budget_3sigma((0.0, 0.0), (ONE_COUNT_MM, 0.08))
        self.assertAlmostEqual(
            total, 0.951165, delta=1e-6,
            msg="expected the 0.3068 mm count and the 0.08 mm deflection to add in quadrature to "
                "0.95117 mm at 3 sigma; 1.160 means the contributions were added linearly, which "
                "overstates independent errors",
        )
        self.assertFalse(
            submission.capstone_signoff(total, 53.405633, 0.42, 60.0, True),
            msg="expected a 0.95117 mm error to fail sign-off, since only four of the five "
                "domains pass; True means the budget check is not part of the gate - check the "
                "error term against e_spec_mm",
        )

    def test_the_encoder_owns_the_variance(self):
        # 0.30680^2 against 0.08^2: the encoder carries ~94% of the variance.
        fraction = submission.variance_fraction(0, (ONE_COUNT_MM, 0.08))
        self.assertGreater(
            fraction, 0.93,
            msg="expected the encoder to own more than 93 percent of the variance, since its "
                "contribution is nearly four times the deflection's; a smaller share means the "
                "squares were not taken - check s_i sigma_i squared",
        )
        self.assertLess(
            fraction, 0.94,
            msg="expected that share to stay under 94 percent, 0.9364 at these two sources; a "
                "larger value means the deflection was dropped from the denominator",
        )
        self.assertAlmostEqual(
            fraction + submission.variance_fraction(1, (ONE_COUNT_MM, 0.08)), 1.0, delta=1e-12,
            msg="expected the two sources' variance fractions to sum to exactly one, the property "
                "that makes the split meaningful; a different total means the denominator is not "
                "the full sum of squares",
        )


class PlantTimingTests(unittest.TestCase):
    def test_the_plant_tick_is_the_worked_sample_period(self):
        tick_us = plant.DT * 1e6
        self.assertAlmostEqual(
            tick_us, 1000.0, delta=1e-9,
            msg="expected the plant's tick to be the module's 1000 us sample period; another "
                "figure means the latency chain below is measured against a different loop - "
                "check plant.DT",
        )
        self.assertAlmostEqual(
            submission.zoh_delay_us(tick_us), 500.0, delta=1e-12,
            msg="expected the zero-order hold to cost half a sample period, 500 us; a full 1000 "
                "means the ZOH was charged double, which would halve the allowable margin",
        )

    def test_the_plant_tick_sets_the_erosion(self):
        # 150 rad/s * 0.001 s = 0.15 rad = 8.5944 deg, leaving 53.4056 deg of the nominal 62.
        margin = submission.net_phase_margin_deg(62.0, 150.0, plant.DT)
        self.assertAlmostEqual(
            margin, 53.405633073, delta=1e-9,
            msg="expected one plant tick at 150 rad/s to leave 53.4056 degrees of the nominal 62; "
                "53.57 means the tick was converted with 57.2958 instead of 57.29578 - check the "
                "radian-to-degree factor",
        )
        self.assertGreater(
            margin, 45.0,
            msg="expected the single-tick chain to stay above the 45 degree floor, so one tick "
                "alone is survivable; a smaller margin means the crossover or the delay is larger "
                "than the module states",
        )

    def test_the_floor_is_almost_two_plant_ticks(self):
        budget = (62.0 - 45.0) * math.pi / 180.0
        delay_ms = submission.max_allowable_delay_ms(budget, 150.0)
        self.assertAlmostEqual(
            delay_ms, 1.978039819, delta=1e-9,
            msg="expected the 17 degrees of spare margin at 150 rad/s to buy 1.978 ms of delay; a "
                "value 1000 times larger means the budget was left in radians - check the "
                "millisecond scaling",
        )
        self.assertLess(
            delay_ms, 2.0 * plant.DT * 1e3,
            msg="expected that allowance to fall just short of two plant ticks, 2 ms; a larger "
                "figure means the phase budget was overstated and the module's filter swap would "
                "look affordable when it is not",
        )

    def test_the_modules_filter_swap_spends_the_margin(self):
        # 20 + 180 + 2550 + 150 + 500 = 3400 us: 32.78 deg, below the 45 deg floor.
        tau = submission.total_latency_s(20.0, 180.0, 2550.0, 150.0, plant.DT * 1e6)
        self.assertAlmostEqual(
            tau, 0.0034, delta=1e-12,
            msg="expected the sensor, bus, filter, compute and half-tick paths to sum to 3.4 ms; "
                "a value near 0.0029 means the zero-order hold was left out of the chain",
        )
        margin = submission.net_phase_margin_deg(62.0, 150.0, tau)
        self.assertAlmostEqual(
            margin, 32.779152448, delta=1e-9,
            msg="expected 3.4 ms at 150 rad/s to erode the margin to 32.779 degrees; a larger "
                "margin means the total latency is smaller than the module's own sum - check "
                "every term is included once",
        )
        self.assertFalse(
            submission.capstone_signoff(0.4258834, margin, 0.42, 60.0, True),
            msg="expected the 10-tap filter swap to fail sign-off by the phase domain alone, with "
                "error, CPU and CAN all passing; True means the margin check is not part of the "
                "gate - check pm_net_deg against pm_min_deg",
        )


if __name__ == "__main__":
    unittest.main()
