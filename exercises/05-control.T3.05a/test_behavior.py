"""Behaviour tests for 05-control.T3.05a.

Each test names the mistake it catches:
  * a covariance update written as the naive subtraction (1 - K H) P^-, which goes negative at a
    gain of 1.5 where the Joseph form stays at 11.25 - the module's first Common-mistakes row;
  * an optimal gain that forgets the measurement noise R in the denominator;
  * a CBF filter that ignores the barrier and passes the nominal command through to the stop;
  * a barrier whose inequality is applied to the wrong side, so a command moving away from the
    stop is modified - and one moving towards it is not;
  * a rotation built with the wrong sign, which corrects the attitude in the opposite direction;
  * a margin bound with alpha dropped, which claims the barrier holds the joint where it is.
"""

import math
import unittest

import harness

submission = harness.load_submission()


class JosephTests(unittest.TestCase):
    def test_the_worked_posterior(self):
        # P^- = 4, H = 1, R = 1, K = 0.8: (0.2)^2 * 4 + 0.8^2 * 1 = 0.80.
        self.assertAlmostEqual(submission.joseph_variance(4.0, 1.0, 1.0, 0.8), 0.80, delta=1e-12)

    def test_the_worked_naive_update_agrees_at_the_optimal_gain(self):
        # At the optimal gain the two forms coincide; the Joseph form earns its keep elsewhere.
        self.assertAlmostEqual(submission.joseph_variance(4.0, 1.0, 1.0, 0.8),
                               (1.0 - 0.8 * 1.0) * 4.0, delta=1e-12)

    def test_the_optimal_gain(self):
        # K = 4 / (1 * 4 * 1 + 1) = 0.8.
        self.assertAlmostEqual(submission.optimal_gain(4.0, 1.0, 1.0), 0.8, delta=1e-12)

    def test_more_noise_means_a_smaller_gain(self):
        self.assertGreater(submission.optimal_gain(4.0, 1.0, 1.0),
                           submission.optimal_gain(4.0, 1.0, 9.0))

    def test_the_skip_test_posterior(self):
        # P^- = 2, R = 2, K = 0.5: 0.25 * 2 + 0.25 * 2 = 1.0.
        self.assertAlmostEqual(submission.joseph_variance(2.0, 1.0, 2.0, 0.5), 1.0, delta=1e-12)

    def test_the_gate_test_posterior(self):
        # P^- = 10, R = 1, K = 1.2: (1 - 1.2)^2 * 10 + 1.44 = 0.4 + 1.44 = 1.84.
        self.assertAlmostEqual(submission.joseph_variance(10.0, 1.0, 1.0, 1.2), 1.84, delta=1e-9)

    def test_a_double_sized_gain_keeps_the_variance_positive(self):
        # K_bad = 1.5 puts the naive (1 - K H) P^- at -2.0; the Joseph form squares it:
        # (-0.5)^2 * 4 + 1.5^2 * 1 = 1 + 2.25 = 3.25, positive where the naive form is not.
        naive = (1.0 - 1.5 * 1.0) * 4.0
        self.assertAlmostEqual(naive, -2.0, delta=1e-12)
        self.assertLess(naive, 0.0)
        self.assertAlmostEqual(submission.joseph_variance(4.0, 1.0, 1.0, 1.5), 3.25, delta=1e-12)
        self.assertGreater(submission.joseph_variance(4.0, 1.0, 1.0, 1.5), 0.0)

    def test_the_very_noisy_case_stays_positive(self):
        # K = 0 keeps the prior: Joseph returns it exactly, and it is never negative.
        self.assertAlmostEqual(submission.joseph_variance(4.0, 1.0, 1.0, 0.0), 4.0, delta=1e-12)

    def test_a_negative_prior_is_refused(self):
        with self.assertRaises(ValueError):
            submission.joseph_variance(-1.0, 1.0, 1.0, 0.5)
        with self.assertRaises(ValueError):
            submission.optimal_gain(-1.0, 1.0, 1.0)

    def test_zero_noise_or_a_zero_jacobian_is_refused(self):
        with self.assertRaises(ValueError):
            submission.joseph_variance(4.0, 1.0, 0.0, 0.5)
        with self.assertRaises(ValueError):
            submission.optimal_gain(4.0, 0.0, 1.0)


