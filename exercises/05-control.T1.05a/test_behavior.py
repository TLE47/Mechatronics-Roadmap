"""Behaviour tests for 05-control.T1.05a.

Each test names the mistake it catches:
  * the error built the wrong way round, so positive feedback drives the joint away from the
    target - the module's first Common-mistakes row;
  * a derivative term added to the demand instead of subtracted from it, so the "damper" pushes
    harder the faster the joint moves;
  * an integral tick that forgets the control period, which grows the bias a thousandfold at the
    1 kHz loop;
  * clamping anti-windup that never freezes, so the accumulator balloons past the rail - the whole
    point of the module;
  * a saturation that clips the positive rail only;
  * a gravity sag that multiplies the gain instead of dividing by it;
  * a closed-loop simulation that never saturates, which cannot show windup at all.
"""

import math  # noqa: F401  (kept so the test file reads like the module's own snippets)
import unittest

import harness

submission = harness.load_submission()


class TrackingErrorTests(unittest.TestCase):
    def test_the_gate_test_error(self):
        # 1.57 - 1.27 = 0.30 rad.
        self.assertAlmostEqual(submission.tracking_error(1.57, 1.27), 0.30, delta=1e-9)

    def test_overshooting_gives_a_negative_error(self):
        self.assertAlmostEqual(submission.tracking_error(0.5, 0.8), -0.3, delta=1e-12)

    def test_being_on_target_is_zero(self):
        self.assertEqual(submission.tracking_error(1.0, 1.0), 0.0)


class ControlEffortTests(unittest.TestCase):
    def test_the_worked_demand(self):
        # 10*0.4 - 2*0.5 + 0.8 = 3.8 N*m.
        self.assertAlmostEqual(
            submission.control_effort(1.0, 0.6, 0.5, 0.8, 10.0, 2.0), 3.8, delta=1e-12)

    def test_the_skip_test_pd_demand(self):
        # 10*(2.0-1.5) - 2.5*0.4 = 4.0 N*m with no integral term.
        self.assertAlmostEqual(
            submission.control_effort(2.0, 1.5, 0.4, 0.0, 10.0, 2.5), 4.0, delta=1e-12)

    def test_the_spring_alone_is_kp_times_error(self):
        self.assertAlmostEqual(
            submission.control_effort(2.0, 1.5, 0.0, 0.0, 10.0, 0.0), 5.0, delta=1e-12)

    def test_the_damper_opposes_velocity_either_way(self):
        # Moving towards the target is not a reason to push harder: +dy must reduce the demand.
        moving_forward = submission.control_effort(0.0, 0.0, 0.5, 0.0, 10.0, 2.0)
        moving_back = submission.control_effort(0.0, 0.0, -0.5, 0.0, 10.0, 2.0)
        self.assertAlmostEqual(moving_forward, -1.0, delta=1e-12)
        self.assertAlmostEqual(moving_back, 1.0, delta=1e-12)

    def test_the_integral_bias_is_added(self):
        with_bias = submission.control_effort(1.0, 0.6, 0.0, 0.8, 10.0, 2.0)
        without = submission.control_effort(1.0, 0.6, 0.0, 0.0, 10.0, 2.0)
        self.assertAlmostEqual(with_bias - without, 0.8, delta=1e-12)

    def test_negative_gains_are_refused(self):
        with self.assertRaises(ValueError):
            submission.control_effort(1.0, 0.0, 0.0, 0.0, -5.0, 1.0)
        with self.assertRaises(ValueError):
            submission.control_effort(1.0, 0.0, 0.0, 0.0, 5.0, -1.0)


class IntegralTests(unittest.TestCase):
    def test_the_gate_integral_update(self):
        # 20.0 * 0.25 * 0.001 = 0.005 N*m.
        self.assertAlmostEqual(submission.integral_step(0.0, 20.0, 0.25, 0.001), 0.005,
                               delta=1e-12)

    def test_ten_ticks_accumulate_ten_times(self):
        integral = 0.0
        for _tick in range(10):
            integral = submission.integral_step(integral, 12.0, 0.4, 0.001)
        self.assertAlmostEqual(integral, 0.048, delta=1e-12)

    def test_no_error_leaves_the_bias_alone(self):
        self.assertAlmostEqual(submission.integral_step(0.8, 12.0, 0.0, 0.001), 0.8, delta=1e-15)

    def test_a_zero_period_is_refused(self):
        with self.assertRaises(ValueError):
            submission.integral_step(0.0, 12.0, 0.4, 0.0)


