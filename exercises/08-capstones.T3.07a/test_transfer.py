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
        self.assertAlmostEqual(ONE_COUNT_MM, 0.3067961575771282, delta=1e-15)
        self.assertLess(ONE_COUNT_MM, 0.50)

    def test_three_sigma_of_the_encoder_alone_breaks_the_spec(self):
        # 3 * 0.30680 = 0.92039 mm: already no-go before any other source is counted.
        total = submission.error_budget_3sigma((0.0,), (ONE_COUNT_MM,))
        self.assertAlmostEqual(total, 0.920388473, delta=1e-9)
        self.assertGreater(total, 0.50)

    def test_it_stays_no_go_when_the_link_deflection_is_added(self):
        # The module's 0.08 mm deflection adds in quadrature: 3 * 0.31706 = 0.95117 mm.
        total = submission.error_budget_3sigma((0.0, 0.0), (ONE_COUNT_MM, 0.08))
        self.assertAlmostEqual(total, 0.951165, delta=1e-6)
        self.assertFalse(submission.capstone_signoff(total, 53.405633, 0.42, 60.0, True))

    def test_the_encoder_owns_the_variance(self):
        # 0.30680^2 against 0.08^2: the encoder carries ~94% of the variance.
        fraction = submission.variance_fraction(0, (ONE_COUNT_MM, 0.08))
        self.assertGreater(fraction, 0.93)
        self.assertLess(fraction, 0.94)
        self.assertAlmostEqual(fraction + submission.variance_fraction(1, (ONE_COUNT_MM, 0.08)),
                               1.0, delta=1e-12)


class PlantTimingTests(unittest.TestCase):
    def test_the_plant_tick_is_the_worked_sample_period(self):
        tick_us = plant.DT * 1e6
        self.assertAlmostEqual(tick_us, 1000.0, delta=1e-9)
        self.assertAlmostEqual(submission.zoh_delay_us(tick_us), 500.0, delta=1e-12)

    def test_the_plant_tick_sets_the_erosion(self):
        # 150 rad/s * 0.001 s = 0.15 rad = 8.5944 deg, leaving 53.4056 deg of the nominal 62.
        margin = submission.net_phase_margin_deg(62.0, 150.0, plant.DT)
        self.assertAlmostEqual(margin, 53.405633073, delta=1e-9)
        self.assertGreater(margin, 45.0)

    def test_the_floor_is_almost_two_plant_ticks(self):
        budget = (62.0 - 45.0) * math.pi / 180.0
        delay_ms = submission.max_allowable_delay_ms(budget, 150.0)
        self.assertAlmostEqual(delay_ms, 1.978039819, delta=1e-9)
        self.assertLess(delay_ms, 2.0 * plant.DT * 1e3)

    def test_the_modules_filter_swap_spends_the_margin(self):
        # 20 + 180 + 2550 + 150 + 500 = 3400 us: 32.78 deg, below the 45 deg floor.
        tau = submission.total_latency_s(20.0, 180.0, 2550.0, 150.0, plant.DT * 1e6)
        self.assertAlmostEqual(tau, 0.0034, delta=1e-12)
        margin = submission.net_phase_margin_deg(62.0, 150.0, tau)
        self.assertAlmostEqual(margin, 32.779152448, delta=1e-9)
        self.assertFalse(submission.capstone_signoff(0.4258834, margin, 0.42, 60.0, True))


if __name__ == "__main__":
    unittest.main()
