"""Behaviour tests for 00-foundations.T1.00a.

Each test names the mistake it catches:
  * a battery loop written as `range(1, n_steps)`, which runs nine times instead of ten and returns
    10.65 V where the module's exercise promises 10.5 V;
  * a step counter that returns the position it reached instead of the number of ticks;
  * a clamp with its branches swapped, which passes the over-limit value through and pins the
    in-range one to the ceiling;
  * a `try/except` that swallows the ZeroDivisionError and reports success;
  * a format that drops the .3f, printing `1.0` where the worked example prints `1.000`.
"""

import unittest

import harness

submission = harness.load_submission()


class WorkedExampleTests(unittest.TestCase):
    def test_the_worked_example_step_count(self):
        # 1.0 m at 0.5 m/s in 0.25 s ticks is eight 0.125 m steps.
        self.assertEqual(
            submission.steps_to_target(0.0, 0.5, 0.25, 1.0), 8,
            msg="expected eight 0.125 m ticks to cover one metre; 7 likely stopped one tick "
                "short, 9 likely started counting before the first move",
        )

    def test_the_single_step_position(self):
        self.assertAlmostEqual(
            submission.step_position(0.0, 0.5, 0.25), 0.125, delta=1e-12,
            msg="expected 0.5 m/s for 0.25 s to move 0.125 m; 0.5 likely returned the speed and "
                "0.0625 halved the step - check v * dt",
        )

    def test_the_assignment_updates_from_the_right_hand_side(self):
        # §3 item 1: 0.25 m + 0.125 m = 0.375 m.
        self.assertAlmostEqual(
            submission.step_position(0.25, 0.5, 0.25), 0.375, delta=1e-12,
            msg="expected the new position to be the old one plus the step, 0.375 m; 0.125 means "
                "the old position was overwritten before it was read",
        )

    def test_a_late_start_needs_fewer_steps(self):
        # A tick is 0.125 m, not 0.25 m: from 0.25 m it takes six of them to land exactly on 1.0.
        self.assertEqual(
            submission.steps_to_target(0.25, 0.5, 0.25, 1.0), 6,
            msg="expected six 0.125 m ticks from 0.25 m to reach the target; 8 likely counted "
                "from the origin instead of the start - check pos_0",
        )
        self.assertAlmostEqual(
            0.25 + 6 * 0.125, 1.0, delta=1e-12,
            msg="expected six ticks of 0.125 m from 0.25 m to land exactly on the target; another "
                "count would overshoot or fall short - check the arithmetic",
        )

    def test_a_zero_time_step_is_refused(self):
        with self.assertRaises(ValueError):
            submission.steps_to_target(0.0, 0.5, 0.0, 1.0)

    def test_a_backwards_time_step_is_refused(self):
        with self.assertRaises(ValueError):
            submission.step_position(0.0, 0.5, -0.25)

    def test_a_stationary_robot_never_arrives(self):
        with self.assertRaises(ValueError):
            submission.steps_to_target(0.0, 0.0, 0.25, 1.0)


class BatteryTests(unittest.TestCase):
    def test_the_exercise_battery_sag(self):
        # 12.0 V less ten 0.15 V drops is 10.5 V.
        self.assertAlmostEqual(
            submission.battery_voltage_after_steps(12.0, 0.15, 10),
            10.5, delta=1e-6,
            msg="expected ten drops of 0.15 V to leave 10.5 V; 10.65 is nine drops, the module's "
                "named off-by-one - check range(n) has n terms",
        )

    def test_the_off_by_one_wrong_answer(self):
        # The module names 10.65 V as what nine drops give - the number a short range produces.
        self.assertAlmostEqual(
            submission.battery_voltage_after_steps(12.0, 0.15, 9),
            10.65, delta=1e-6,
            msg="expected nine drops to leave 10.65 V, so the wrong answer is distinguishable; a "
                "value of 10.5 would mean the count is ignored",
        )

    def test_zero_steps_is_the_starting_voltage(self):
        # range(0) runs zero times: the loop body must not run once "to get started".
        self.assertAlmostEqual(
            submission.battery_voltage_after_steps(12.0, 0.15, 0),
            12.0, delta=1e-12,
            msg="expected zero steps to leave the battery untouched at 12.0 V; 11.85 means the "
                "loop body ran once regardless - check range(0) is empty",
        )

    def test_twenty_steps_at_the_same_drop(self):
        self.assertAlmostEqual(
            submission.battery_voltage_after_steps(12.0, 0.15, 20),
            9.0, delta=1e-6,
            msg="expected twenty drops to leave 9.0 V; 9.15 means one drop was skipped - check "
                "the count is applied in full",
        )

    def test_a_negative_step_count_is_refused(self):
        with self.assertRaises(ValueError):
            submission.battery_voltage_after_steps(12.0, 0.15, -1)


