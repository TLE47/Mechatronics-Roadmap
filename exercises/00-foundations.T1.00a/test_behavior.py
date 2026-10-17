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
        self.assertEqual(submission.steps_to_target(0.0, 0.5, 0.25, 1.0), 8)

    def test_the_single_step_position(self):
        self.assertAlmostEqual(submission.step_position(0.0, 0.5, 0.25), 0.125, delta=1e-12)

    def test_the_assignment_updates_from_the_right_hand_side(self):
        # §3 item 1: 0.25 m + 0.125 m = 0.375 m.
        self.assertAlmostEqual(submission.step_position(0.25, 0.5, 0.25), 0.375, delta=1e-12)

    def test_a_late_start_needs_fewer_steps(self):
        # A tick is 0.125 m, not 0.25 m: from 0.25 m it takes six of them to land exactly on 1.0.
        self.assertEqual(submission.steps_to_target(0.25, 0.5, 0.25, 1.0), 6)
        self.assertAlmostEqual(0.25 + 6 * 0.125, 1.0, delta=1e-12)

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
        self.assertAlmostEqual(submission.battery_voltage_after_steps(12.0, 0.15, 10),
                               10.5, delta=1e-6)

    def test_the_off_by_one_wrong_answer(self):
        # The module names 10.65 V as what nine drops give - the number a short range produces.
        self.assertAlmostEqual(submission.battery_voltage_after_steps(12.0, 0.15, 9),
                               10.65, delta=1e-6)

    def test_zero_steps_is_the_starting_voltage(self):
        # range(0) runs zero times: the loop body must not run once "to get started".
        self.assertAlmostEqual(submission.battery_voltage_after_steps(12.0, 0.15, 0),
                               12.0, delta=1e-12)

    def test_twenty_steps_at_the_same_drop(self):
        self.assertAlmostEqual(submission.battery_voltage_after_steps(12.0, 0.15, 20),
                               9.0, delta=1e-6)

    def test_a_negative_step_count_is_refused(self):
        with self.assertRaises(ValueError):
            submission.battery_voltage_after_steps(12.0, 0.15, -1)


class LoopTests(unittest.TestCase):
    def test_the_skip_test_loop_total(self):
        # 0 + 2 + 4 + 6 = 12.
        self.assertEqual(submission.loop_total(4), 12)

    def test_range_runs_zero_times(self):
        self.assertEqual(submission.loop_total(0), 0)

    def test_the_sum_is_n_times_n_minus_one(self):
        # range(1000) ends at 999, so the total is 2 * (999 * 1000 / 2) = 999000.
        self.assertEqual(submission.loop_total(1000), 999000)

    def test_a_negative_count_is_refused(self):
        with self.assertRaises(ValueError):
            submission.loop_total(-4)


class ClampTests(unittest.TestCase):
    def test_the_skip_test_clamp(self):
        self.assertAlmostEqual(submission.clamp_pwm(1.35, 1.0), 1.0, delta=1e-12)

    def test_inside_the_ceiling_passes_through(self):
        self.assertAlmostEqual(submission.clamp_pwm(0.40, 1.0), 0.40, delta=1e-12)
        # Exactly on the limit is not over it.
        self.assertAlmostEqual(submission.clamp_pwm(1.0, 1.0), 1.0, delta=1e-12)

    def test_the_clamp_is_one_sided(self):
        self.assertAlmostEqual(submission.clamp_pwm(-0.5, 1.0), -0.5, delta=1e-12)

    def test_a_non_positive_ceiling_is_refused(self):
        with self.assertRaises(ValueError):
            submission.clamp_pwm(0.5, 0.0)


class TracebackTests(unittest.TestCase):
    def test_a_zero_denominator_reports_its_exception(self):
        self.assertEqual(submission.safe_divide(1.0, 0.0), (None, "ZeroDivisionError"))

    def test_a_good_division_reports_no_error(self):
        value, error = submission.safe_divide(1.0, 0.25)
        self.assertAlmostEqual(value, 4.0, delta=1e-12)
        self.assertEqual(error, "")

    def test_the_name_is_the_exception_type_not_the_message(self):
        # The traceback's bottom line names the type: "ZeroDivisionError: float division by zero".
        self.assertEqual(submission.safe_divide(3.0, 0.0)[1], "ZeroDivisionError")
        self.assertEqual(submission.safe_divide(3.0, 0.0)[0], None)


class FormatTests(unittest.TestCase):
    def test_the_three_decimal_format(self):
        self.assertEqual(submission.format_position(1.0), "1.000")
        self.assertEqual(submission.format_position(0.125), "0.125")

    def test_rounding_to_three_decimals(self):
        self.assertEqual(submission.format_position(2.0 / 3.0), "0.667")

    def test_the_worked_example_line(self):
        line = "steps=%d, pos_m=%s m" % (submission.steps_to_target(0.0, 0.5, 0.25, 1.0),
                                        submission.format_position(1.0))
        self.assertEqual(line, "steps=8, pos_m=1.000 m")


if __name__ == "__main__":
    unittest.main()
