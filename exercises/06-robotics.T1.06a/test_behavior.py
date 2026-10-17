"""Behaviour tests for 06-robotics.T1.06a.

Each test names the mistake it catches:
  * a cubic built from s^2 alone, which reaches the target at the right position with a non-zero
    arrival speed - the jerk the whole module exists to remove;
  * the peak speed taken as the average (dq/T), which undersizes the actuator by a third;
  * a minimum duration solved with the average speed, so the move leaves at 1.5x the limit;
  * a spring-damper that applies the position gain to the velocity error;
  * a compliance yield that multiplies by stiffness instead of dividing, so a stiffer joint appears
    to yield further.
"""

import math
import unittest

import harness

submission = harness.load_submission()


class CubicTests(unittest.TestCase):
    def test_the_four_boundary_conditions(self):
        q, qd, _ = submission.cubic_rest_to_rest(0.0, 0.0, 1.2, 2.0)
        self.assertAlmostEqual(q, 0.0, delta=1e-12)
        self.assertAlmostEqual(qd, 0.0, delta=1e-12)
        q, qd, _ = submission.cubic_rest_to_rest(2.0, 0.0, 1.2, 2.0)
        self.assertAlmostEqual(q, 1.2, delta=1e-12)
        self.assertAlmostEqual(qd, 0.0, delta=1e-12)

    def test_the_midpoint(self):
        # The worked example: 1.2 rad in 2 s -> q = 0.6, qd = 0.9, qdd = 0.
        q, qd, qdd = submission.cubic_rest_to_rest(1.0, 0.0, 1.2, 2.0)
        self.assertAlmostEqual(q, 0.6, delta=1e-12)
        self.assertAlmostEqual(qd, 0.9, delta=1e-12)
        self.assertAlmostEqual(qdd, 0.0, delta=1e-12)

    def test_the_initial_acceleration_is_the_gate_tests(self):
        # dq = 2.0, T = 2.0 -> qdd(0) = 6 * 2 / 4 = 3.0; terminal is -3.0.
        self.assertAlmostEqual(submission.cubic_rest_to_rest(0.0, 0.0, 2.0, 2.0)[2], 3.0, delta=1e-12)
        self.assertAlmostEqual(submission.cubic_rest_to_rest(2.0, 0.0, 2.0, 2.0)[2], -3.0, delta=1e-12)

    def test_the_move_is_clamped_after_the_end(self):
        q, qd, qdd = submission.cubic_rest_to_rest(5.0, 0.0, 1.2, 2.0)
        self.assertAlmostEqual(q, 1.2, delta=1e-12)
        self.assertAlmostEqual(qd, 0.0, delta=1e-12)
        self.assertAlmostEqual(qdd, 0.0, delta=1e-12)

    def test_the_move_never_overshoots(self):
        previous = -1e9
        for k in range(101):
            q, _, _ = submission.cubic_rest_to_rest(2.0 * k / 100.0, -0.5, 0.9, 2.0)
            self.assertGreaterEqual(q, previous - 1e-12)
            self.assertLessEqual(q, 0.9 + 1e-12)
            previous = q

    def test_a_zero_duration_is_refused(self):
        with self.assertRaises(ValueError):
            submission.cubic_rest_to_rest(0.0, 0.0, 1.0, 0.0)


class CoefficientTests(unittest.TestCase):
    def test_the_coefficients_reproduce_the_polynomial(self):
        q0, qf, T = 0.3, 1.1, 1.6
        a0, a1, a2, a3 = submission.cubic_coefficients(q0, qf, T)
        self.assertAlmostEqual(a0, q0, delta=1e-12)
        self.assertAlmostEqual(a1, 0.0, delta=1e-12)
        for t in (0.0, 0.4, 0.8, 1.6):
            poly = a0 + a1 * t + a2 * t * t + a3 * t ** 3
            self.assertAlmostEqual(poly, submission.cubic_rest_to_rest(t, q0, qf, T)[0], delta=1e-12)

    def test_the_coefficients_have_zero_endpoint_velocities(self):
        q0, qf, T = 0.0, 2.0, 2.0
        _a0, a1, a2, a3 = submission.cubic_coefficients(q0, qf, T)
        start_velocity = a1
        end_velocity = a1 + 2.0 * a2 * T + 3.0 * a3 * T * T
        self.assertAlmostEqual(start_velocity, 0.0, delta=1e-12)
        self.assertAlmostEqual(end_velocity, 0.0, delta=1e-12)
        self.assertAlmostEqual(a3, -2.0 * (qf - q0) / T ** 3, delta=1e-12)


