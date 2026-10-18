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
        self.assertAlmostEqual(
            q, 0.0, delta=1e-12,
            msg="expected q(0) to equal q0 = 0.0; a non-zero start likely added a0 at the wrong t - check the t=0 boundary")
        self.assertAlmostEqual(
            qd, 0.0, delta=1e-12,
            msg="expected the start velocity to be 0.0 for a rest-to-rest move; a non-zero a1 likely skipped the zero-velocity boundary")
        q, qd, _ = submission.cubic_rest_to_rest(2.0, 0.0, 1.2, 2.0)
        self.assertAlmostEqual(
            q, 1.2, delta=1e-12,
            msg="expected q(T) to land on qf = 1.2; a value short of target likely evaluated at t=T/2 - check the time argument")
        self.assertAlmostEqual(
            qd, 0.0, delta=1e-12,
            msg="expected the arrival velocity to be 0.0; a non-zero end speed likely solved only the position condition - check the T term")

    def test_the_midpoint(self):
        # The worked example: 1.2 rad in 2 s -> q = 0.6, qd = 0.9, qdd = 0.
        q, qd, qdd = submission.cubic_rest_to_rest(1.0, 0.0, 1.2, 2.0)
        self.assertAlmostEqual(
            q, 0.6, delta=1e-12,
            msg="expected the halfway position to be 0.6 rad at t = T/2; a value near 0.3 likely halved twice - check the 1.2 rad span")
        self.assertAlmostEqual(
            qd, 0.9, delta=1e-12,
            msg="expected the midpoint speed to be 0.9 rad/s = 1.5 dq/T; a 0.6 value likely used the average speed - check the 1.5 factor")
        self.assertAlmostEqual(
            qdd, 0.0, delta=1e-12,
            msg="expected zero acceleration at mid-move by symmetry; a non-zero value likely kept an odd coefficient - check the cubic terms")

    def test_the_initial_acceleration_is_the_gate_tests(self):
        # dq = 2.0, T = 2.0 -> qdd(0) = 6 * 2 / 4 = 3.0; terminal is -3.0.
        self.assertAlmostEqual(
            submission.cubic_rest_to_rest(0.0, 0.0, 2.0, 2.0)[2], 3.0, delta=1e-12,
            msg="expected qdd(0) = 6 dq/T^2 = 3.0 rad/s^2; a value of 1.5 likely used dq/T - check the 6 and the T squared")
        self.assertAlmostEqual(
            submission.cubic_rest_to_rest(2.0, 0.0, 2.0, 2.0)[2], -3.0, delta=1e-12,
            msg="expected qdd(T) = -3.0 rad/s^2 to mirror the start; a positive value likely dropped the a3 sign - check the cubic coefficient")

    def test_the_move_is_clamped_after_the_end(self):
        q, qd, qdd = submission.cubic_rest_to_rest(5.0, 0.0, 1.2, 2.0)
        self.assertAlmostEqual(
            q, 1.2, delta=1e-12,
            msg="expected the pose to hold at qf = 1.2 past the end; a value near 6.0 likely extrapolated - check the t > T clamp")
        self.assertAlmostEqual(
            qd, 0.0, delta=1e-12,
            msg="expected zero speed after the move ends; a non-zero value likely clamped position only - check the velocity branch")
        self.assertAlmostEqual(
            qdd, 0.0, delta=1e-12,
            msg="expected zero acceleration after the move ends; a non-zero value likely reused the last sample - check the early return")

    def test_the_move_never_overshoots(self):
        previous = -1e9
        for k in range(101):
            q, _, _ = submission.cubic_rest_to_rest(2.0 * k / 100.0, -0.5, 0.9, 2.0)
            self.assertGreaterEqual(
                q, previous - 1e-12,
                msg="expected a monotone ramp from -0.5 to 0.9; a drop likely made the cubic coefficient negative - check signs")
            self.assertLessEqual(
                q, 0.9 + 1e-12,
                msg="expected the move to stop at qf = 0.9; an overshoot likely solved for velocity and not position - check the end condition")
            previous = q

    def test_a_zero_duration_is_refused(self):
        with self.assertRaises(ValueError):
            submission.cubic_rest_to_rest(0.0, 0.0, 1.0, 0.0)


class CoefficientTests(unittest.TestCase):
    def test_the_coefficients_reproduce_the_polynomial(self):
        q0, qf, T = 0.3, 1.1, 1.6
        a0, a1, a2, a3 = submission.cubic_coefficients(q0, qf, T)
        self.assertAlmostEqual(
            a0, q0, delta=1e-12,
            msg="expected the constant term to be the start pose 0.3; a 0.0 likely assumed rest from the origin - check a0")
        self.assertAlmostEqual(
            a1, 0.0, delta=1e-12,
            msg="expected the linear term to be 0.0 for a rest-to-rest move; a non-zero value likely came from a start speed - check the boundary")
        for t in (0.0, 0.4, 0.8, 1.6):
            poly = a0 + a1 * t + a2 * t * t + a3 * t ** 3
            self.assertAlmostEqual(
                poly, submission.cubic_rest_to_rest(t, q0, qf, T)[0], delta=1e-12,
                msg="expected the coefficients to reproduce the polynomial at every t; a mismatch likely used a different T - check a2 and a3")

    def test_the_coefficients_have_zero_endpoint_velocities(self):
        q0, qf, T = 0.0, 2.0, 2.0
        _a0, a1, a2, a3 = submission.cubic_coefficients(q0, qf, T)
        start_velocity = a1
        end_velocity = a1 + 2.0 * a2 * T + 3.0 * a3 * T * T
        self.assertAlmostEqual(
            start_velocity, 0.0, delta=1e-12,
            msg="expected the start velocity a1 to be 0.0; a non-zero value likely copied the average speed - check a1")
        self.assertAlmostEqual(
            end_velocity, 0.0, delta=1e-12,
            msg="expected the end velocity to vanish; a value near 2 dq/T likely dropped the a3 derivative - check the 3 a3 T^2 term")
        self.assertAlmostEqual(
            a3, -2.0 * (qf - q0) / T ** 3, delta=1e-12,
            msg="expected a3 = -2 dq/T^3; a value of 2 dq/T^3 likely flipped the sign - check the two zero-velocity conditions")


