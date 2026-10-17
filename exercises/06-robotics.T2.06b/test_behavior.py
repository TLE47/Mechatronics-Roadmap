"""Behaviour tests for 06-robotics.T2.06b.

Each test names the mistake it catches:
  * a timer step count that rounds or floors, so a 2.5-step period drifts a step behind the clock;
  * a composable saving that forgets the subscriber count (one copy instead of N);
  * a disk budget that leaves out the 32-byte MCAP index/timestamp per message - 20% of a small
    topic's traffic;
  * a compression ratio applied to the size instead of the rate, or inverted;
  * a replay derivative divided by the WALL gap, which makes the recorded velocity depend on the
    playback speed - the exact bug `--clock` exists to prevent;
  * a decimation that rounds a non-integral ratio instead of refusing it.
"""

import math
import unittest

import harness

submission = harness.load_submission()

WORKED_TOPICS = [
    ("/joint_states", 1000.0, 128),
    ("/imu/data", 200.0, 96),
    ("/camera/depth", 30.0, 150_000),
]


class TimerTests(unittest.TestCase):
    def test_the_ratio_is_a_ceiling(self):
        self.assertEqual(submission.timer_steps(0.004, 0.001), 4)
        self.assertEqual(submission.timer_steps(0.0045, 0.001), 5)
        self.assertEqual(submission.timer_steps(0.0025, 0.001), 3)

    def test_a_faster_timer_than_the_clock_still_waits_one_step(self):
        self.assertEqual(submission.timer_steps(1e-5, 1e-3), 1)
        self.assertEqual(submission.timer_steps(0.0001, 0.001), 1)

    def test_an_exact_multiple_does_not_round_up_from_float_error(self):
        self.assertEqual(submission.timer_steps(0.003, 0.001), 3)
        self.assertEqual(submission.timer_steps(0.03, 0.001), 30)

    def test_a_non_positive_period_is_refused(self):
        with self.assertRaises(ValueError):
            submission.timer_steps(0.0, 0.001)
        with self.assertRaises(ValueError):
            submission.timer_steps(0.001, 0.0)


class IntraProcessTests(unittest.TestCase):
    def test_the_saving_scales_with_subscribers(self):
        one = submission.intra_process_saving_mb_s(1, 128, 1000.0)
        five = submission.intra_process_saving_mb_s(5, 128, 1000.0)
        self.assertAlmostEqual(one, 0.128, delta=1e-12)
        self.assertAlmostEqual(five, 0.64, delta=1e-12)

    def test_no_subscribers_is_no_saving(self):
        self.assertEqual(submission.intra_process_saving_mb_s(0, 128, 1000.0), 0.0)


class RecordingTests(unittest.TestCase):
    def test_the_worked_budget(self):
        rate = submission.disk_rate_mb_s(WORKED_TOPICS, meta_bytes=32, compression=0.40)
        self.assertAlmostEqual(rate, 1.874624, delta=1e-6)
        self.assertAlmostEqual(submission.bag_size_mb(rate, 600.0), 1124.7744, delta=1e-3)

    def test_the_metadata_is_per_message(self):
        bare = submission.disk_rate_mb_s([("/j", 1000.0, 128)], meta_bytes=0)
        with_meta = submission.disk_rate_mb_s([("/j", 1000.0, 128)], meta_bytes=32)
        self.assertAlmostEqual(bare, 0.128, delta=1e-12)
        self.assertAlmostEqual(with_meta, 0.160, delta=1e-12)

    def test_compression_scales_the_rate(self):
        full = submission.disk_rate_mb_s(WORKED_TOPICS, compression=1.0)
        quarter = submission.disk_rate_mb_s(WORKED_TOPICS, compression=0.25)
        self.assertAlmostEqual(quarter, 0.25 * full, delta=1e-12)

    def test_size_grows_with_duration(self):
        rate = submission.disk_rate_mb_s(WORKED_TOPICS)
        self.assertAlmostEqual(submission.bag_size_mb(rate, 1200.0),
                               2.0 * submission.bag_size_mb(rate, 600.0), delta=1e-12)


class ReplayTests(unittest.TestCase):
    def test_the_derivative_is_rate_invariant(self):
        rates = (0.25, 1.0, 4.0)
        values = []
        for rate in rates:
            wall = submission.wall_delay_s(10.000, 10.002, rate)
            self.assertAlmostEqual(wall, 0.002 / rate, delta=1e-12)
            # The estimator differentiates on the /clock stamps, not the wall-clock gap.
            values.append(submission.replay_derivative(10.000, 0.50, 10.002, 0.54))
        for value in values:
            self.assertAlmostEqual(value, 20.0, delta=1e-9)

    def test_a_reverse_rate_is_refused(self):
        with self.assertRaises(ValueError):
            submission.wall_delay_s(1.0, 1.1, 0.0)

    def test_identical_stamps_have_no_derivative(self):
        with self.assertRaises(ValueError):
            submission.replay_derivative(1.0, 0.0, 1.0, 1.0)


class DecimationTests(unittest.TestCase):
    def test_the_capstones_ratios(self):
        self.assertEqual(submission.control_decimation(1000.0, 500.0), 2)
        self.assertEqual(submission.control_decimation(1000.0, 1000.0), 1)
        self.assertEqual(submission.control_decimation(1000.0, 100.0), 10)

    def test_a_non_integral_ratio_is_refused(self):
        with self.assertRaises(ValueError):
            submission.control_decimation(1000.0, 300.0)

    def test_a_zero_controller_rate_is_refused(self):
        with self.assertRaises(ValueError):
            submission.control_decimation(1000.0, 0.0)


if __name__ == "__main__":
    unittest.main()