class CbfTests(unittest.TestCase):
    def test_the_worked_command(self):
        # h = 0.04 m, alpha = 5/s: u <= 0.20 m/s, so a 0.80 m/s request is cut to 0.20.
        self.assertAlmostEqual(submission.cbf_command(0.80, 0.04, 5.0), 0.20, delta=1e-9)

    def test_the_exercise_command(self):
        # h = 1.50 - 1.40 = 0.10 rad, alpha = 8/s: u <= 0.80 rad/s from a 1.20 rad/s request.
        self.assertAlmostEqual(submission.cbf_command(1.20, 0.10, 8.0, -2.0, 2.0),
                               0.80, delta=1e-9)

    def test_the_skip_test_command(self):
        # h = 0.05 rad, alpha = 6/s: u <= 0.30 rad/s, so 0.80 becomes 0.30.
        self.assertAlmostEqual(submission.cbf_command(0.80, 0.05, 6.0), 0.30, delta=1e-9)

    def test_a_command_away_from_the_stop_passes_through(self):
        # The same barrier (u <= 0.30) leaves a -0.40 rad/s retreat completely alone.
        self.assertAlmostEqual(submission.cbf_command(-0.40, 0.05, 6.0), -0.40, delta=1e-9)

    def test_a_satisfied_constraint_is_not_modified(self):
        # h = 0.20 rad at 8/s allows 1.60 rad/s; a 0.50 rad/s request is returned untouched.
        self.assertAlmostEqual(submission.cbf_command(0.50, 0.20, 8.0), 0.50, delta=1e-15)

    def test_the_actuator_bound_still_applies(self):
        # A far wall (limit 8 rad/s) cannot lift the 2 rad/s ceiling.
        self.assertAlmostEqual(submission.cbf_command(3.0, 1.0, 8.0, -2.0, 2.0), 2.0, delta=1e-15)
        self.assertAlmostEqual(submission.cbf_command(-3.0, 1.0, 8.0, -2.0, 2.0), -2.0, delta=1e-15)

    def test_past_the_stop_the_filter_reverses(self):
        # h = -0.05 rad is already violated: the admissible set becomes u <= -0.40 rad/s, so a zero
        # request is pushed to a retreat at exactly the barrier boundary.
        self.assertAlmostEqual(submission.cbf_command(0.0, -0.05, 8.0, -2.0, 2.0),
                               -0.40, delta=1e-12)
        self.assertAlmostEqual(submission.cbf_command(1.0, -0.05, 8.0, -2.0, 2.0),
                               -0.40, delta=1e-12)

    def test_an_infeasible_barrier_is_refused(self):
        # h = -0.50 rad at 8/s needs u <= -4.0, which the +-2 rad/s actuator cannot deliver.
        with self.assertRaises(ValueError):
            submission.cbf_command(0.0, -0.50, 8.0, -2.0, 2.0)

    def test_bad_gains_and_bounds_are_refused(self):
        with self.assertRaises(ValueError):
            submission.cbf_command(0.1, 0.1, 0.0)
        with self.assertRaises(ValueError):
            submission.cbf_command(0.1, 0.1, 8.0, 2.0, 2.0)