class LoopTests(unittest.TestCase):
    def test_the_skip_test_loop_total(self):
        # 0 + 2 + 4 + 6 = 12.
        self.assertEqual(
            submission.loop_total(4), 12,
            msg="expected 0 + 2 + 4 + 6 = 12 for range(4); 20 likely included i = 4, which range "
                "does not produce - check the stop bound",
        )

    def test_range_runs_zero_times(self):
        self.assertEqual(
            submission.loop_total(0), 0,
            msg="expected range(0) to add nothing; a nonzero total means the loop ran once "
                "before checking its bound",
        )

    def test_the_sum_is_n_times_n_minus_one(self):
        # range(1000) ends at 999, so the total is 2 * (999 * 1000 / 2) = 999000.
        self.assertEqual(
            submission.loop_total(1000), 999000,
            msg="expected 999000 for range(1000), since the last index is 999; 1000000 means the "
                "loop ran a thousand-and-first time - check the final term",
        )

    def test_a_negative_count_is_refused(self):
        with self.assertRaises(ValueError):
            submission.loop_total(-4)


class ClampTests(unittest.TestCase):
    def test_the_skip_test_clamp(self):
        self.assertAlmostEqual(
            submission.clamp_pwm(1.35, 1.0), 1.0, delta=1e-12,
            msg="expected 1.35 to be pulled down to the 1.0 ceiling; 1.35 means the clamp "
                "branches are swapped - check the comparison",
        )

    def test_inside_the_ceiling_passes_through(self):
        self.assertAlmostEqual(
            submission.clamp_pwm(0.40, 1.0), 0.40, delta=1e-12,
            msg="expected a value inside the ceiling to pass through unchanged; 1.0 means every "
                "input is pinned to the limit - check only over-limit values clamp",
        )
        # Exactly on the limit is not over it.
        self.assertAlmostEqual(
            submission.clamp_pwm(1.0, 1.0), 1.0, delta=1e-12,
            msg="expected exactly the ceiling to pass through, since the test is strict; a "
                "different value likely used > and still clamped - check the boundary",
        )

    def test_the_clamp_is_one_sided(self):
        self.assertAlmostEqual(
            submission.clamp_pwm(-0.5, 1.0), -0.5, delta=1e-12,
            msg="expected a negative duty to pass through the one-sided clamp; 0.0 means a "
                "two-sided clamp was implemented instead",
        )

    def test_a_non_positive_ceiling_is_refused(self):
        with self.assertRaises(ValueError):
            submission.clamp_pwm(0.5, 0.0)


class TracebackTests(unittest.TestCase):
    def test_a_zero_denominator_reports_its_exception(self):
        self.assertEqual(
            submission.safe_divide(1.0, 0.0), (None, "ZeroDivisionError"),
            msg="expected a caught zero division to report (None, ZeroDivisionError); a number "
                "means the exception was swallowed, a message string means the type was not "
                "used",
        )

    def test_a_good_division_reports_no_error(self):
        value, error = submission.safe_divide(1.0, 0.25)
        self.assertAlmostEqual(
            value, 4.0, delta=1e-12,
            msg="expected 1.0 / 0.25 to be 4.0; another value likely inverted the operands - "
                "check the numerator and denominator order",
        )
        self.assertEqual(
            error, "",
            msg="expected a clean division to report an empty error name; a nonempty string "
                "means the guard flagged a failure that did not happen",
        )

    def test_the_name_is_the_exception_type_not_the_message(self):
        # The traceback's bottom line names the type: "ZeroDivisionError: float division by zero".
        self.assertEqual(
            submission.safe_divide(3.0, 0.0)[1], "ZeroDivisionError",
            msg="expected the exception type name, which is what a traceback's last line starts "
                "with; a sentence means str(exc) was returned instead",
        )
        self.assertEqual(
            submission.safe_divide(3.0, 0.0)[0], None,
            msg="expected no value when the division failed; a number means a default was "
                "substituted for the missing result",
        )


class FormatTests(unittest.TestCase):
    def test_the_three_decimal_format(self):
        self.assertEqual(
            submission.format_position(1.0), "1.000",
            msg="expected 1.0 to print with three decimals as 1.000; '1.0' means the .3f field "
                "was dropped - check the format string",
        )
        self.assertEqual(
            submission.format_position(0.125), "0.125",
            msg="expected 0.125 to keep all three decimals; '0.13' means the value was rounded "
                "to two places before formatting",
        )

    def test_rounding_to_three_decimals(self):
        self.assertEqual(
            submission.format_position(2.0 / 3.0), "0.667",
            msg="expected two thirds to round to 0.667 at three decimals; 0.666 means the format "
                "truncates instead of rounding",
        )

    def test_the_worked_example_line(self):
        line = "steps=%d, pos_m=%s m" % (submission.steps_to_target(0.0, 0.5, 0.25, 1.0),
                                        submission.format_position(1.0))
        self.assertEqual(
            line, "steps=8, pos_m=1.000 m",
            msg="expected the worked example's line to read steps=8, pos_m=1.000 m; a different "
                "step count or missing decimals means one of the two helpers is wrong",
        )


if __name__ == "__main__":
    unittest.main()
