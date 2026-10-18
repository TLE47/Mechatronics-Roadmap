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
        self.assertAlmostEqual(
            TICK_US, 1000.0, delta=1e-9,
            msg="expected the plant's 1 ms tick to be the worked example's 1000 us period; a "
                "different figure means DT changed and the task set below is sized for another "
                "node - check plant.DT",
        )
        self.assertAlmostEqual(
            submission.cpu_utilization(WORKED_TASKS), 0.325, delta=1e-12,
            msg="expected the plant's own three tasks to use 32.5 percent of one core; a figure "
                "near 0.000325 means microseconds were divided by milliseconds - check the units",
        )

    def test_the_plant_run_is_one_second_of_ticks(self):
        self.assertAlmostEqual(
            plant.TICKS * plant.DT, 1.0, delta=1e-9,
            msg="expected the plant's TICKS x DT to be exactly one second; another span means the "
                "run length and the tick rate disagree - check the constants",
        )
        # A 100 Hz logger on this plant runs once every ten ticks.
        self.assertAlmostEqual(
            plant.TICKS / 100.0 * plant.DT * 1e6, 10000.0, delta=1e-6,
            msg="expected a 100 Hz logger to run every 10000 us at the plant's cadence; a figure "
                "of 10 means the tick count was reported in milliseconds - check the 1e6",
        )

    def test_the_worked_set_is_schedulable_on_one_core(self):
        utilisation = submission.cpu_utilization(WORKED_TASKS)
        self.assertLess(
            utilisation, submission.liu_layland_bound(3),
            msg="expected the 0.325 utilisation to sit under the 0.7798 three-task bound; failing "
                "here means one side is in the wrong unit - check both use the same task set",
        )
        self.assertLess(
            utilisation, 1.0,
            msg="expected the worked set to fit a single core outright; a value near or above 1 "
                "means a period was read in milliseconds while C stayed in microseconds",
        )
        # Six more copies of the 1 kHz controller overrun the core outright: 1.045 against a
        # nine-task sufficient bound of 0.7205.
        crowded = WORKED_TASKS + [("Ctrl_%d" % i, 120.0, 1000.0) for i in range(2, 8)]
        self.assertGreater(
            submission.cpu_utilization(crowded), 1.0,
            msg="expected nine copies of the 1 kHz controller to overrun the core, above 1.045; a "
                "value below 1 means the added tasks never reached the sum - check the list",
        )
        self.assertGreater(
            submission.cpu_utilization(crowded),
            submission.liu_layland_bound(len(crowded)),
            msg="expected the crowded set to exceed even its own sufficient bound, so it is a "
                "scheduling failure rather than a marginal case; a smaller value means the bound "
                "was computed for the wrong task count - check len(crowded)",
        )

    def test_priority_inheritance_bounds_the_control_task(self):
        # The plant's own control step is 120 us of work behind a 40 us critical section.
        inherited = submission.response_time_us(120.0, 40.0, 600.0, inheritance=True)
        inverted = submission.response_time_us(120.0, 40.0, 600.0, inheritance=False)
        self.assertAlmostEqual(
            inherited, 160.0, delta=1e-12,
            msg="expected the control task's response to be 120 + 40 = 160 us under priority "
                "inheritance; 760 means the medium task was added anyway - check the flag",
        )
        self.assertAlmostEqual(
            inverted, 760.0, delta=1e-12,
            msg="expected a binary semaphore to let the 600 us medium task in, giving 760 us; 160 "
                "means the inversion case is not modelled at all",
        )
        # 160 us is still inside the 1000 us tick; 760 us is inside it too, but eats 76% of it.
        self.assertLess(
            inherited, TICK_US,
            msg="expected the inherited response to fit comfortably inside one plant tick; a "
                "larger figure means the critical section is longer than the module's example",
        )
        self.assertGreater(
            inverted / TICK_US, 0.75,
            msg="expected the inversion case to eat more than three quarters of the tick, the "
                "reason the mutex matters; a smaller fraction means the medium task's cost was "
                "understated - check the 600 us",
        )


