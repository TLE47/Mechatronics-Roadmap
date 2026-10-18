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
        self.assertAlmostEqual(
            plant.DT, 1e-3, delta=1e-15,
            msg="expected the plant's integration step to be exactly 1 ms; another step likely "
                "came from a different solver or a seconds/milliseconds mix-up - check plant.DT",
        )
        self.assertAlmostEqual(
            1.0 / plant.DT, 1000.0, delta=1e-9,
            msg="expected the plant's tick to be the 1 kHz ISR rate; a value near 100 or 10000 "
                "likely means DT was read in the wrong units - check 1 / plant.DT",
        )
        # The worked example's 45 us ISR, at the plant's own rate, is 4.5 % of the CPU.
        self.assertAlmostEqual(
            submission.isr_utilization_pct(45.0, 1.0 / plant.DT), 4.5, delta=1e-9,
            msg="expected 4.5 percent for the worked 45 us ISR at the plant's 1 kHz; another "
                "value likely used the nominal rate instead of the plant's - check 1 / plant.DT",
        )

    def test_one_second_of_plant_time_is_a_thousand_ticks(self):
        self.assertAlmostEqual(
            plant.TICKS * plant.DT, 1.0, delta=1e-12,
            msg="expected the plant's tick count times its step to be exactly one second; another "
                "product likely mixed TICKS with a different DT - check both come from the plant",
        )
        self.assertEqual(
            submission.ticks_in(1_000_000, 1000), plant.TICKS,
            msg="expected one second of 1 ms ticks to count plant.TICKS complete ticks; a "
                "different count likely divided by the wrong period - check 1e6 us / 1000 us",
        )

    def test_ten_kilohertz_fits_ten_times_into_one_plant_tick(self):
        self.assertEqual(
            submission.ticks_in(1000, 100), 10,
            msg="expected ten 100 us ticks inside one 1 ms plant tick; 0.1 or 100 likely inverted "
                "the division - check window divided by period",
        )

    def test_the_ten_kilohertz_budget_leaves_the_rest_of_the_tick(self):
        budget = submission.max_isr_exec_us(25.0, 10_000.0)
        self.assertAlmostEqual(
            budget, 25.0, delta=1e-12,
            msg="expected a 25 percent share of a 100 us period to be 25 us; 2.5 or 250 likely "
                "applied the percent once too often - check u_max_pct / 100 first",
        )
        # 1000 - 25 = 975 us of the plant's tick remain for telemetry and the state machine.
        self.assertAlmostEqual(
            975.0 / 1000.0, 0.975, delta=1e-12,
            msg="expected 975 of 1000 us to be 97.5 percent of the tick; 0.025 likely measured "
                "the budget instead of what it leaves - check the remaining fraction",
        )
        self.assertAlmostEqual(
            100.0 - 100.0 * budget * 1e-6 * 10_000.0, 75.0, delta=1e-9,
            msg="expected the other 75 percent of the 10 kHz period to remain; a negative or tiny "
                "remainder likely used the period in the wrong units - check 1e-6 * 10000",
        )

    def test_a_forty_five_microsecond_isr_spends_forty_five_milliseconds_a_second(self):
        per_tick = 45.0
        total_us = per_tick * plant.TICKS
        self.assertAlmostEqual(
            total_us, 45_000.0, delta=1e-9,
            msg="expected 45 us per tick over 1000 ticks to be 45000 us; 45 or 4.5e7 likely read "
                "the plant tick count wrong - check the product with plant.TICKS",
        )
        self.assertAlmostEqual(
            total_us / 1_000_000.0, 0.045, delta=1e-12,
            msg="expected 45000 us to be 0.045 s, 4.5 percent of a second; 45 likely skipped the "
                "microsecond scaling - check the division by 1e6",
        )
        self.assertAlmostEqual(
            submission.isr_utilization_pct(per_tick, 1000.0), 4.5, delta=1e-9,
            msg="expected the same 4.5 percent the module worked out, measured on the plant's "
                "clock; another value likely used plant.DT as a rate - check 1000 Hz is 1 / 1 ms",
        )

    def test_the_uint32_wrap_lands_on_the_same_grid(self):
        # 2**32 us is 71.58 minutes of micros(); the deadline after the wrap is 999, not 0x3E7+period.
        self.assertAlmostEqual(
            2 ** 32 / 1e6 / 60.0, 71.58278826666667, delta=1e-9,
            msg="expected a 32-bit microsecond counter to wrap after 71.58 minutes; 71.58 hours "
                "or 1193 minutes likely used the wrong divisor - check 2**32 us / 1e6 / 60",
        )
        self.assertEqual(
            submission.next_deadline_us(0xFFFFFFFF, 1000), 999,
            msg="expected the first deadline after the 32-bit wrap to be 999 us; a huge value "
                "likely returned the unmasked sum - check the mask is applied to the result",
        )
        self.assertTrue(
            submission.tick_due(999, 0xFFFFFFFF, 1000),
            msg="expected the tick at 999 us to be due across the wrap from 0xFFFFFFFF; False "
                "likely subtracted without the mask and saw a negative elapsed time",
        )

    def test_the_debounced_fault_fits_inside_a_plant_tick(self):
        # Three samples at 20 kHz is 150 us - 15 % of one 1 ms plant tick.
        latency = submission.fault_latency_us(3, 20_000.0)
        self.assertAlmostEqual(
            latency, 150.0, delta=1e-9,
            msg="expected three 20 kHz samples to span 150 us; 3000 likely used a 1 kHz sample "
                "rate - check 3 * 1e6 / 20000",
        )
        self.assertAlmostEqual(
            latency / (plant.DT * 1e6), 0.15, delta=1e-12,
            msg="expected the 150 us debounce to be 15 percent of the plant's 1 ms tick; 150 "
                "likely divided by DT in seconds instead of microseconds - check DT * 1e6",
        )
        # At the plant's 1 kHz the same three-sample debounce costs 3000 us - three whole ticks.
        self.assertAlmostEqual(
            submission.fault_latency_us(3, 1.0 / plant.DT) / 1000.0, 3.0, delta=1e-12,
            msg="expected three samples at the plant's 1 kHz to cost exactly three ticks; 3000 "
                "likely left the answer in microseconds - check the division by 1000",
        )


if __name__ == "__main__":
    unittest.main()
