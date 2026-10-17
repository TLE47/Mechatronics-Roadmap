"""Transfer tests for 00-foundations.T2.00a - the arm's own encoder, not a made-up ramp.

The module's worked example is a cart with a remembered `m = 1.0 kg, k = 100 N/m`. These tests move
the exercise onto the shared plant and change the numbers: the capstone arm's figure-8 joint trace,
quantised at 4096 cpr and sampled at 1 kHz, and a second mass-spring whose parameters are not the
worked example's.
"""

import math
import unittest

import harness

submission = harness.load_submission()
plant = harness.plant


def arm_q1_trace(ticks=200):
    return [plant.ik(*plant.figure8_target(k * plant.DT))[0] for k in range(ticks)]


class ArmEncoderTests(unittest.TestCase):
    def test_velocity_estimate_tracks_a_smoothed_signal(self):
        angles = arm_q1_trace()
        counts = [plant.encoder_counts(a) for a in angles]
        estimate = submission.joint_velocity(counts, plant.DT)
        true_velocity = [(angles[k] - angles[k - 1]) / plant.DT for k in range(1, len(angles))]

        # At 1 kHz a 12-bit count is 1.53 rad/s of velocity quantisation, so the instantaneous
        # estimate is expected to be noisy. Its MOVING AVERAGE over 50 ms is not.
        window = 50
        smoothed = [
            sum(estimate[k - window:k]) / window for k in range(window, len(estimate))
        ]
        smoothed_truth = [
            sum(true_velocity[k - window:k]) / window for k in range(window, len(estimate))
        ]
        worst = max(abs(a - b) for a, b in zip(smoothed, smoothed_truth))
        self.assertLess(worst, 0.35, "50 ms mean of the encoder velocity is %.3f rad/s off" % worst)

    def test_total_angle_change_survives_quantisation(self):
        angles = arm_q1_trace(400)
        counts = [plant.encoder_counts(a) for a in angles]
        estimate = submission.joint_velocity(counts, plant.DT)
        integrated = submission.running_integral(estimate, plant.DT)[-1]
        truth = plant.wrap_pi(plant.counts_to_rad(counts[-1]) - plant.counts_to_rad(counts[0]))
        self.assertAlmostEqual(integrated, truth, delta=1e-6)
        self.assertLess(abs(integrated - plant.wrap_pi(angles[-1] - angles[0])), 2 * math.pi / 4096)


class ChangedPlantTests(unittest.TestCase):
    def test_a_heavier_softer_plant_still_settles_at_u_over_k(self):
        m, k, b, dt = 2.5, 40.0, 6.0, 0.002
        Ad, Bd = submission.state_matrices(m, k, b, dt)
        final = submission.simulate(Ad, Bd, [0.0, 0.0], 4.0, 4000)
        self.assertAlmostEqual(final[0], 4.0 / k, delta=2e-3)
        self.assertAlmostEqual(final[1], 0.0, delta=2e-4)

    def test_a_shorter_sample_time_changes_the_matrices(self):
        slow = submission.state_matrices(1.0, 100.0, 10.0, 0.01)
        fast = submission.state_matrices(1.0, 100.0, 10.0, 0.001)
        self.assertAlmostEqual(slow[0][0][1] / fast[0][0][1], 10.0, delta=1e-9)
        self.assertAlmostEqual(slow[1][1] / fast[1][1], 10.0, delta=1e-9)


if __name__ == "__main__":
    unittest.main()
