"""Behaviour tests for 04-embedded.T2.04b.

Each test names the mistake it catches:
  * a utilisation sum that divides microseconds by milliseconds, reporting 0.000325 of a CPU
    for a task set that uses 32.5% of one;
  * a bound of 1.0 where Liu-Layland says 0.7798 for three tasks;
  * a response time that adds the medium-priority task even when the mutex inherits the
    priority, which is the very bug `xSemaphoreCreateMutex()` exists to prevent;
  * arbitration that hands the bus to the highest identifier instead of the lowest;
  * a pack scaled by 2^bits instead of 2^bits - 1, which lands one code high at full scale and
    makes the zero command asymmetric.
"""

import unittest

import harness

submission = harness.load_submission()

# The worked example's 3-task FreeRTOS actuator node, C and T both in microseconds.
WORKED_TASKS = [
    ("Ctrl_1kHz", 120.0, 1000.0),
    ("CAN_500Hz", 250.0, 2000.0),
    ("Diag_100Hz", 800.0, 10000.0),
]


class UtilizationTests(unittest.TestCase):
    def test_the_worked_utilisation(self):
        # 0.12 + 0.125 + 0.08 = 0.325 of the single core.
        self.assertAlmostEqual(submission.cpu_utilization(WORKED_TASKS), 0.325, delta=1e-12)

    def test_the_skip_test_utilisation(self):
        # 200/1000 + 500/2500 = 0.2 + 0.2 = 0.40.
        self.assertAlmostEqual(submission.cpu_utilization([(200.0, 1000.0), (500.0, 2500.0)]),
                               0.40, delta=1e-12)

    def test_one_task_alone(self):
        self.assertAlmostEqual(submission.cpu_utilization([("Diag", 800.0, 10000.0)]),
                               0.08, delta=1e-12)

    def test_the_diag_task_is_the_third_of_the_core(self):
        # A task set is additive, not a maximum: dropping the diag task must drop exactly 0.08.
        with_diag = submission.cpu_utilization(WORKED_TASKS)
        without = submission.cpu_utilization(WORKED_TASKS[:2])
        self.assertAlmostEqual(with_diag - without, 0.08, delta=1e-12)

    def test_an_overrunning_task_is_refused(self):
        with self.assertRaises(ValueError):
            submission.cpu_utilization([(1200.0, 1000.0)])

    def test_an_empty_set_or_a_bad_period_is_refused(self):
        with self.assertRaises(ValueError):
            submission.cpu_utilization([])
        with self.assertRaises(ValueError):
            submission.cpu_utilization([(120.0, 0.0)])
        with self.assertRaises(ValueError):
            submission.cpu_utilization([(-5.0, 1000.0)])


class BoundTests(unittest.TestCase):
    def test_the_three_task_bound(self):
        # 3 * (2^(1/3) - 1) = 0.779763, the number the worked example compares 0.325 against.
        self.assertAlmostEqual(submission.liu_layland_bound(3), 0.7797631496846196, delta=1e-12)

    def test_the_one_task_bound_is_one(self):
        self.assertAlmostEqual(submission.liu_layland_bound(1), 1.0, delta=1e-15)

    def test_the_bound_falls_as_tasks_are_added(self):
        self.assertAlmostEqual(submission.liu_layland_bound(2), 0.8284271247461903, delta=1e-12)
        self.assertLess(submission.liu_layland_bound(3), submission.liu_layland_bound(2))
        self.assertLess(submission.liu_layland_bound(10), submission.liu_layland_bound(3))

    def test_the_worked_set_fits_the_bound(self):
        self.assertLess(submission.cpu_utilization(WORKED_TASKS),
                        submission.liu_layland_bound(3))

    def test_zero_tasks_are_refused(self):
        with self.assertRaises(ValueError):
            submission.liu_layland_bound(0)


