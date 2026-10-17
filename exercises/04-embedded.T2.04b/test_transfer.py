"""Transfer tests for 04-embedded.T2.04b - the plant as the actuator node under test.

Three claims, measured on the shared plant:
  1. its 1 kHz tick is the worked example's 1000 us period, so the same three tasks really do use
     32.5% of the core and still fit the Liu-Layland bound;
  2. its 2.5 N*m clamp and both disturbance pulses pack into a 12-bit [-18, +18] N*m MIT field
     and come back within half a count - the frame a real joint receives;
  3. its 4096-count encoder is one count finer than a 12-bit pack's 4095 intervals, so the two
     resolutions are close but never interchangeable.
"""

import math
import unittest

import harness

submission = harness.load_submission()
plant = harness.plant

# The module's worked task set, in microseconds - which is exactly the plant's tick budget.
TICK_US = plant.DT * 1e6
WORKED_TASKS = [
    ("Ctrl_1kHz", 120.0, 1000.0),
    ("CAN_500Hz", 250.0, 2000.0),
    ("Diag_100Hz", 800.0, 10000.0),
]


class SchedulingOnThePlantTests(unittest.TestCase):
    def test_the_plant_tick_is_the_worked_period(self):
        self.assertAlmostEqual(TICK_US, 1000.0, delta=1e-9)
        self.assertAlmostEqual(submission.cpu_utilization(WORKED_TASKS), 0.325, delta=1e-12)

    def test_the_plant_run_is_one_second_of_ticks(self):
        self.assertAlmostEqual(plant.TICKS * plant.DT, 1.0, delta=1e-9)
        # A 100 Hz logger on this plant runs once every ten ticks.
        self.assertAlmostEqual(plant.TICKS / 100.0 * plant.DT * 1e6, 10000.0, delta=1e-6)

    def test_the_worked_set_is_schedulable_on_one_core(self):
        utilisation = submission.cpu_utilization(WORKED_TASKS)
        self.assertLess(utilisation, submission.liu_layland_bound(3))
        self.assertLess(utilisation, 1.0)
        # Six more copies of the 1 kHz controller overrun the core outright: 1.045 against a
        # nine-task sufficient bound of 0.7205.
        crowded = WORKED_TASKS + [("Ctrl_%d" % i, 120.0, 1000.0) for i in range(2, 8)]
        self.assertGreater(submission.cpu_utilization(crowded), 1.0)
        self.assertGreater(submission.cpu_utilization(crowded),
                           submission.liu_layland_bound(len(crowded)))

    def test_priority_inheritance_bounds_the_control_task(self):
        # The plant's own control step is 120 us of work behind a 40 us critical section.
        inherited = submission.response_time_us(120.0, 40.0, 600.0, inheritance=True)
        inverted = submission.response_time_us(120.0, 40.0, 600.0, inheritance=False)
        self.assertAlmostEqual(inherited, 160.0, delta=1e-12)
        self.assertAlmostEqual(inverted, 760.0, delta=1e-12)
        # 160 us is still inside the 1000 us tick; 760 us is inside it too, but eats 76% of it.
        self.assertLess(inherited, TICK_US)
        self.assertGreater(inverted / TICK_US, 0.75)


class PackingOnThePlantTests(unittest.TestCase):
    T_MIN, T_MAX, BITS = -18.0, 18.0, 12

    def test_the_plants_torque_clamp_packs_into_the_frame(self):
        # (2.5 + 18) / 36 * 4095 = 2331.875 -> 2332.
        code = submission.encode_fixed(plant.TAU_LIMIT, self.T_MIN, self.T_MAX, self.BITS)
        self.assertEqual(code, 2332)
        self.assertAlmostEqual(
            submission.decode_fixed(code, self.T_MIN, self.T_MAX, self.BITS),
            2.501098901098901, delta=1e-12)

    def test_both_disturbance_pulses_round_trip_within_half_a_count(self):
        step = submission.quantization_step(self.T_MIN, self.T_MAX, self.BITS)
        self.assertAlmostEqual(step, 0.008791208791208791, delta=1e-15)
        for torque in (plant.DIST_TAU1, plant.DIST_TAU2):
            code = submission.encode_fixed(torque, self.T_MIN, self.T_MAX, self.BITS)
            back = submission.decode_fixed(code, self.T_MIN, self.T_MAX, self.BITS)
            self.assertLessEqual(abs(back - torque), step / 2.0 + 1e-15,
                                 "%.3f N*m did not survive the frame" % torque)

    def test_the_shoulder_pulse_lands_on_its_exact_code(self):
        # -0.15 N*m is 49.583% of the span: 2030.4375 -> 2030, which decodes to -0.15385 N*m.
        code = submission.encode_fixed(plant.DIST_TAU1, self.T_MIN, self.T_MAX, self.BITS)
        self.assertEqual(code, 2030)
        self.assertAlmostEqual(
            submission.decode_fixed(code, self.T_MIN, self.T_MAX, self.BITS),
            -0.15384615384615385, delta=1e-12)

    def test_the_zero_command_is_not_on_mid_code(self):
        # A 2^bits pack would put zero on 2048 and full scale on 4096 - one code past the field.
        code = submission.encode_fixed(0.0, self.T_MIN, self.T_MAX, self.BITS)
        self.assertEqual(code, 2048)
        self.assertLess(submission.decode_fixed(2047, self.T_MIN, self.T_MAX, self.BITS), 0.0)
        self.assertGreater(submission.decode_fixed(2048, self.T_MIN, self.T_MAX, self.BITS), 0.0)


class EncoderAgainstThePackTests(unittest.TestCase):
    def test_the_encoder_is_one_count_finer_than_a_twelve_bit_pack(self):
        pack = submission.quantization_step(-math.pi, math.pi, 12)
        encoder = math.tau / plant.ENCODER_CPR
        self.assertAlmostEqual(plant.ENCODER_CPR, 4096, delta=0)
        self.assertAlmostEqual(pack * 4095, math.tau, delta=1e-12)
        self.assertGreater(pack, encoder)
        self.assertAlmostEqual(pack / encoder, 4096.0 / 4095.0, delta=1e-12)

    def test_a_half_count_of_the_pack_is_under_a_milliradian(self):
        half = submission.quantization_step(-math.pi, math.pi, 12) / 2.0
        self.assertLess(half, 1e-3)
        self.assertGreater(half, 7.6e-4)


if __name__ == "__main__":
    unittest.main()
