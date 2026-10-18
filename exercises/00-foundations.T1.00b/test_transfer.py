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

Every assertion carries its message, because a learner running this alone has only the failing line.
"""

import math
import unittest

import harness

submission = harness.load_submission()
plant = harness.plant


class PlantWindowTests(unittest.TestCase):
    def test_the_plant_tick_builds_the_one_second_run(self):
        window = submission.timestamps(0.0, plant.DT, plant.TICKS + 1)
        self.assertEqual(
            len(window),
            1001,
            "expected TICKS + 1 = 1001 samples for a full second at 1 kHz; a 1000 count likely used TICKS - check the endpoint is included",
        )
        self.assertAlmostEqual(
            window[0],
            0.0,
            delta=1e-12,
            msg="expected the first timestamp to be exactly 0.0 s; a 0.001 start likely added dt before t0 - check the grid begins at the start time",
        )
        self.assertAlmostEqual(
            window[-1],
            plant.TICKS * plant.DT,
            delta=1e-12,
            msg="expected the last sample to equal TICKS * DT; a mismatch likely built the grid from the sample count instead of the tick length",
        )
        self.assertAlmostEqual(
            window[-1],
            1.0,
            delta=1e-12,
            msg="expected 1000 ticks of 1 ms to be exactly 1.0 s; a 0.999 value likely dropped the final tick - check the multiplication",
        )

    def test_the_one_khz_window_statistics(self):
        window = submission.timestamps(0.0, plant.DT, plant.TICKS + 1)
        self.assertAlmostEqual(
            submission.mean_of(window),
            0.5,
            delta=1e-12,
            msg="expected the mean of a 0 to 1 s grid to be 0.5 s; a 0.5005 value likely divided by the wrong count - check the endpoints are counted once",
        )
        self.assertAlmostEqual(
            submission.peak_to_peak(window),
            1.0,
            delta=1e-12,
            msg="expected the span of the 1 s grid to be 1.0 s; a 0.999 value likely measured from the first gap - check max minus min",
        )

    def test_a_two_second_five_hundred_hertz_capture(self):
        # The Skip test's 2 ms grid, run for a whole 2 s capture instead of 501 samples.
        window = submission.timestamps(0.0, 0.002, 1001)
        self.assertEqual(
            len(window),
            1001,
            "expected 1001 samples for a 2 s capture at 500 Hz; 1000 likely used the interval count - check the endpoint is included",
        )
        self.assertAlmostEqual(
            window[500],
            1.0,
            delta=1e-12,
            msg="expected index 500 to sit at 1.0 s; a 1.002 value likely built the grid as (i+1)*dt - check the index starts at zero",
        )
        self.assertAlmostEqual(
            window[-1],
            2.0,
            delta=1e-12,
            msg="expected the last sample at 2.0 s; a 1.998 value likely dropped two intervals - check the count matches the duration",
        )

    def test_a_recording_that_does_not_start_at_zero(self):
        window = submission.timestamps(plant.DIST_START_S, plant.DT, 3)
        for got, want in zip(window, [0.40, 0.401, 0.402]):
            self.assertAlmostEqual(
                got,
                want,
                delta=1e-12,
                msg="expected a grid from 0.40 s to read 0.40, 0.401, 0.402; a grid starting at 0.0 likely ignored DIST_START_S - check t0 is passed through",
            )


class EncoderScalingTests(unittest.TestCase):
    CALIBRATION = {"slope": 1.0 / 4096, "offset": 0.0}  # counts -> shaft turns, from plant.ENCODER_CPR

    def test_the_encoder_counts_become_turns(self):
        turns = submission.scaled_readings([0, 2048, plant.ENCODER_CPR - 1],
                                           {"slope": 1.0 / plant.ENCODER_CPR, "offset": 0.0})
        self.assertAlmostEqual(
            turns[0],
            0.0,
            delta=1e-15,
            msg="expected 0 counts to be 0.0 turns; a non-zero value likely added a calibration offset - check the offset is zero",
        )
        self.assertAlmostEqual(
            turns[1],
            0.5,
            delta=1e-15,
            msg="expected 2048 counts to be exactly half a turn; a 0.4995 value likely divided by 4095 - check the divisor is 4096",
        )
        self.assertAlmostEqual(
            turns[2],
            4095.0 / 4096.0,
            delta=1e-15,
            msg="expected 4095 counts to be 4095/4096 of a turn; a 1.0 value likely divided by 4095 - check the encoder tops out at ENCODER_CPR - 1",
        )

    def test_a_full_count_ramp_mean_and_span(self):
        turns = submission.scaled_readings(list(range(plant.ENCODER_CPR)), self.CALIBRATION)
        self.assertEqual(
            len(turns),
            4096,
            "expected a full 12-bit ramp to hold 4096 samples; 4095 likely used range(1, 4096) - check the ramp starts at zero",
        )
        self.assertAlmostEqual(
            submission.mean_of(turns),
            2047.5 / 4096.0,
            delta=1e-15,
            msg="expected the ramp mean to be 2047.5/4096 turns; a 0.5 value likely averaged the raw counts - check the scale is applied before averaging",
        )
        self.assertAlmostEqual(
            submission.peak_to_peak(turns),
            4095.0 / 4096.0,
            delta=1e-15,
            msg="expected the ramp span to be 4095/4096 turns; a 1.0 value likely included a 4096th count - check the top of the ramp",
        )
        # The span is just under one turn, which is what a 12-bit encoder resolves.
        self.assertLess(
            submission.peak_to_peak(turns),
            1.0,
            "expected the span to stay under one full turn; a 1.0 span likely included 4096 - check the ramp stops at ENCODER_CPR - 1",
        )


class PlantTraceTests(unittest.TestCase):
    def test_the_plant_gravity_torque_trace_span(self):
        # A 1 degree sweep at the plant's gravity model, sampled on this exercise's time grid.
        angles = submission.timestamps(0.0, math.pi / 180.0, 91)
        trace = [plant.gravity_torque(angle, 0.0)[0] for angle in angles]
        expected = (plant.M1 * plant.LC1 + plant.M2 * plant.L1 + plant.M2 * plant.LC2) * plant.G
        self.assertAlmostEqual(
            expected,
            0.318825,
            delta=1e-12,
            msg="expected the plant's gravity span to be 0.318825 N*m; a larger value likely counted L1 twice - check the three moment-arm terms",
        )
        self.assertAlmostEqual(
            submission.peak_to_peak(trace),
            expected,
            delta=1e-9,
            msg="expected the 90 degree sweep to span the full gravity torque; a smaller span likely sampled short of 90 degrees - check the grid length",
        )
        self.assertAlmostEqual(
            trace[0],
            expected,
            delta=1e-12,
            msg="expected the first sample at 0 degrees to equal the full gravity torque; a smaller value likely used sin - check cos at the horizontal",
        )
        self.assertAlmostEqual(
            trace[-1],
            0.0,
            delta=1e-12,
            msg="expected the last sample at 90 degrees to be 0.0 N*m; a non-zero value likely swept past the vertical - check cos reaches zero",
        )

    def test_the_rmse_of_the_plants_torque_ripple(self):
        # A symmetric +/-0.02 N*m ripple at the joint's 2.5 N*m clamp: the signed mean is 0, the
        # RMS is 0.02 - the module's reason for squaring before averaging.
        ripple = [0.02 if index % 2 else -0.02 for index in range(8)]
        measured = [plant.TAU_LIMIT + offset for offset in ripple]
        target = [plant.TAU_LIMIT] * 8
        self.assertAlmostEqual(
            submission.mean_of(submission.errors(target, measured)),
            0.0,
            delta=1e-15,
            msg="expected a symmetric ripple to have a signed mean of exactly 0.0; a 0.02 mean likely used absolute errors - check the signs are kept",
        )
        self.assertAlmostEqual(
            submission.rmse(target, measured),
            0.02,
            delta=1e-9,
            msg="expected the ripple RMS to be 0.02 N*m; a 0.0 result likely averaged the signed errors - check the squares happen before the mean",
        )


if __name__ == "__main__":
    unittest.main()
