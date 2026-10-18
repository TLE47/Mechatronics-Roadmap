"""Transfer tests for 00-foundations.T2.00a - the arm's own encoder, not a made-up ramp.

The module's worked example is a four-sample wrap. These tests move onto the shared plant: the
capstone arm's figure-8 joint trace, quantised at 4096 cpr and sampled at 1 kHz, where one count is
1.53 rad/s of velocity quantisation and the derivative has to survive it.
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


if __name__ == "__main__":
    unittest.main()