class AntiWindupTests(unittest.TestCase):
    def test_the_gate_freeze(self):
        # +15 V of demand past a 12 V rail, with the error still pushing that way: freeze at 0.8.
        self.assertAlmostEqual(
            submission.anti_windup_integral(0.8, 12.0, 0.4, 0.001, 15.0, 12.0), 0.8, delta=1e-15)

    def test_an_error_against_the_demand_does_not_freeze(self):
        # e*u_raw < 0: the loop is already unwinding, so the tick is allowed to land.
        self.assertAlmostEqual(
            submission.anti_windup_integral(0.8, 12.0, -0.4, 0.001, 15.0, 12.0),
            0.8 - 0.0048, delta=1e-15)

    def test_inside_the_rails_the_integral_lands(self):
        self.assertAlmostEqual(
            submission.anti_windup_integral(0.8, 12.0, 0.4, 0.001, 10.0, 12.0),
            0.8048, delta=1e-15)

    def test_a_magnitude_cap_holds_the_accumulator(self):
        # 3.9 + 0.0048 wants 3.9048, but the cap is 2.5.
        self.assertAlmostEqual(
            submission.anti_windup_integral(3.9, 12.0, 0.4, 0.001, 0.0, 12.0, i_max=2.5),
            2.5, delta=1e-15)

    def test_a_zero_rail_is_refused(self):
        with self.assertRaises(ValueError):
            submission.anti_windup_integral(0.0, 12.0, 0.4, 0.001, 0.0, 0.0)


class SaturationTests(unittest.TestCase):
    def test_the_skip_test_clamped_output(self):
        # P = 9.5 V, I clamped from 6.0 to 4.0 V, so 13.5 V of demand lands on the 12 V rail.
        self.assertAlmostEqual(submission.saturate(9.5 + 4.0, 12.0), 12.0, delta=1e-12)

    def test_the_gate_test_saturated_output(self):
        self.assertAlmostEqual(submission.saturate(18.5, 12.0), 12.0, delta=1e-12)

    def test_the_negative_rail_clips_too(self):
        # The one-sided-clip bug: -18.5 V must become -12.0 V, not pass through.
        self.assertAlmostEqual(submission.saturate(-18.5, 12.0), -12.0, delta=1e-12)

    def test_a_demand_inside_the_rails_is_untouched(self):
        self.assertAlmostEqual(submission.saturate(5.0, 12.0), 5.0, delta=1e-15)

    def test_a_negative_rail_is_refused(self):
        with self.assertRaises(ValueError):
            submission.saturate(1.0, -12.0)


class SagTests(unittest.TestCase):
    def test_the_exercise_sag_and_angle(self):
        # tau_g / Kp = 0.60 / 8.0 = 0.075 rad, so the arm rests at 0.925 rad.
        sag = submission.steady_state_sag(0.60, 8.0)
        self.assertAlmostEqual(sag, 0.075, delta=1e-3)
        self.assertAlmostEqual(1.0 - sag, 0.925, delta=1e-3)

    def test_the_worked_sag(self):
        # 0.60 / 4.0 = 0.15 rad: the module's printed PD final q = 0.850.
        self.assertAlmostEqual(submission.steady_state_sag(0.60, 4.0), 0.150, delta=1e-12)

    def test_the_skip_test_sag(self):
        self.assertAlmostEqual(submission.steady_state_sag(0.50, 5.0), 0.10, delta=1e-12)

    def test_a_thousandfold_gain_still_sags(self):
        # Even Kp = 1000 leaves 0.85 mrad - which is why the integral term exists at all.
        self.assertAlmostEqual(submission.steady_state_sag(0.85, 1000.0), 0.00085, delta=1e-12)

    def test_a_zero_gain_is_refused(self):
        with self.assertRaises(ValueError):
            submission.steady_state_sag(0.60, 0.0)


