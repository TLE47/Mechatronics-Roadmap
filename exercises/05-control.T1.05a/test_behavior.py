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
  * clamping anti-windup that freezes on *every* saturation, so the accumulator cannot unwind
    while the error has already reversed - the case a freeze-only test cannot see;
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
        self.assertAlmostEqual(
            submission.tracking_error(1.57, 1.27), 0.30, delta=1e-9,
            msg="expected 1.57 - 1.27 = 0.30 rad of error; another value likely swapped the operands - check target comes first")

    def test_overshooting_gives_a_negative_error(self):
        self.assertAlmostEqual(
            submission.tracking_error(0.5, 0.8), -0.3, delta=1e-12,
            msg="expected 0.5 - 0.8 = -0.3 rad after an overshoot; a positive 0.3 likely subtracts position from target backwards")

    def test_being_on_target_is_zero(self):
        self.assertEqual(
            submission.tracking_error(1.0, 1.0), 0.0,
            "expected exactly 0.0 rad when the target equals the position; a non-zero value likely adds an offset - check the plain subtraction")


class ControlEffortTests(unittest.TestCase):
    def test_the_worked_demand(self):
        # 10*0.4 - 2*0.5 + 0.8 = 3.8 N*m.
        self.assertAlmostEqual(
            submission.control_effort(1.0, 0.6, 0.5, 0.8, 10.0, 2.0), 3.8, delta=1e-12,
            msg="expected 10*0.4 - 2*0.5 + 0.8 = 3.8 N*m; a larger demand likely added the damper instead of subtracting it - check the -Kd*dq sign")

    def test_the_skip_test_pd_demand(self):
        # 10*(2.0-1.5) - 2.5*0.4 = 4.0 N*m with no integral term.
        self.assertAlmostEqual(
            submission.control_effort(2.0, 1.5, 0.4, 0.0, 10.0, 2.5), 4.0, delta=1e-12,
            msg="expected 10*0.5 - 2.5*0.4 = 4.0 N*m with no integral term; 5.0 likely dropped the damping - check Kd acts on the measured speed")

    def test_the_spring_alone_is_kp_times_error(self):
        self.assertAlmostEqual(
            submission.control_effort(2.0, 1.5, 0.0, 0.0, 10.0, 0.0), 5.0, delta=1e-12,
            msg="expected Kp*error = 10*0.5 = 5.0 N*m when Kd and the bias are zero; a smaller value likely divided by Kp - check the gain multiplies the error")

    def test_the_damper_opposes_velocity_either_way(self):
        # Moving towards the target is not a reason to push harder: +dy must reduce the demand.
        moving_forward = submission.control_effort(0.0, 0.0, 0.5, 0.0, 10.0, 2.0)
        moving_back = submission.control_effort(0.0, 0.0, -0.5, 0.0, 10.0, 2.0)
        self.assertAlmostEqual(
            moving_forward, -1.0, delta=1e-12,
            msg="expected -1.0 N*m for +0.5 rad/s toward the target; a positive demand likely added the damper - check the sign in front of Kd*dq")
        self.assertAlmostEqual(
            moving_back, 1.0, delta=1e-12,
            msg="expected +1.0 N*m for -0.5 rad/s; a negative demand likely ignores the speed's sign - check dq enters the sum with its own sign")

    def test_the_integral_bias_is_added(self):
        with_bias = submission.control_effort(1.0, 0.6, 0.0, 0.8, 10.0, 2.0)
        without = submission.control_effort(1.0, 0.6, 0.0, 0.0, 10.0, 2.0)
        self.assertAlmostEqual(
            with_bias - without, 0.8, delta=1e-12,
            msg="expected the integral term to add exactly 0.8 N*m; another difference likely scales the bias by a gain - check Ki is applied once, in integral_step")

    def test_negative_gains_are_refused(self):
        with self.assertRaises(ValueError):
            submission.control_effort(1.0, 0.0, 0.0, 0.0, -5.0, 1.0)
        with self.assertRaises(ValueError):
            submission.control_effort(1.0, 0.0, 0.0, 0.0, 5.0, -1.0)


