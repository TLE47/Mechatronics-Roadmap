"""Transfer tests for 06-robotics.T2.06b - the capstone run, recorded and replayed.

Three claims, measured on the shared plant:
  1. the plant's 20-byte telemetry frame at 1 kHz, recorded for a minute, costs what the disk budget
     says - and the per-message metadata is a sixth of it;
  2. a 250 Hz task on the plant's 1 kHz clock fires exactly four ticks apart, 250 times in a
     1000-tick run;
  3. the recorded figure-8 tip velocity is the same at `--rate 1.0` and `--rate 4.0`, because the
     derivative is taken on the bag's own stamps.
"""

import math
import unittest

import harness

submission = harness.load_submission()
plant = harness.plant


class RecordingTheTelemetryTests(unittest.TestCase):
    def test_one_minute_of_frames(self):
        topics = [("/telemetry", 1.0 / plant.DT, plant.FRAME_BYTES)]
        rate = submission.disk_rate_mb_s(topics, meta_bytes=32, compression=1.0)
        self.assertAlmostEqual(
            rate, 1000.0 * (plant.FRAME_BYTES + 32) / 1e6, delta=1e-12,
            msg="expected 20 payload bytes plus 32 of metadata at 1 kHz to be 0.052 MB/s; 0.02 "
                "means the metadata was dropped - check meta_bytes",
        )
        size = submission.bag_size_mb(rate, 60.0)
        self.assertAlmostEqual(
            size, 60.0 * 1000.0 * (plant.FRAME_BYTES + 32) / 1e6, delta=1e-9,
            msg="expected a minute at 0.052 MB/s to be 3.12 MB; another value likely applied the "
                "duration to the payload alone",
        )
        self.assertLess(
            size, 5.0,
            msg="expected a minute of joint telemetry to stay in the low megabytes, not grow into "
                "gigabytes; a larger figure likely counted bits as bytes",
        )

    def test_the_metadata_is_not_negligible_for_small_frames(self):
        topics = [("/telemetry", 1.0 / plant.DT, plant.FRAME_BYTES)]
        bare = submission.disk_rate_mb_s(topics, meta_bytes=0)
        with_meta = submission.disk_rate_mb_s(topics, meta_bytes=32)
        self.assertAlmostEqual(
            with_meta / bare, (plant.FRAME_BYTES + 32.0) / plant.FRAME_BYTES, delta=1e-12,
            msg="expected the 32-byte index to inflate the 20-byte frame by 52/20; a smaller "
                "ratio means only part of the metadata was counted",
        )
        self.assertGreater(
            with_meta / bare, 1.5,
            msg="expected the index to add more than half again to a small topic's traffic; a "
                "smaller ratio means the metadata is being treated as negligible",
        )

    def test_a_camera_dominates_the_budget(self):
        with_camera = submission.disk_rate_mb_s(
            [("/telemetry", 1.0 / plant.DT, plant.FRAME_BYTES), ("/camera", 30.0, 150_000)])
        without = submission.disk_rate_mb_s([("/telemetry", 1.0 / plant.DT, plant.FRAME_BYTES)])
        self.assertGreater(
            with_camera, 20.0 * without,
            msg="expected a 30 Hz depth camera to dwarf the joint telemetry, so the disk budget "
                "is camera-bound; a smaller ratio likely dropped the camera's frame size",
        )


class SimulatedClockTests(unittest.TestCase):
    def test_a_250_hz_task_on_a_1_khz_clock(self):
        steps = submission.timer_steps(0.004, plant.DT)
        self.assertEqual(
            steps, 4,
            msg="expected a 250 Hz task to fire every fourth 1 kHz tick; another count would "
                "make the ratio drift against the clock",
        )
        firings = sum(1 for tick in range(plant.TICKS) if tick % steps == 0)
        self.assertEqual(
            firings, 250,
            msg="expected 250 firings in the plant's 1000-tick second; 251 or 249 likely means "
                "the boundary tick was counted twice or skipped",
        )

    def test_a_task_that_does_not_divide_the_clock_drifts_up_in_steps(self):
        self.assertEqual(
            submission.timer_steps(0.003, plant.DT), 3,
            msg="expected a 3 ms period at 1 ms to be exactly three steps; 4 likely let the "
                "float epsilon guard over-correct",
        )
        self.assertEqual(
            submission.timer_steps(0.0035, plant.DT), 4,
            msg="expected 3.5 ms to round up to four steps; three would fire the timer early on "
                "every period - check the ceiling",
        )

    def test_the_controller_decimation_of_the_capstone(self):
        self.assertEqual(
            submission.control_decimation(1.0 / plant.DT, 500.0), 2,
            msg="expected the capstone's 500 Hz controller on a 1 kHz simulation to run every "
                "second tick; another value means the decimation was inverted",
        )
        self.assertEqual(
            submission.control_decimation(1.0 / plant.DT, 1.0 / plant.DT), 1,
            msg="expected the controller at the simulation rate to run on every tick; a value "
                "above 1 would starve it - check equal rates give 1",
        )


class ReplayTests(unittest.TestCase):
    def test_the_recorded_tip_velocity_does_not_depend_on_the_rate(self):
        run = plant.simulate_arm(steps=120, record=True)
        trace = run["trace"]
        self.assertGreater(
            len(trace), 60,
            msg="expected the plant to record more than 60 samples in 120 steps; a shorter trace "
                "means the recorder dropped rows and the replay test has nothing to compare",
        )
        velocities = {}
        for rate in (1.0, 4.0):
            samples = []
            for k in range(40, 60):
                t_a, x_a = trace[k][0], trace[k][3]
                t_b, x_b = trace[k + 1][0], trace[k + 1][3]
                wall = submission.wall_delay_s(t_a, t_b, rate)
                self.assertAlmostEqual(
                    wall, plant.DT / rate, delta=1e-15,
                    msg="expected the wall delay to be one plant tick divided by the playback "
                        "rate; an unscaled value means --rate has no effect on playback",
                )
                samples.append(submission.replay_derivative(t_a, x_a, t_b, x_b))
            velocities[rate] = samples
        for a, b in zip(velocities[1.0], velocities[4.0]):
            self.assertAlmostEqual(
                a, b, delta=1e-15,
                msg="expected the recorded velocity to be bit-identical at 1x and 4x playback, "
                "since the stamps come from the bag; a difference means the wall gap was used",
            )

    def test_the_capstones_figure_eight_moves(self):
        run = plant.simulate_arm(steps=120, record=True)
        tip_velocity = [submission.replay_derivative(trace_a[0], trace_a[3], trace_b[0], trace_b[3])
                        for trace_a, trace_b in zip(run["trace"][::10], run["trace"][10::10])]
        self.assertGreater(
            max(abs(v) for v in tip_velocity), 1e-3,
            msg="expected the figure-eight tip to move during the recorded run, so the derivative "
                "is meaningful; a near-zero velocity means the tip column was read wrongly",
        )


if __name__ == "__main__":
    unittest.main()
