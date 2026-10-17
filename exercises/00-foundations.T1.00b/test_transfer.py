"""Transfer tests for 00-foundations.T1.00b - the same data handling on the plant's own numbers.

Three claims:
  1. the plant's 1 kHz tick, run for `plant.TICKS`, is a window whose timestamps this exercise's
     grid has to reproduce: 1,001 samples, first at 0.0 s, last at 1.0 s, mean 0.5 s, span 1.0 s;
  2. the plant's 12-bit encoder becomes turns through exactly the dictionary calibration this
     exercise scales with - 2048 counts is half a turn, and a full count ramp averages to
     2047.5/4096 turns;
  3. a sampled plant signal obeys the same two summary statistics: the gravity torque over a 90
     degree sweep spans (M1 LC1 + M2 L1 + M2 LC2) G, and a symmetric 0.02 N*m ripple is 0.02 N*m
     RMS while its signed mean is exactly zero - which is why the module squares first.
"""

import math
import unittest

import harness

submission = harness.load_submission()
plant = harness.plant


class PlantWindowTests(unittest.TestCase):
    def test_the_plant_tick_builds_the_one_second_run(self):
        window = submission.timestamps(0.0, plant.DT, plant.TICKS + 1)
        self.assertEqual(len(window), 1001)
        self.assertAlmostEqual(window[0], 0.0, delta=1e-12)
        self.assertAlmostEqual(window[-1], plant.TICKS * plant.DT, delta=1e-12)
        self.assertAlmostEqual(window[-1], 1.0, delta=1e-12)

    def test_the_one_khz_window_statistics(self):
        window = submission.timestamps(0.0, plant.DT, plant.TICKS + 1)
        self.assertAlmostEqual(submission.mean_of(window), 0.5, delta=1e-12)
        self.assertAlmostEqual(submission.peak_to_peak(window), 1.0, delta=1e-12)

    def test_a_two_second_five_hundred_hertz_capture(self):
        # The Skip test's 2 ms grid, run for a whole 2 s capture instead of 501 samples.
        window = submission.timestamps(0.0, 0.002, 1001)
        self.assertEqual(len(window), 1001)
        self.assertAlmostEqual(window[500], 1.0, delta=1e-12)
        self.assertAlmostEqual(window[-1], 2.0, delta=1e-12)

    def test_a_recording_that_does_not_start_at_zero(self):
        window = submission.timestamps(plant.DIST_START_S, plant.DT, 3)
        for got, want in zip(window, [0.40, 0.401, 0.402]):
            self.assertAlmostEqual(got, want, delta=1e-12)


class EncoderScalingTests(unittest.TestCase):
    CALIBRATION = {"slope": 1.0 / 4096, "offset": 0.0}  # counts -> shaft turns, from plant.ENCODER_CPR

    def test_the_encoder_counts_become_turns(self):
        turns = submission.scaled_readings([0, 2048, plant.ENCODER_CPR - 1],
                                           {"slope": 1.0 / plant.ENCODER_CPR, "offset": 0.0})
        self.assertAlmostEqual(turns[0], 0.0, delta=1e-15)
        self.assertAlmostEqual(turns[1], 0.5, delta=1e-15)
        self.assertAlmostEqual(turns[2], 4095.0 / 4096.0, delta=1e-15)

    def test_a_full_count_ramp_mean_and_span(self):
        turns = submission.scaled_readings(list(range(plant.ENCODER_CPR)), self.CALIBRATION)
        self.assertEqual(len(turns), 4096)
        self.assertAlmostEqual(submission.mean_of(turns), 2047.5 / 4096.0, delta=1e-15)
        self.assertAlmostEqual(submission.peak_to_peak(turns), 4095.0 / 4096.0, delta=1e-15)
        # The span is just under one turn, which is what a 12-bit encoder resolves.
        self.assertLess(submission.peak_to_peak(turns), 1.0)


class PlantTraceTests(unittest.TestCase):
    def test_the_plant_gravity_torque_trace_span(self):
        # A 1 degree sweep at the plant's gravity model, sampled on this exercise's time grid.
        angles = submission.timestamps(0.0, math.pi / 180.0, 91)
        trace = [plant.gravity_torque(angle, 0.0)[0] for angle in angles]
        expected = (plant.M1 * plant.LC1 + plant.M2 * plant.L1 + plant.M2 * plant.LC2) * plant.G
        self.assertAlmostEqual(expected, 0.318825, delta=1e-12)
        self.assertAlmostEqual(submission.peak_to_peak(trace), expected, delta=1e-9)
        self.assertAlmostEqual(trace[0], expected, delta=1e-12)
        self.assertAlmostEqual(trace[-1], 0.0, delta=1e-12)

    def test_the_rmse_of_the_plants_torque_ripple(self):
        # A symmetric +/-0.02 N*m ripple at the joint's 2.5 N*m clamp: the signed mean is 0, the
        # RMS is 0.02 - the module's reason for squaring before averaging.
        ripple = [0.02 if index % 2 else -0.02 for index in range(8)]
        measured = [plant.TAU_LIMIT + offset for offset in ripple]
        target = [plant.TAU_LIMIT] * 8
        self.assertAlmostEqual(submission.mean_of(submission.errors(target, measured)), 0.0,
                               delta=1e-15)
        self.assertAlmostEqual(submission.rmse(target, measured), 0.02, delta=1e-9)


if __name__ == "__main__":
    unittest.main()