class IntegralTests(unittest.TestCase):
    def test_the_gate_integral_update(self):
        # 20.0 * 0.25 * 0.001 = 0.005 N*m.
        self.assertAlmostEqual(submission.integral_step(0.0, 20.0, 0.25, 0.001), 0.005,
                               delta=1e-12,
                               msg="expected 20.0*0.25*0.001 = 0.005 N*m for one tick; 5.0 likely dropped the 1 kHz period - check dt multiplies the error")

    def test_ten_ticks_accumulate_ten_times(self):
        integral = 0.0
        for _tick in range(10):
            integral = submission.integral_step(integral, 12.0, 0.4, 0.001)
        self.assertAlmostEqual(
            integral, 0.048, delta=1e-12,
            msg="expected ten 0.0048 N*m ticks to sum to 0.048; a value near 0.0048 likely overwrote the accumulator - check each tick adds to the previous")

    def test_no_error_leaves_the_bias_alone(self):
        self.assertAlmostEqual(
            submission.integral_step(0.8, 12.0, 0.0, 0.001), 0.8, delta=1e-15,
            msg="expected the bias to hold at 0.8 N*m when the error is 0.0; any change likely still adds a term - check the zero-error path returns its input")

    def test_a_zero_period_is_refused(self):
        with self.assertRaises(ValueError):
            submission.integral_step(0.0, 12.0, 0.4, 0.0)


class AntiWindupTests(unittest.TestCase):
    def test_the_gate_freeze(self):
        # +15 V of demand past a 12 V rail, with the error still pushing that way: freeze at 0.8.
        self.assertAlmostEqual(
            submission.anti_windup_integral(0.8, 12.0, 0.4, 0.001, 15.0, 12.0), 0.8, delta=1e-15,
            msg="expected the integral to freeze at 0.8 while 15 V of demand sits past the 12 V rail; growth likely means the freeze never fired - check e and u_raw share a sign")

    def test_an_error_against_the_demand_does_not_freeze(self):
        # e*u_raw < 0: the loop is already unwinding, so the tick is allowed to land.
        self.assertAlmostEqual(
            submission.anti_windup_integral(0.8, 12.0, -0.4, 0.001, 15.0, 12.0),
            0.8 - 0.0048, delta=1e-15,
            msg="expected the tick to land (0.8 - 0.0048) because the error opposes the demand; no change likely froze a loop that is already unwinding - check the sign condition")

    def test_the_negative_rail_freezes_with_the_error_pushing_down(self):
        # u_raw = -15 against the -12 rail with e = -0.4: same sign, so the accumulator holds.
        self.assertAlmostEqual(
            submission.anti_windup_integral(0.8, 12.0, -0.4, 0.001, -15.0, 12.0), 0.8,
            delta=1e-15,
            msg="expected the integral to hold at 0.8 with 15 N*m of demand past the negative "
                "rail and the error still pushing that way; growth means the freeze only looks "
                "at the positive rail - check |u_raw|, not u_raw > u_max")

    def test_the_negative_rail_lets_a_reversing_error_unwind(self):
        # e = +0.4 against a -15 demand: the loop is unwinding, so the tick lands.
        self.assertAlmostEqual(
            submission.anti_windup_integral(0.8, 12.0, 0.4, 0.001, -15.0, 12.0),
            0.8048, delta=1e-15,
            msg="expected 0.8 + 0.0048 = 0.8048 because the error opposes the negative demand; "
                "0.8 means the freeze ignored the error direction, which holds the accumulator "
                "hostage on the way back out of saturation")

    def test_exactly_on_the_rail_is_not_past_it(self):
        # u_raw == u_max is at the limit, not beyond it: the tick must land on both rails.
        self.assertAlmostEqual(
            submission.anti_windup_integral(0.8, 12.0, 0.4, 0.001, 12.0, 12.0),
            0.8048, delta=1e-15,
            msg="expected the tick to land at u_raw = u_max exactly (0.8048); freezing there "
                "likely tests u_raw >= u_max - check the strict comparison")
        self.assertAlmostEqual(
            submission.anti_windup_integral(0.8, 12.0, -0.4, 0.001, -12.0, 12.0),
            0.7952, delta=1e-15,
            msg="expected the tick to land at u_raw = -u_max exactly (0.7952); 0.8 means the "
                "boundary was treated as saturated on the negative rail too")

    def test_inside_the_rails_the_integral_lands(self):
        self.assertAlmostEqual(
            submission.anti_windup_integral(0.8, 12.0, 0.4, 0.001, 10.0, 12.0),
            0.8048, delta=1e-15,
            msg="expected 0.8 + 0.0048 = 0.8048 while the demand is inside the rail; freezing here likely tests u_raw >= u_max instead of > - check the comparison")

    def test_a_freeze_without_the_error_direction_loses_the_unwind(self):
        # The wrong rule - freeze on any saturation - gives 0.8 here instead of 0.7952. This is
        # the case the gate test alone cannot see, so it is checked in both directions.
        top = submission.anti_windup_integral(0.8, 12.0, -0.4, 0.001, 15.0, 12.0)
        bottom = submission.anti_windup_integral(0.8, 12.0, 0.4, 0.001, -15.0, 12.0)
        self.assertAlmostEqual(
            top, 0.7952, delta=1e-15,
            msg="expected 0.7952 - the tick landing while a reversed error unwinds a positive "
                "saturation; 0.8 means the integral froze for any saturation, with no "
                "e * u_raw > 0 test")
        self.assertAlmostEqual(
            bottom, 0.8048, delta=1e-15,
            msg="expected 0.8048 - the tick landing while a reversed error unwinds a negative "
                "saturation; 0.8 means the same missing error-direction test on the other rail")

    def test_a_magnitude_cap_holds_the_accumulator(self):
        # 3.9 + 0.0048 wants 3.9048, but the cap is 2.5.
        self.assertAlmostEqual(
            submission.anti_windup_integral(3.9, 12.0, 0.4, 0.001, 0.0, 12.0, i_max=2.5),
            2.5, delta=1e-15,
            msg="expected the accumulator to stop at i_max = 2.5 N*m; 3.9048 likely means the magnitude cap was skipped - check the clamp runs after the tick")

    def test_a_zero_rail_is_refused(self):
        with self.assertRaises(ValueError):
            submission.anti_windup_integral(0.0, 12.0, 0.4, 0.001, 0.0, 0.0)