class SpeedAndDurationTests(unittest.TestCase):
    def test_the_peak_is_one_and_a_half_times_the_average(self):
        self.assertAlmostEqual(submission.peak_velocity(2.0, 4.0), 0.75, delta=1e-12)
        self.assertAlmostEqual(submission.peak_velocity(1.2, 2.0), 0.9, delta=1e-12)

    def test_the_exercise_minimum_duration(self):
        # dq = 2.0 rad, qd_max = 3.0 rad/s -> 1.0 s, and that move really does peak at 3.0.
        T = submission.min_duration_s(2.0, 3.0)
        self.assertAlmostEqual(T, 1.0, delta=1e-12)
        self.assertAlmostEqual(submission.cubic_rest_to_rest(T / 2.0, 0.0, 2.0, T)[1], 3.0,
                               delta=1e-12)

    def test_a_reverse_move_is_the_same_duration(self):
        self.assertAlmostEqual(submission.min_duration_s(-2.0, 3.0), 1.0, delta=1e-12)

    def test_the_acceleration_limited_duration(self):
        # peak accel 6 dq / T^2 = 3.0 for dq = 2.0 -> T = 2.0 s.
        T = submission.min_duration_for_acceleration(2.0, 3.0)
        self.assertAlmostEqual(T, 2.0, delta=1e-12)
        self.assertAlmostEqual(submission.cubic_rest_to_rest(0.0, 0.0, 2.0, T)[2], 3.0, delta=1e-12)

    def test_bad_limits_are_refused(self):
        for limit in (0.0, -1.0):
            with self.assertRaises(ValueError):
                submission.min_duration_s(1.0, limit)
            with self.assertRaises(ValueError):
                submission.min_duration_for_acceleration(1.0, limit)


class SpringDamperTests(unittest.TestCase):
    def test_the_gate_test_torque(self):
        # 10*(0.1) + 1*(0.3) + 0.4 = 1.7 N*m.
        self.assertAlmostEqual(
            submission.spring_damper_torque(0.8, 0.7, 0.5, 0.2, 10.0, 1.0, 0.4), 1.7, delta=1e-12)

    def test_the_damping_acts_on_velocity_only(self):
        stiffness_only = submission.spring_damper_torque(0.5, 0.5, 2.0, 0.0, 10.0, 3.0)
        self.assertAlmostEqual(stiffness_only, 6.0, delta=1e-12)

    def test_at_rest_with_gravity_feedforward_nothing_moves(self):
        self.assertAlmostEqual(
            submission.spring_damper_torque(0.4, 0.4, 0.0, 0.0, 8.0, 0.5, -1.2), -1.2, delta=1e-12)

    def test_a_negative_gain_is_refused(self):
        with self.assertRaises(ValueError):
            submission.spring_damper_torque(0.0, 0.0, 0.0, 0.0, -1.0, 1.0)


class ComplianceTests(unittest.TestCase):
    def test_the_worked_deflection(self):
        self.assertAlmostEqual(submission.compliance_deflection(0.50, 5.0), 0.10, delta=1e-12)

    def test_a_stiffer_spring_yields_less(self):
        soft = submission.compliance_deflection(0.8, 4.0)
        stiff = submission.compliance_deflection(0.8, 20.0)
        self.assertAlmostEqual(soft, 0.20, delta=1e-12)
        self.assertLess(stiff, soft)

    def test_zero_stiffness_is_refused(self):
        with self.assertRaises(ValueError):
            submission.compliance_deflection(0.1, 0.0)


if __name__ == "__main__":
    unittest.main()