class ResponseTests(unittest.TestCase):
    def test_the_inherited_response(self):
        # 100 us of work plus 40 us of blocking: the mutex keeps the medium task out.
        self.assertAlmostEqual(
            submission.response_time_us(100.0, 40.0, 600.0, inheritance=True), 140.0, delta=1e-12)

    def test_the_unbounded_inversion_response(self):
        # A binary semaphore lets the 600 us medium task in: 100 + 40 + 600 = 740 us.
        self.assertAlmostEqual(
            submission.response_time_us(100.0, 40.0, 600.0, inheritance=False), 740.0, delta=1e-12)

    def test_the_skip_test_response(self):
        self.assertAlmostEqual(submission.response_time_us(100.0, 40.0), 140.0, delta=1e-12)

    def test_inheritance_is_what_removes_the_medium_task(self):
        inherited = submission.response_time_us(100.0, 40.0, 600.0, inheritance=True)
        inverted = submission.response_time_us(100.0, 40.0, 600.0, inheritance=False)
        self.assertAlmostEqual(inverted - inherited, 600.0, delta=1e-12)
        self.assertAlmostEqual(inherited, 140.0, delta=1e-12)

    def test_negative_times_are_refused(self):
        with self.assertRaises(ValueError):
            submission.response_time_us(-1.0, 40.0)
        with self.assertRaises(ValueError):
            submission.response_time_us(100.0, -40.0)


class ArbitrationTests(unittest.TestCase):
    def test_the_worked_arbitration(self):
        # 0x012 is the lowest identifier, so it drives every bit it needs and wins.
        self.assertEqual(submission.can_winner([0x105, 0x012, 0x04A]), 0x012)
        self.assertEqual(submission.can_winner([0x105, 0x012, 0x04A]), 18)

    def test_the_order_on_the_bus_does_not_matter(self):
        self.assertEqual(submission.can_winner([0x04A, 0x105, 0x012]), 0x012)
        self.assertEqual(submission.can_winner([0x012, 0x105, 0x04A]), 0x012)

    def test_the_extremes(self):
        self.assertEqual(submission.can_winner([0x000, 0x7FF]), 0x000)
        self.assertEqual(submission.can_winner([0x7FF]), 0x7FF)

    def test_an_invalid_identifier_is_refused(self):
        with self.assertRaises(ValueError):
            submission.can_winner([])
        with self.assertRaises(ValueError):
            submission.can_winner([0x800])
        with self.assertRaises(ValueError):
            submission.can_winner([-1])
        with self.assertRaises(ValueError):
            submission.can_winner([1.5])


class PackTests(unittest.TestCase):
    # The exercise: a 12-bit MIT torque field over [-18, +18] N*m.
    T_MIN, T_MAX, BITS = -18.0, 18.0, 12

    def test_the_exercise_code(self):
        # (9 - (-18)) / 36 * 4095 = 0.75 * 4095 = 3071.25 -> 3071.
        self.assertAlmostEqual(0.75 * 4095, 3071.25, delta=1e-9)
        self.assertEqual(submission.encode_fixed(9.0, self.T_MIN, self.T_MAX, self.BITS), 3071)

    def test_the_skip_test_velocity_code(self):
        # +15 over [-30, +30] is the same 75% of full scale: 3071.
        self.assertEqual(submission.encode_fixed(15.0, -30.0, 30.0, 12), 3071)

    def test_the_worked_position_code(self):
        # 0.0 over [-12.5, +12.5] sits exactly on the half code; round-half-to-even gives 32768.
        self.assertEqual(submission.encode_fixed(0.0, -12.5, 12.5, 16), 32768)

    def test_the_ends_of_the_range(self):
        self.assertEqual(submission.encode_fixed(self.T_MIN, self.T_MIN, self.T_MAX, self.BITS), 0)
        self.assertEqual(submission.encode_fixed(self.T_MAX, self.T_MIN, self.T_MAX, self.BITS), 4095)

    def test_a_negative_torque_packs_below_mid_scale(self):
        self.assertLess(submission.encode_fixed(-9.0, self.T_MIN, self.T_MAX, self.BITS), 2048)
        self.assertEqual(submission.encode_fixed(-9.0, self.T_MIN, self.T_MAX, self.BITS), 1024)

    def test_a_value_outside_the_range_has_no_code(self):
        with self.assertRaises(ValueError):
            submission.encode_fixed(18.1, self.T_MIN, self.T_MAX, self.BITS)
        with self.assertRaises(ValueError):
            submission.encode_fixed(-18.1, self.T_MIN, self.T_MAX, self.BITS)
        with self.assertRaises(ValueError):
            submission.encode_fixed(0.0, 5.0, 5.0, 12)
        with self.assertRaises(ValueError):
            submission.encode_fixed(0.0, self.T_MIN, self.T_MAX, 0)