class SaturationTests(unittest.TestCase):
    def test_the_skip_test_clamped_output(self):
        # P = 9.5 V, I clamped from 6.0 to 4.0 V, so 13.5 V of demand lands on the 12 V rail.
        self.assertAlmostEqual(
            submission.saturate(9.5 + 4.0, 12.0), 12.0, delta=1e-12,
            msg="expected 13.5 V of demand to land on the 12 V rail; 13.5 V returned likely skipped the clamp - check saturate wraps the summed demand")

    def test_the_gate_test_saturated_output(self):
        self.assertAlmostEqual(
            submission.saturate(18.5, 12.0), 12.0, delta=1e-12,
            msg="expected 18.5 V to clip to 12.0; an unclipped 18.5 likely compares against the wrong limit - check u_max is the positive rail")

    def test_the_negative_rail_clips_too(self):
        # The one-sided-clip bug: -18.5 V must become -12.0 V, not pass through.
        self.assertAlmostEqual(
            submission.saturate(-18.5, 12.0), -12.0, delta=1e-12,
            msg="expected -18.5 V to clip to -12.0, not pass through; an unchanged -18.5 likely clips the positive rail only - check both bounds")

    def test_a_demand_inside_the_rails_is_untouched(self):
        self.assertAlmostEqual(
            submission.saturate(5.0, 12.0), 5.0, delta=1e-15,
            msg="expected 5.0 V to pass through untouched; any change likely subtracts a bias - check the clamp returns its input inside the rails")

    def test_a_negative_rail_is_refused(self):
        with self.assertRaises(ValueError):
            submission.saturate(1.0, -12.0)


class SagTests(unittest.TestCase):
    def test_the_exercise_sag_and_angle(self):
        # tau_g / Kp = 0.60 / 8.0 = 0.075 rad, so the arm rests at 0.925 rad.
        sag = submission.steady_state_sag(0.60, 8.0)
        self.assertAlmostEqual(
            sag, 0.075, delta=1e-3,
            msg="expected 0.60/8.0 = 0.075 rad of sag; a value near 4.8 likely multiplied by Kp - check the torque is divided by the gain")
        self.assertAlmostEqual(
            1.0 - sag, 0.925, delta=1e-3,
            msg="expected the arm to rest at 1.0 - 0.075 = 0.925 rad; another angle likely added the sag - check the subtraction")

    def test_the_worked_sag(self):
        # 0.60 / 4.0 = 0.15 rad: the module's printed PD final q = 0.850.
        self.assertAlmostEqual(
            submission.steady_state_sag(0.60, 4.0), 0.150, delta=1e-12,
            msg="expected 0.60/4.0 = 0.150 rad, matching the module's q = 0.850; 2.4 rad likely multiplied - check the gain is the divisor")

    def test_the_skip_test_sag(self):
        self.assertAlmostEqual(
            submission.steady_state_sag(0.50, 5.0), 0.10, delta=1e-12,
            msg="expected 0.50/5.0 = 0.10 rad; another value likely multiplied by the gain - check Kp sits under the gravity torque")

    def test_a_thousandfold_gain_still_sags(self):
        # Even Kp = 1000 leaves 0.85 mrad - which is why the integral term exists at all.
        self.assertAlmostEqual(
            submission.steady_state_sag(0.85, 1000.0), 0.00085, delta=1e-12,
            msg="expected 0.85/1000 = 0.00085 rad even at Kp = 1000; a larger sag likely divided by the torque - check the ratio's direction")

    def test_a_zero_gain_is_refused(self):
        with self.assertRaises(ValueError):
            submission.steady_state_sag(0.60, 0.0)


