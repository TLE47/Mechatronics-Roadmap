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
        self.assertAlmostEqual(rate, 1000.0 * (plant.FRAME_BYTES + 32) / 1e6, delta=1e-12)
        size = submission.bag_size_mb(rate, 60.0)
        self.assertAlmostEqual(size, 60.0 * 1000.0 * (plant.FRAME_BYTES + 32) / 1e6, delta=1e-9)
        self.assertLess(size, 5.0, "a minute of joint telemetry is a few megabytes, not a gigabyte")

    def test_the_metadata_is_not_negligible_for_small_frames(self):
        topics = [("/telemetry", 1.0 / plant.DT, plant.FRAME_BYTES)]
        bare = submission.disk_rate_mb_s(topics, meta_bytes=0)
        with_meta = submission.disk_rate_mb_s(topics, meta_bytes=32)
        self.assertAlmostEqual(with_meta / bare, (plant.FRAME_BYTES + 32.0) / plant.FRAME_BYTES,
                               delta=1e-12)
        self.assertGreater(with_meta / bare, 1.5)

    def test_a_camera_dominates_the_budget(self):
        with_camera = submission.disk_rate_mb_s(
            [("/telemetry", 1.0 / plant.DT, plant.FRAME_BYTES), ("/camera", 30.0, 150_000)])
        without = submission.disk_rate_mb_s([("/telemetry", 1.0 / plant.DT, plant.FRAME_BYTES)])
        self.assertGreater(with_camera, 20.0 * without)


class SimulatedClockTests(unittest.TestCase):
    def test_a_250_hz_task_on_a_1_khz_clock(self):
        steps = submission.timer_steps(0.004, plant.DT)
        self.assertEqual(steps, 4)
        firings = sum(1 for tick in range(plant.TICKS) if tick % steps == 0)
        self.assertEqual(firings, 250)

    def test_a_task_that_does_not_divide_the_clock_drifts_up_in_steps(self):
        self.assertEqual(submission.timer_steps(0.003, plant.DT), 3)
        self.assertEqual(submission.timer_steps(0.0035, plant.DT), 4)

    def test_the_controller_decimation_of_the_capstone(self):
        self.assertEqual(submission.control_decimation(1.0 / plant.DT, 500.0), 2)
        self.assertEqual(submission.control_decimation(1.0 / plant.DT, 1.0 / plant.DT), 1)


class ReplayTests(unittest.TestCase):
    def test_the_recorded_tip_velocity_does_not_depend_on_the_rate(self):
        run = plant.simulate_arm(steps=120, record=True)
        trace = run["trace"]
        self.assertGreater(len(trace), 60)
        velocities = {}
        for rate in (1.0, 4.0):
            samples = []
            for k in range(40, 60):
                t_a, x_a = trace[k][0], trace[k][3]
                t_b, x_b = trace[k + 1][0], trace[k + 1][3]
                wall = submission.wall_delay_s(t_a, t_b, rate)
                self.assertAlmostEqual(wall, plant.DT / rate, delta=1e-15)
                samples.append(submission.replay_derivative(t_a, x_a, t_b, x_b))
            velocities[rate] = samples
        for a, b in zip(velocities[1.0], velocities[4.0]):
            self.assertAlmostEqual(a, b, delta=1e-15)

    def test_the_capstones_figure_eight_moves(self):
        run = plant.simulate_arm(steps=120, record=True)
        tip_velocity = [submission.replay_derivative(trace_a[0], trace_a[3], trace_b[0], trace_b[3])
                        for trace_a, trace_b in zip(run["trace"][::10], run["trace"][10::10])]
        self.assertGreater(max(abs(v) for v in tip_velocity), 1e-3)


if __name__ == "__main__":
    unittest.main()