class DecodeTests(unittest.TestCase):
    T_MIN, T_MAX, BITS = -18.0, 18.0, 12

    def test_the_exercise_code_decodes_one_quarter_step_low(self):
        # 3071 is 9.0 - 0.0021978 N*m, and the step is 0.0087912, so the error is a quarter step.
        self.assertAlmostEqual(submission.decode_fixed(3071, self.T_MIN, self.T_MAX, self.BITS),
                               8.997802197802198, delta=1e-12)
        self.assertAlmostEqual(
            9.0 - submission.decode_fixed(3071, self.T_MIN, self.T_MAX, self.BITS),
            0.0021978021978021977, delta=1e-15)

    def test_the_decoded_ends_are_the_range_ends(self):
        self.assertAlmostEqual(submission.decode_fixed(0, self.T_MIN, self.T_MAX, self.BITS),
                               -18.0, delta=1e-15)
        self.assertAlmostEqual(submission.decode_fixed(4095, self.T_MIN, self.T_MAX, self.BITS),
                               18.0, delta=1e-15)

    def test_the_zero_command_is_half_a_step_from_mid_code(self):
        # 2047 and 2048 straddle zero by exactly half a step; a 2^bits pack would put zero on 2048.
        step = submission.quantization_step(self.T_MIN, self.T_MAX, self.BITS)
        for code in (2047, 2048):
            self.assertAlmostEqual(
                abs(submission.decode_fixed(code, self.T_MIN, self.T_MAX, self.BITS)),
                step / 2.0, delta=1e-15)
        self.assertLess(submission.decode_fixed(2047, self.T_MIN, self.T_MAX, self.BITS), 0.0)
        self.assertGreater(submission.decode_fixed(2048, self.T_MIN, self.T_MAX, self.BITS), 0.0)

    def test_every_code_round_trips_through_the_pack(self):
        for code in (0, 1, 2047, 2048, 3071, 4094, 4095):
            torque = submission.decode_fixed(code, self.T_MIN, self.T_MAX, self.BITS)
            self.assertEqual(
                submission.encode_fixed(torque, self.T_MIN, self.T_MAX, self.BITS), code)

    def test_an_out_of_range_code_is_refused(self):
        with self.assertRaises(ValueError):
            submission.decode_fixed(4096, self.T_MIN, self.T_MAX, self.BITS)
        with self.assertRaises(ValueError):
            submission.decode_fixed(-1, self.T_MIN, self.T_MAX, self.BITS)


class StepTests(unittest.TestCase):
    def test_the_exercise_step(self):
        # 36.0 / 4095 = 0.008791208791... N*m per count.
        self.assertAlmostEqual(submission.quantization_step(-18.0, 18.0, 12),
                               0.008791208791208791, delta=1e-15)

    def test_the_step_times_the_intervals_is_the_span(self):
        self.assertAlmostEqual(submission.quantization_step(-30.0, 30.0, 12) * 4095, 60.0,
                               delta=1e-12)
        self.assertAlmostEqual(submission.quantization_step(-12.5, 12.5, 16) * 65535, 25.0,
                               delta=1e-12)

    def test_more_bits_make_a_finer_step(self):
        sixteen = submission.quantization_step(-18.0, 18.0, 16)
        twelve = submission.quantization_step(-18.0, 18.0, 12)
        self.assertLess(sixteen, twelve)
        self.assertAlmostEqual(twelve / sixteen, 65535.0 / 4095.0, delta=1e-9)

    def test_a_bad_field_width_is_refused(self):
        with self.assertRaises(ValueError):
            submission.quantization_step(-18.0, 18.0, 0)


if __name__ == "__main__":
    unittest.main()