class SpeedAndDurationTests(unittest.TestCase):
    def test_the_peak_is_one_and_a_half_times_the_average(self):
        self.assertAlmostEqual(
            submission.peak_velocity(2.0, 4.0), 0.75, delta=1e-12,
            msg="expected the peak to be 1.5 dq/T = 0.75 rad/s; a 0.5 value likely returned the average - check the 1.5 factor")
        self.assertAlmostEqual(
            submission.peak_velocity(1.2, 2.0), 0.9, delta=1e-12,
            msg="expected 0.9 rad/s for a 1.2 rad move in 2 s; a 0.6 value likely divided by T alone - check the multiplier")

    def test_the_exercise_minimum_duration(self):
        # dq = 2.0 rad, qd_max = 3.0 rad/s -> 1.0 s, and that move really does peak at 3.0.
        T = submission.min_duration_s(2.0, 3.0)
        self.assertAlmostEqual(
            T, 1.0, delta=1e-12,
            msg="expected the minimum duration to be 1.5 dq/qd_max = 1.0 s; a 0.667 s answer likely used the average - check the 1.5")
        self.assertAlmostEqual(
            submission.cubic_rest_to_rest(T / 2.0, 0.0, 2.0, T)[1], 3.0, delta=1e-12,
            msg="expected the midpoint of that move to peak exactly at the 3.0 rad/s limit; a lower peak likely overshot the duration")

    def test_a_reverse_move_is_the_same_duration(self):
        self.assertAlmostEqual(
            submission.min_duration_s(-2.0, 3.0), 1.0, delta=1e-12,
            msg="expected a reverse move to take the same 1.0 s; a negative duration likely kept the sign - check abs on the span")

    def test_the_acceleration_limited_duration(self):
        # peak accel 6 dq / T^2 = 3.0 for dq = 2.0 -> T = 2.0 s.
        T = submission.min_duration_for_acceleration(2.0, 3.0)
        self.assertAlmostEqual(
            T, 2.0, delta=1e-12,
            msg="expected T = sqrt(6 dq/a_max) = 2.0 s; a 1.15 s value likely forgot the 6 - check the peak-acceleration form")
        self.assertAlmostEqual(
            submission.cubic_rest_to_rest(0.0, 0.0, 2.0, T)[2], 3.0, delta=1e-12,
            msg="expected that duration to reach the 3.0 rad/s^2 limit at t=0; a lower value likely rounded T up - check the square root")

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
            submission.spring_damper_torque(0.8, 0.7, 0.5, 0.2, 10.0, 1.0, 0.4), 1.7, delta=1e-12,
            msg="expected kp*e + kd*edot + ff = 1.0 + 0.3 + 0.4 = 1.7 N*m; a 1.3 answer likely dropped the damping - check edot")

    def test_the_damping_acts_on_velocity_only(self):
        stiffness_only = submission.spring_damper_torque(0.5, 0.5, 2.0, 0.0, 10.0, 3.0)
        self.assertAlmostEqual(
            stiffness_only, 6.0, delta=1e-12,
            msg="expected zero position error to leave only kp*qd_des = 6.0; a 0.0 result likely used the position error - check the terms")

    def test_at_rest_with_gravity_feedforward_nothing_moves(self):
        self.assertAlmostEqual(
            submission.spring_damper_torque(0.4, 0.4, 0.0, 0.0, 8.0, 0.5, -1.2), -1.2, delta=1e-12,
            msg="expected the feedforward alone at zero error, -1.2 N*m; a 0.0 result likely clipped the negative torque - check the clamp")

    def test_a_negative_gain_is_refused(self):
        with self.assertRaises(ValueError):
            submission.spring_damper_torque(0.0, 0.0, 0.0, 0.0, -1.0, 1.0)


class ComplianceTests(unittest.TestCase):
    def test_the_worked_deflection(self):
        self.assertAlmostEqual(
            submission.compliance_deflection(0.50, 5.0), 0.10, delta=1e-12,
            msg="expected tau/kp = 0.50/5.0 = 0.10 rad; a 2.5 rad answer likely multiplied by stiffness - check the division")

    def test_a_stiffer_spring_yields_less(self):
        soft = submission.compliance_deflection(0.8, 4.0)
        stiff = submission.compliance_deflection(0.8, 20.0)
        self.assertAlmostEqual(
            soft, 0.20, delta=1e-12,
            msg="expected 0.8/4.0 = 0.20 rad on the soft joint; a 3.2 rad answer likely multiplied - check the divisor")
        self.assertLess(
            stiff, soft,
            msg="expected the stiffer joint to deflect less; a larger stiff value likely inverted the ratio - check which stiffness divides")

    def test_zero_stiffness_is_refused(self):
        with self.assertRaises(ValueError):
            submission.compliance_deflection(0.1, 0.0)


if __name__ == "__main__":
    unittest.main()