class RotationTests(unittest.TestCase):
    def test_the_worked_rotation(self):
        # A 0.05 rad correction about +z: [[cos, -sin, 0], [sin, cos, 0], [0, 0, 1]].
        rotation = submission.exp_so3([0.0, 0.0, 0.05])
        self.assertAlmostEqual(rotation[0][0], math.cos(0.05), delta=1e-15)
        self.assertAlmostEqual(rotation[0][1], -math.sin(0.05), delta=1e-15)
        self.assertAlmostEqual(rotation[1][0], math.sin(0.05), delta=1e-15)
        self.assertAlmostEqual(rotation[1][1], math.cos(0.05), delta=1e-15)
        self.assertAlmostEqual(rotation[2][2], 1.0, delta=1e-15)

    def test_a_correction_about_x_rotates_y_into_z(self):
        rotation = submission.exp_so3([0.10, 0.0, 0.0])
        self.assertAlmostEqual(rotation[1][1], math.cos(0.10), delta=1e-15)
        self.assertAlmostEqual(rotation[1][2], -math.sin(0.10), delta=1e-15)
        self.assertAlmostEqual(rotation[2][1], math.sin(0.10), delta=1e-15)

    def test_the_injection_preserves_the_special_orthogonal_group(self):
        nominal = submission.exp_so3([0.3, -0.2, 0.1])
        moved = submission.inject_rotation(nominal, [0.0, 0.0, 0.05])
        determinant = (
            moved[0][0] * (moved[1][1] * moved[2][2] - moved[1][2] * moved[2][1])
            - moved[0][1] * (moved[1][0] * moved[2][2] - moved[1][2] * moved[2][0])
            + moved[0][2] * (moved[1][0] * moved[2][1] - moved[1][1] * moved[2][0])
        )
        self.assertAlmostEqual(determinant, 1.0, delta=1e-12)
        for i in range(3):
            for j in range(3):
                self.assertAlmostEqual(
                    sum(moved[i][k] * moved[j][k] for k in range(3)),
                    1.0 if i == j else 0.0, delta=1e-12)

    def test_injecting_zero_returns_the_nominal_rotation(self):
        nominal = [[0.0, -1.0, 0.0], [1.0, 0.0, 0.0], [0.0, 0.0, 1.0]]
        moved = submission.inject_rotation(nominal, [0.0, 0.0, 0.0])
        for i in range(3):
            for j in range(3):
                self.assertAlmostEqual(moved[i][j], nominal[i][j], delta=1e-15)

    def test_two_small_injections_add_up(self):
        one = submission.inject_rotation(submission.exp_so3([0.0, 0.0, 0.02]),
                                         [0.0, 0.0, 0.03])
        two = submission.exp_so3([0.0, 0.0, 0.05])
        for i in range(3):
            for j in range(3):
                self.assertAlmostEqual(one[i][j], two[i][j], delta=1e-15)

    def test_a_two_component_correction_is_refused(self):
        with self.assertRaises(ValueError):
            submission.exp_so3([0.0, 0.05])
        with self.assertRaises(ValueError):
            submission.inject_rotation([[1.0, 0.0], [0.0, 1.0]], [0.0, 0.0, 0.05])


class BarrierBoundTests(unittest.TestCase):
    def test_the_gate_test_margin(self):
        # h(0) = 0.20 m, alpha = 2/s, t = 0.50 s: 0.20 * exp(-1) = 0.073575...
        self.assertAlmostEqual(submission.barrier_lower_bound(0.20, 2.0, 0.50),
                               0.20 * math.exp(-1.0), delta=1e-12)

    def test_today_is_the_initial_margin(self):
        self.assertAlmostEqual(submission.barrier_lower_bound(0.20, 2.0, 0.0),
                               0.20, delta=1e-15)

    def test_the_margin_only_shrinks(self):
        early = submission.barrier_lower_bound(0.20, 2.0, 0.25)
        middle = submission.barrier_lower_bound(0.20, 2.0, 0.50)
        late = submission.barrier_lower_bound(0.20, 2.0, 1.00)
        self.assertGreater(early, middle)
        self.assertGreater(middle, late)
        self.assertGreater(late, 0.0)

    def test_bad_margins_gains_and_times_are_refused(self):
        with self.assertRaises(ValueError):
            submission.barrier_lower_bound(-0.01, 2.0, 0.5)
        with self.assertRaises(ValueError):
            submission.barrier_lower_bound(0.20, 0.0, 0.5)
        with self.assertRaises(ValueError):
            submission.barrier_lower_bound(0.20, 2.0, -0.5)


class NeesTests(unittest.TestCase):
    def test_the_gate_test_nees(self):
        # e = [0.20, 0, 0] against variances 0.04: 0.04 / 0.04 = 1.0.
        self.assertAlmostEqual(submission.nees_diagonal([0.20, 0.0, 0.0], [0.04, 0.04, 0.04]),
                               1.0, delta=1e-12)

    def test_a_doubled_error_is_four_times_the_nees(self):
        one = submission.nees_diagonal([0.20, 0.0, 0.0], [0.04, 0.04, 0.04])
        two = submission.nees_diagonal([0.40, 0.0, 0.0], [0.04, 0.04, 0.04])
        self.assertAlmostEqual(two / one, 4.0, delta=1e-12)

    def test_a_smaller_claimed_variance_is_a_larger_nees(self):
        # The same 0.20 rad error against a filter that claims 0.01: 4.0, the overconfident flag.
        self.assertAlmostEqual(submission.nees_diagonal([0.20], [0.01]), 4.0, delta=1e-12)

    def test_a_zero_variance_and_a_length_mismatch_are_refused(self):
        with self.assertRaises(ValueError):
            submission.nees_diagonal([0.20], [0.0])
        with self.assertRaises(ValueError):
            submission.nees_diagonal([0.20, 0.0], [0.04])


if __name__ == "__main__":
    unittest.main()