class AccelerationTests(unittest.TestCase):
    def test_the_worked_arm_accelerates(self):
        # (1.20 - 0.60) / 0.02 = 30 rad/s^2 with no speed yet.
        self.assertAlmostEqual(submission.arm_acceleration(1.20, 0.0, 0.60, 0.02, 0.05), 30.0,
                               delta=1e-12)

    def test_damping_is_subtracted_before_the_divide(self):
        # (1.20 - 0.05*2.0 - 0.60) / 0.02 = 25 rad/s^2.
        self.assertAlmostEqual(submission.arm_acceleration(1.20, 2.0, 0.60, 0.02, 0.05), 25.0,
                               delta=1e-12)

    def test_holding_the_load_still_costs_nothing(self):
        # The torque that exactly balances damping and gravity leaves zero acceleration.
        self.assertAlmostEqual(
            submission.arm_acceleration(0.60 + 0.05 * 3.0, 3.0, 0.60, 0.02, 0.05), 0.0,
            delta=1e-15)

    def test_bad_inertia_and_damping_are_refused(self):
        with self.assertRaises(ValueError):
            submission.arm_acceleration(1.0, 0.0, 0.6, 0.0, 0.05)
        with self.assertRaises(ValueError):
            submission.arm_acceleration(1.0, 0.0, 0.6, 0.02, -0.05)


def _simulate(kp, ki, kd, anti_windup, target=1.0, steps=3000, j=0.02, b=0.05, tau_g=0.60,
              u_max=1.20, dt=0.001):
    """The module's section-4 loop, assembled only from the submission's own functions."""
    q = dq = i_term = 0.0
    peak = 0.0
    for _step in range(steps):
        e = submission.tracking_error(target, q)
        i_cand = submission.integral_step(i_term, ki, e, dt)
        if anti_windup:
            i_cand = submission.anti_windup_integral(
                i_term, ki, e, dt,
                submission.control_effort(target, q, dq, i_cand, kp, kd),
                u_max, i_max=u_max)
        u_raw = submission.control_effort(target, q, dq, i_cand, kp, kd)
        i_term = i_cand
        u = submission.saturate(u_raw, u_max)
        dq += submission.arm_acceleration(u, dq, tau_g, j, b) * dt
        q += dq * dt
        peak = max(peak, q)
    return q, peak - target


class ClosedLoopTests(unittest.TestCase):
    def test_constant_gravity_holds_the_worked_sag(self):
        q, _peak = _simulate(kp=4.0, ki=0.0, kd=0.4, anti_windup=False)
        self.assertAlmostEqual(q, 0.850, delta=1e-2)
        self.assertAlmostEqual(1.0 - q, 0.150, delta=1e-2)

    def test_the_exercise_spring_lands_at_0_925(self):
        q, _peak = _simulate(kp=8.0, ki=0.0, kd=0.4, anti_windup=False)
        self.assertAlmostEqual(q, 0.925, delta=1e-2)

    def test_anti_windup_removes_the_steady_state_sag(self):
        q, _peak = _simulate(kp=4.0, ki=12.0, kd=0.4, anti_windup=True)
        self.assertLess(abs(1.0 - q), 1e-3)

    def test_anti_windup_keeps_the_overshoot_small(self):
        _q, overshoot = _simulate(kp=4.0, ki=12.0, kd=0.4, anti_windup=True)
        self.assertGreaterEqual(overshoot, 0.0)
        self.assertLess(overshoot, 0.05)

    def test_the_unclamped_integral_overshoots_far_worse(self):
        # The rail is what the accumulator winds up against: unclamped it balloons, and the arm
        # overshoots by at least a further 0.10 rad once it comes back.
        _q, wound = _simulate(kp=4.0, ki=12.0, kd=0.4, anti_windup=False)
        _q2, clamped = _simulate(kp=4.0, ki=12.0, kd=0.4, anti_windup=True)
        self.assertGreater(wound, 0.30)
        self.assertGreater(wound, clamped + 0.10)


if __name__ == "__main__":
    unittest.main()
