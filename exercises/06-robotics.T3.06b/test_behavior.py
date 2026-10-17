"""Behaviour tests for 06-robotics.T3.06b.

Each test names the mistake it catches:
  * a return discounted from t=0 rather than from each step, so every G_t except G_0 is too big;
  * a PPO term that takes the max of the raw and clipped products - right for a positive advantage,
    and the opposite of the pessimism the clip exists for when the advantage is negative;
  * a uniform average where the exponential weights belong, which makes a stale prediction count as
    much as a fresh one;
  * a safety shield that clamps to the joint limits but never step-limits, so an out-of-distribution
    action still jumps a whole radian in one tick;
  * a watchdog that compares against the first chunk it ever saw and trips on a live policy.
"""

import math
import unittest

import harness

submission = harness.load_submission()


class ReturnTests(unittest.TestCase):
    def test_the_worked_returns(self):
        returns = submission.discounted_returns([1.0, 2.0, 4.0], gamma=0.9)
        self.assertAlmostEqual(returns[0], 6.04, delta=1e-12)
        self.assertAlmostEqual(returns[1], 5.6, delta=1e-12)
        self.assertAlmostEqual(returns[2], 4.0, delta=1e-12)

    def test_each_step_is_discounted_from_its_own_time(self):
        # The module's exercise: r = [0, 0, 10] at gamma 0.95 -> G_0 = 9.025, G_1 = 9.5, G_2 = 10.
        returns = submission.discounted_returns([0.0, 0.0, 10.0], gamma=0.95)
        self.assertAlmostEqual(returns[0], 9.025, delta=1e-12)
        self.assertAlmostEqual(returns[1], 9.5, delta=1e-12)
        self.assertAlmostEqual(returns[2], 10.0, delta=1e-12)

    def test_a_discount_of_one_is_refused(self):
        for gamma in (1.0, -0.1):
            with self.assertRaises(ValueError):
                submission.discounted_returns([1.0], gamma=gamma)

    def test_an_empty_rollout_is_refused(self):
        with self.assertRaises(ValueError):
            submission.discounted_returns([])


class AdvantageTests(unittest.TestCase):
    def test_the_advantage_is_return_minus_value(self):
        self.assertEqual(submission.advantages([6.0, 5.0], [5.5, 6.0]), [0.5, -1.0])

    def test_a_length_mismatch_is_refused(self):
        with self.assertRaises(ValueError):
            submission.advantages([1.0, 2.0], [1.0])


class PPOTests(unittest.TestCase):
    def test_the_worked_clip(self):
        # rho = 1.5 outside [0.8, 1.2]: min(3.0, 2.4) = 2.4.
        self.assertAlmostEqual(submission.ppo_clip_term(1.5, 2.0, eps=0.2), 2.4, delta=1e-12)

    def test_a_negative_advantage_is_clipped_pessimistically(self):
        # The module's exercise: rho = 0.6, A = -3 -> min(-1.8, -2.4) = -2.4, not -1.8.
        self.assertAlmostEqual(submission.ppo_clip_term(0.6, -3.0, eps=0.2), -2.4, delta=1e-12)

    def test_a_ratio_inside_the_trust_region_is_not_clipped(self):
        self.assertAlmostEqual(submission.ppo_clip_term(1.1, 4.0, eps=0.2), 4.4, delta=1e-12)
        self.assertAlmostEqual(submission.ppo_clip_term(0.8, -4.0, eps=0.2), -3.2, delta=1e-12)

    def test_a_bad_clip_range_or_ratio_is_refused(self):
        for eps in (0.0, -0.2):
            with self.assertRaises(ValueError):
                submission.ppo_clip_term(1.0, 1.0, eps=eps)
        with self.assertRaises(ValueError):
            submission.ppo_clip_term(-0.5, 1.0)

    def test_the_batch_loss_is_the_mean_of_the_terms(self):
        ratios = [1.5, 0.6, 1.0]
        advs = [2.0, -3.0, 1.0]
        expected = (2.4 - 2.4 + 1.0) / 3.0
        self.assertAlmostEqual(submission.ppo_loss(ratios, advs, eps=0.2), expected, delta=1e-12)
        with self.assertRaises(ValueError):
            submission.ppo_loss([1.0], [1.0, 2.0])


class EnsembleTests(unittest.TestCase):
    def test_the_worked_ensemble(self):
        value = submission.temporal_ensemble([0.52, 0.50, 0.46], decay=0.5)
        self.assertAlmostEqual(value, 0.5026767, delta=1e-6)
        self.assertLess(0.46, value)
        self.assertLess(value, 0.52)

    def test_zero_decay_is_the_plain_mean(self):
        self.assertAlmostEqual(submission.temporal_ensemble([0.52, 0.50, 0.46], decay=0.0),
                               (0.52 + 0.50 + 0.46) / 3.0, delta=1e-12)

    def test_the_newest_prediction_dominates(self):
        value = submission.temporal_ensemble([1.0, 0.0, 0.0], decay=5.0)
        self.assertGreater(value, 0.98)

    def test_an_empty_chunk_or_negative_decay_is_refused(self):
        with self.assertRaises(ValueError):
            submission.temporal_ensemble([])
        with self.assertRaises(ValueError):
            submission.temporal_ensemble([1.0], decay=-1.0)


class ShieldTests(unittest.TestCase):
    def test_a_wild_command_is_step_limited(self):
        # The module's worked example: q = 0.50, policy +2.80, clamp 0.08 -> 0.58.
        self.assertAlmostEqual(submission.safety_shield(2.80, 0.50, dq_max=0.08), 0.58, delta=1e-12)

    def test_a_command_inside_the_clamp_passes_through(self):
        self.assertAlmostEqual(submission.safety_shield(0.53, 0.50, dq_max=0.08), 0.53, delta=1e-12)

    def test_the_hard_limit_wins_at_the_edge(self):
        # q = -1.45, clamp 0.10, limit -1.50, policy -2.00 -> rate limit reaches -1.55, the limit wins.
        self.assertAlmostEqual(
            submission.safety_shield(-2.0, -1.45, dq_max=0.10, q_min=-1.5, q_max=1.5),
            -1.50, delta=1e-12)

    def test_a_bad_clamp_or_inverted_limits_are_refused(self):
        with self.assertRaises(ValueError):
            submission.safety_shield(0.0, 0.0, dq_max=0.0)
        with self.assertRaises(ValueError):
            submission.safety_shield(0.0, 0.0, q_min=1.0, q_max=-1.0)


class WatchdogTests(unittest.TestCase):
    def test_silence_past_the_timeout_trips(self):
        self.assertTrue(submission.watchdog_trip(1.000, 1.101, timeout_s=0.1))

    def test_exactly_at_the_timeout_is_still_alive(self):
        self.assertFalse(submission.watchdog_trip(1.0, 1.5, timeout_s=0.5))

    def test_a_fresh_chunk_resets_the_clock(self):
        # A policy that has been running for ten seconds but sent a chunk 20 ms ago is healthy;
        # comparing against the first chunk it ever sent would trip here.
        self.assertFalse(submission.watchdog_trip(10.020, 10.040, timeout_s=0.1))

    def test_a_bad_timeout_is_refused(self):
        with self.assertRaises(ValueError):
            submission.watchdog_trip(0.0, 1.0, timeout_s=0.0)


if __name__ == "__main__":
    unittest.main()