class PackingOnThePlantTests(unittest.TestCase):
    T_MIN, T_MAX, BITS = -18.0, 18.0, 12

    def test_the_plants_torque_clamp_packs_into_the_frame(self):
        # (2.5 + 18) / 36 * 4095 = 2331.875 -> 2332.
        code = submission.encode_fixed(plant.TAU_LIMIT, self.T_MIN, self.T_MAX, self.BITS)
        self.assertEqual(
            code, 2332,
            msg="expected the plant's 2.5 N*m clamp to pack as 2332, the rounding of 2331.875; "
                "2331 means the fraction was truncated - check the rounding of the pack",
        )
        self.assertAlmostEqual(
            submission.decode_fixed(code, self.T_MIN, self.T_MAX, self.BITS),
            2.501098901098901, delta=1e-12,
            msg="expected code 2332 to decode to 2.5011 N*m, half a count above the clamp; 2.5 "
                "exactly means decode used 4096 intervals - check the full-scale code",
        )

    def test_both_disturbance_pulses_round_trip_within_half_a_count(self):
        step = submission.quantization_step(self.T_MIN, self.T_MAX, self.BITS)
        self.assertAlmostEqual(
            step, 0.008791208791208791, delta=1e-15,
            msg="expected one count of the 12-bit torque field to be 0.0087912 N*m; 0.0087891 "
                "means the step divided by 4096 - check 2**bits - 1 intervals",
        )
        for torque in (plant.DIST_TAU1, plant.DIST_TAU2):
            code = submission.encode_fixed(torque, self.T_MIN, self.T_MAX, self.BITS)
            back = submission.decode_fixed(code, self.T_MIN, self.T_MAX, self.BITS)
            self.assertLessEqual(
                abs(back - torque), step / 2.0 + 1e-15,
                msg="expected each disturbance pulse to survive the frame within half a count, "
                    "the best any pack can do; a larger error means the pack and the decode use "
                    "different scales - check both divide by 4095",
            )

    def test_the_shoulder_pulse_lands_on_its_exact_code(self):
        # -0.15 N*m is 49.583% of the span: 2030.4375 -> 2030, which decodes to -0.15385 N*m.
        code = submission.encode_fixed(plant.DIST_TAU1, self.T_MIN, self.T_MAX, self.BITS)
        self.assertEqual(
            code, 2030,
            msg="expected the -0.15 N*m shoulder pulse to pack as 2030, the rounding of "
                "2030.4375; 2031 means the value was rounded up from the half count - check the "
                "fraction first",
        )
        self.assertAlmostEqual(
            submission.decode_fixed(code, self.T_MIN, self.T_MAX, self.BITS),
            -0.15384615384615385, delta=1e-12,
            msg="expected code 2030 to decode to -0.15385 N*m, which is the commanded pulse seen "
                "through the frame; a different value means the pulse and the field disagree",
        )

    def test_the_zero_command_is_not_on_mid_code(self):
        # A 2^bits pack would put zero on 2048 and full scale on 4096 - one code past the field.
        code = submission.encode_fixed(0.0, self.T_MIN, self.T_MAX, self.BITS)
        self.assertEqual(
            code, 2048,
            msg="expected a zero command to pack as 2048, the rounded half of 2047.5; 2047 means "
                "the pack truncated and zero would arrive as a small negative torque",
        )
        self.assertLess(
            submission.decode_fixed(2047, self.T_MIN, self.T_MAX, self.BITS), 0.0,
            msg="expected code 2047 to decode just below zero; a positive value means the "
                "midpoint was put one code low - check the half-step straddle",
        )
        self.assertGreater(
            submission.decode_fixed(2048, self.T_MIN, self.T_MAX, self.BITS), 0.0,
            msg="expected code 2048 to decode just above zero; a value at or below zero means "
                "the zero command is not representable - check the decode scaling",
        )


class EncoderAgainstThePackTests(unittest.TestCase):
    def test_the_encoder_is_one_count_finer_than_a_twelve_bit_pack(self):
        pack = submission.quantization_step(-math.pi, math.pi, 12)
        encoder = math.tau / plant.ENCODER_CPR
        self.assertAlmostEqual(
            plant.ENCODER_CPR, 4096, delta=0,
            msg="expected the plant's AS5600 to give 4096 counts; another count means the "
                "comparison below is against a different encoder - check the constant",
        )
        self.assertAlmostEqual(
            pack * 4095, math.tau, delta=1e-12,
            msg="expected 4095 intervals of the 12-bit angle pack to rebuild a full turn; a "
                "different span means the pack's endpoints are wrong - check the pi endpoints",
        )
        self.assertGreater(
            pack, encoder,
            msg="expected the pack's count to be coarser than the encoder's, since 4095 intervals "
                "must cover what 4096 counts do; an inversion means the two divisors were swapped",
        )
        self.assertAlmostEqual(
            pack / encoder, 4096.0 / 4095.0, delta=1e-12,
            msg="expected the pack to be exactly 4096/4095 coarser than the encoder; another "
                "ratio means one side used the other's count - check both divisors",
        )

    def test_a_half_count_of_the_pack_is_under_a_milliradian(self):
        half = submission.quantization_step(-math.pi, math.pi, 12) / 2.0
        self.assertLess(
            half, 1e-3,
            msg="expected half a count of the 12-bit angle pack, 0.767 mrad, to stay under a "
                "milliradian; a larger value means the step was computed over the wrong span",
        )
        self.assertGreater(
            half, 7.6e-4,
            msg="expected that half count to stay above 7.6e-4 rad, since the pack is coarser "
                "than the encoder; a smaller value means 2 pi was divided by 4096 - check the "
                "interval count",
        )


if __name__ == "__main__":
    unittest.main()
