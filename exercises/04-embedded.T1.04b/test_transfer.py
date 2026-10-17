"""Transfer tests for 04-embedded.T1.04b - the same scheduler on the plant's own clock.

The plant integrates at `plant.DT` = 1 ms, so its tick *is* the module's 1 kHz ISR period. Six
claims follow: the two periods are the same number, a second of plant time is a thousand ticks,
a 10 kHz current loop fits ten times into one tick, its 25 % budget leaves 975 us of the tick for
telemetry and the state machine, a 45 us ISR spends 45 ms of every simulated second, and the
uint32 wrap of `micros()` lands back on the same 1000 us grid.
"""

import unittest

import harness

plant = harness.plant
submission = harness.load_submission()


class ThePlantsTickTests(unittest.TestCase):
    def test_the_plant_tick_is_the_one_kilohertz_isr_period(self):
        self.assertAlmostEqual(plant.DT, 1e-3, delta=1e-15)
        self.assertAlmostEqual(1.0 / plant.DT, 1000.0, delta=1e-9)
        # The worked example's 45 us ISR, at the plant's own rate, is 4.5 % of the CPU.
        self.assertAlmostEqual(submission.isr_utilization_pct(45.0, 1.0 / plant.DT), 4.5, delta=1e-9)

    def test_one_second_of_plant_time_is_a_thousand_ticks(self):
        self.assertAlmostEqual(plant.TICKS * plant.DT, 1.0, delta=1e-12)
        self.assertEqual(submission.ticks_in(1_000_000, 1000), plant.TICKS)

    def test_ten_kilohertz_fits_ten_times_into_one_plant_tick(self):
        self.assertEqual(submission.ticks_in(1000, 100), 10)

    def test_the_ten_kilohertz_budget_leaves_the_rest_of_the_tick(self):
        budget = submission.max_isr_exec_us(25.0, 10_000.0)
        self.assertAlmostEqual(budget, 25.0, delta=1e-12)
        # 1000 - 25 = 975 us of the plant's tick remain for telemetry and the state machine.
        self.assertAlmostEqual(975.0 / 1000.0, 0.975, delta=1e-12)
        self.assertAlmostEqual(100.0 - 100.0 * budget * 1e-6 * 10_000.0, 75.0, delta=1e-9)

    def test_a_forty_five_microsecond_isr_spends_forty_five_milliseconds_a_second(self):
        per_tick = 45.0
        total_us = per_tick * plant.TICKS
        self.assertAlmostEqual(total_us, 45_000.0, delta=1e-9)
        self.assertAlmostEqual(total_us / 1_000_000.0, 0.045, delta=1e-12)
        self.assertAlmostEqual(submission.isr_utilization_pct(per_tick, 1000.0), 4.5, delta=1e-9)

    def test_the_uint32_wrap_lands_on_the_same_grid(self):
        # 2**32 us is 71.58 minutes of micros(); the deadline after the wrap is 999, not 0x3E7+period.
        self.assertAlmostEqual(2 ** 32 / 1e6 / 60.0, 71.58278826666667, delta=1e-9)
        self.assertEqual(submission.next_deadline_us(0xFFFFFFFF, 1000), 999)
        self.assertTrue(submission.tick_due(999, 0xFFFFFFFF, 1000))

    def test_the_debounced_fault_fits_inside_a_plant_tick(self):
        # Three samples at 20 kHz is 150 us - 15 % of one 1 ms plant tick.
        latency = submission.fault_latency_us(3, 20_000.0)
        self.assertAlmostEqual(latency, 150.0, delta=1e-9)
        self.assertAlmostEqual(latency / (plant.DT * 1e6), 0.15, delta=1e-12)
        # At the plant's 1 kHz the same three-sample debounce costs 3000 us - three whole ticks.
        self.assertAlmostEqual(submission.fault_latency_us(3, 1.0 / plant.DT) / 1000.0, 3.0, delta=1e-12)


if __name__ == "__main__":
    unittest.main()
