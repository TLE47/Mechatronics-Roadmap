"""Transfer tests for 00-foundations.T1.00a - the same Python on the plant's own numbers.

Three claims, measured against `resources/plants/mechalab_plant.py`:
  1. the plant ticks at 1 kHz, so a 0.08 m/s move covers 0.08 m in exactly 1000 ticks of the
     `while` loop the module teaches, and each tick is 8e-5 m;
  2. `range(n)` has n terms and ends at n-1, so the plant's one-second run of 1000 ticks
     accumulates 2 * (999 * 1000 / 2) = 999000 in the Skip test's accumulator;
  3. the plant's 2.5 N*m joint clamp is the module's one-sided clamp, and its 0.001 s tick prints
     as `0.001` through the three-decimal format.
"""

import unittest

import harness

submission = harness.load_submission()
plant = harness.plant


class PlantTickTests(unittest.TestCase):
    def test_a_one_second_run_at_the_plant_tick(self):
        # 0.08 m/s * 0.001 s = 8e-5 m per tick, so 0.08 m takes 1000 ticks.
        tick_m = submission.step_position(0.0, 0.08, plant.DT)
        self.assertAlmostEqual(
            tick_m, 8e-05, delta=1e-15,
            msg="expected one plant tick at 0.08 m/s to cover 8e-5 m; 0.08 likely used a "
                "one-second step - check plant.DT",
        )
        self.assertEqual(
            submission.steps_to_target(0.0, 0.08, plant.DT, 0.08), 1000,
            msg="expected 1000 ticks of 8e-5 m to cover the 0.08 m target; 999 or 1001 likely "
                "counted the boundary wrongly - check the while condition",
        )

    def test_the_run_lands_on_the_target(self):
        pos_m = 0.0
        for _tick in range(1000):
            pos_m = submission.step_position(pos_m, 0.08, plant.DT)
        self.assertAlmostEqual(
            pos_m, 0.08, delta=1e-12,
            msg="expected one second of 0.08 m/s to land exactly on 0.08 m; a drift means the "
                "step used a rounded dt - check plant.DT is passed through",
        )

    def test_one_thousand_ticks_is_one_thousand_terms(self):
        # The last index range(1000) hands out is 999, not 1000.
        self.assertEqual(
            submission.loop_total(1000), 999000,
            msg="expected the accumulator to end at 999, giving 999000; 1000000 means the range "
                "reached 1000, which Python's range does not do",
        )


class TheClampOnThePlantTests(unittest.TestCase):
    def test_the_plant_torque_clamp(self):
        self.assertAlmostEqual(
            submission.clamp_pwm(4.0, plant.TAU_LIMIT), 2.5, delta=1e-12,
            msg="expected a 4.0 N m command to be clamped to the plant's 2.5 N m limit; 4.0 "
                "means the ceiling was not applied - check the argument order",
        )
        # One-sided: a torque command below the limit is not raised to it.
        self.assertAlmostEqual(
            submission.clamp_pwm(-4.0, plant.TAU_LIMIT), -4.0, delta=1e-12,
            msg="expected a negative command to pass through the one-sided clamp; -2.5 means a "
                "symmetric clamp was implemented, which the module does not ask for",
        )

    def test_the_plant_tick_renders_to_three_decimals(self):
        self.assertEqual(
            submission.format_position(plant.DT), "0.001",
            msg="expected the plant's 1 ms tick to print as 0.001; '0.0' means the decimals "
                "were dropped and the log would lose the tick entirely",
        )


class TheBusOnThePlantTests(unittest.TestCase):
    def test_the_same_sag_at_a_24_v_bus(self):
        # 24.0 V less ten 0.15 V drops is 22.5 V, the same loop at a different starting value.
        self.assertAlmostEqual(
            submission.battery_voltage_after_steps(24.0, 0.15, 10),
            22.5, delta=1e-6,
            msg="expected the same ten drops from a 24 V bus to leave 22.5 V; 22.65 means one "
                "drop was skipped - check the count is independent of the voltage",
        )

    def test_a_zero_tick_would_divide_by_zero(self):
        # The module's traceback case, expressed as the value the script would divide by.
        value, error = submission.safe_divide(0.08, 0.0)
        self.assertIsNone(
            value,
            msg="expected a zero division to return no value; a number means the exception was "
                "caught and a default substituted, which hides the bug",
        )
        self.assertEqual(
            error, "ZeroDivisionError",
            msg="expected the caught exception to be named by type; a sentence means the "
                "message was reported instead of the type",
        )

    def test_the_guard_catches_the_zero_tick_first(self):
        # The plant never hands out a zero DT, and the submission refuses one rather than looping.
        with self.assertRaises(ValueError):
            submission.steps_to_target(0.0, 0.08, 0.0, 0.08)


if __name__ == "__main__":
    unittest.main()
