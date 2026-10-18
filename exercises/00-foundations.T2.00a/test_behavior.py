"""Behaviour tests for 00-foundations.T2.00a.

Each test names the mistake it catches:
  * a velocity that never divided by `dt`, or one that ignores `cpr`;
  * an unwrapped difference at the encoder's zero (a 4095 -> 0 step is +1 count, not -4095);
  * a running integral that is not running (re-integrating from zero each step);
  * a round trip that does not land back on the encoder's angle.
"""

import math
import unittest

import harness

submission = harness.load_submission()
plant = harness.plant


ONE_COUNT = 2.0 * math.pi / plant.ENCODER_CPR


def counts_from_angles(angles, cpr=plant.ENCODER_CPR):
    return [plant.encoder_counts(a, cpr=cpr) for a in angles]


class VelocityTests(unittest.TestCase):
    def test_constant_speed_is_recovered(self):
        # One count per sample: the only speed a 12-bit encoder can hold exactly.
        counts = list(range(6))
        got = submission.joint_velocity(counts, 1e-3)
        self.assertEqual(
            len(got), len(counts),
            msg="expected one velocity per count sample, so the trace keeps its length; a shorter "
                "list means the first sample was dropped, which shifts every index after it",
        )
        self.assertEqual(
            got[0], 0.0,
            msg="expected the first sample's velocity to be exactly 0.0, since no previous count "
                "exists to difference against; a nonzero value means the history was invented - "
                "check the first-sample case",
        )
        for value in got[1:]:
            self.assertAlmostEqual(
                value, ONE_COUNT / 1e-3, delta=1e-6,
                msg="expected one count per millisecond to be 1.53398 rad/s at 4096 cpr; a value "
                    "1000 times smaller means the sample time was not divided out - check dt",
            )

    def test_divides_by_the_sample_time(self):
        counts = list(range(4))
        slow = submission.joint_velocity(counts, 1e-2)
        fast = submission.joint_velocity(counts, 1e-3)
        self.assertGreater(
            fast[1], 0.0,
            msg="expected a rising count sequence to give a positive velocity at 1 ms; a value "
                "at or below zero means the difference was taken backwards - check c[k] - c[k-1]",
        )
        self.assertAlmostEqual(
            slow[1] * 10.0, fast[1], delta=1e-6,
            msg="expected the same count step at a ten-times-longer sample time to give a "
                "ten-times-smaller velocity; equality without the factor means dt never entered "
                "the division",
        )

    def test_uses_the_counts_per_revolution_it_is_given(self):
        counts = [0, 1, 2, 3]
        fine = submission.joint_velocity(counts, 1e-3, cpr=4096)
        coarse = submission.joint_velocity(counts, 1e-3, cpr=1024)
        self.assertAlmostEqual(
            fine[1], ONE_COUNT / 1e-3, delta=1e-6,
            msg="expected a 4096 cpr estimate to be one count of 1.53398 rad/s per millisecond; a "
                "different value means the cpr argument was ignored and the plant's default used",
        )
        self.assertAlmostEqual(
            coarse[1], 4.0 * fine[1], delta=1e-6,
            msg="expected a 1024 cpr encoder to read four times coarser, since one of its counts "
                "spans four of the fine encoder's; a ratio of one means cpr is not used - check "
                "the argument",
        )

    def test_wraps_across_encoder_zero(self):
        counts = [4094, 4095, 0, 1, 2]
        got = submission.joint_velocity(counts, 1e-3)
        for value in got[1:]:
            self.assertAlmostEqual(
                value, ONE_COUNT / 1e-3, delta=1e-6,
                msg="expected the 4095 -> 0 step to read as +1 count, 1.53398 rad/s, not as a "
                    "full-turn jump; a negative or huge value means the difference was not "
                    "wrapped to +/- half a turn - check the count modulo",
            )


class IntegralTests(unittest.TestCase):
    def test_constant_input(self):
        got = submission.running_integral([2.0, 2.0, 2.0], 0.5)
        for expected, value in zip([1.0, 2.0, 3.0], got):
            self.assertAlmostEqual(
                value, expected, delta=1e-12,
                msg="expected a constant 2.0 rad/s at a 0.5 s step to accumulate 1, 2, 3 rad; a "
                    "repeating 1.0 means the sum restarts each sample instead of running - check "
                    "the accumulator",
            )

    def test_is_running_not_restarted(self):
        got = submission.running_integral([1.0, 2.0, 3.0, 4.0], 0.1)
        for index, value in enumerate(got, start=1):
            self.assertAlmostEqual(
                value, 0.1 * sum(range(1, index + 1)), delta=1e-12,
                msg="expected the n-th output to be the running sum of the first n inputs times "
                    "the step; a value equal to only the latest sample means the history is lost",
            )

    def test_inverts_the_velocity_estimate(self):
        angles = [0.0007 * k * k for k in range(12)]
        counts = counts_from_angles(angles)
        velocity = submission.joint_velocity(counts, 1e-3)
        integrated = submission.running_integral(velocity, 1e-3)
        first = plant.counts_to_rad(counts[0])
        for index, value in enumerate(integrated):
            expected = plant.counts_to_rad(counts[index]) - first
            self.assertAlmostEqual(
                value, expected, delta=1e-6,
                msg="expected integrating the estimated velocity to recover the encoder's own "
                    "angle change, since the two are exact inverses on quantised data; a drift "
                    "means one of the pair uses another cpr or dt",
            )


class TraceTests(unittest.TestCase):
    def test_round_trip_lands_on_the_encoder_angle(self):
        angles = [0.3 + 0.02 * k for k in range(20)]
        counts = counts_from_angles(angles)
        trace = submission.encoder_trace_angle(counts, 1e-3)
        self.assertEqual(
            len(trace), len(counts),
            msg="expected one angle per count sample in the trace; a shorter list means samples "
                "were skipped or merged, which would misalign the plot against the command",
        )
        one_count = 2.0 * math.pi / plant.ENCODER_CPR
        for index, value in enumerate(trace):
            self.assertAlmostEqual(
                value, plant.counts_to_rad(counts[index]), delta=one_count + 1e-9,
                msg="expected the round trip to land on the encoder's own angle within one count, "
                    "which is all the quantiser allows; a larger error means the trace integrated "
                    "instead of converting - check counts_to_rad",
            )


if __name__ == "__main__":
    unittest.main()