class AccelerationTests(unittest.TestCase):
    def test_the_worked_arm_accelerates(self):
        # (1.20 - 0.60) / 0.02 = 30 rad/s^2 with no speed yet.
        self.assertAlmostEqual(submission.arm_acceleration(1.20, 0.0, 0.60, 0.02, 0.05), 30.0,
                               delta=1e-12,
                               msg="expected (1.20 - 0.60)/0.02 = 30 rad/s^2 at rest; 60 likely divided by half the inertia - check J divides exactly once")

    def test_damping_is_subtracted_before_the_divide(self):
        # (1.20 - 0.05*2.0 - 0.60) / 0.02 = 25 rad/s^2.
        self.assertAlmostEqual(submission.arm_acceleration(1.20, 2.0, 0.60, 0.02, 0.05), 25.0,
                               delta=1e-12,
                               msg="expected (1.20 - 0.10 - 0.60)/0.02 = 25 rad/s^2; 30 likely skipped the damping term - check b*dq is subtracted first")

    def test_holding_the_load_still_costs_nothing(self):
        # The torque that exactly balances damping and gravity leaves zero acceleration.
        self.assertAlmostEqual(
            submission.arm_acceleration(0.60 + 0.05 * 3.0, 3.0, 0.60, 0.02, 0.05), 0.0,
            delta=1e-15,
            msg="expected exactly 0.0 rad/s^2 when the torque balances damping and gravity; non-zero likely adds tau_g - check both signs")

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
        self.assertAlmostEqual(
            q, 0.850, delta=1e-2,
            msg="expected the unclamped Kp = 4 loop to rest at q = 0.850; another value likely changed the sag scaling - check steady_state_sag matches the simulation")
        self.assertAlmostEqual(
            1.0 - q, 0.150, delta=1e-2,
            msg="expected 0.150 rad of residual error under constant gravity; a smaller error likely means an integral term crept in - check ki=0.0")

    def test_the_exercise_spring_lands_at_0_925(self):
        q, _peak = _simulate(kp=8.0, ki=0.0, kd=0.4, anti_windup=False)
        self.assertAlmostEqual(
            q, 0.925, delta=1e-2,
            msg="expected the Kp = 8 loop to land at 0.925 rad; 0.850 likely reused the Kp = 4 sag - check the gain passed into the loop")

    def test_anti_windup_removes_the_steady_state_sag(self):
        q, _peak = _simulate(kp=4.0, ki=12.0, kd=0.4, anti_windup=True)
        self.assertLess(
            abs(1.0 - q), 1e-3,
            "expected the clamped loop to settle within 1 mrad of 1.0 rad; a larger error likely froze the integral too early - check the freeze condition")

    def test_anti_windup_keeps_the_overshoot_small(self):
        _q, overshoot = _simulate(kp=4.0, ki=12.0, kd=0.4, anti_windup=True)
        self.assertGreaterEqual(
            overshoot, 0.0,
            "expected a non-negative overshoot from the clamped loop; a negative value likely reports the final error instead of the peak")
        self.assertLess(
            overshoot, 0.05,
            "expected under 0.05 rad of overshoot with anti-windup; a larger peak likely means the accumulator kept growing at the rail")

    def test_the_unclamped_integral_overshoots_far_worse(self):
        # The rail is what the accumulator winds up against: unclamped it balloons, and the arm
        # overshoots by at least a further 0.10 rad once it comes back.
        _q, wound = _simulate(kp=4.0, ki=12.0, kd=0.4, anti_windup=False)
        _q2, clamped = _simulate(kp=4.0, ki=12.0, kd=0.4, anti_windup=True)
        self.assertGreater(
            wound, 0.30,
            "expected the unclamped loop to overshoot past 0.30 rad; less likely means something clamped the accumulator anyway - check anti_windup=False")
        self.assertGreater(
            wound, clamped + 0.10,
            "expected at least 0.10 rad more overshoot unclamped than clamped; a smaller gap likely means both paths clamp - check the flag reaches the loop")


if __name__ == "__main__":
    unittest.main()
