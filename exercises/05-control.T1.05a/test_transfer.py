"""Transfer tests for 05-control.T1.05a - the same loop on the plant's own arm.

Four claims, measured on `mechalab_plant`:
  1. the plant's shoulder, held out horizontally, sags by its gravity torque over the gain, and
     that sag is a real fraction of a radian at any gain a hobby motor can afford;
  2. the plant's own joint inertia and damping turn the delivered torque into the acceleration
     the module integrates - the clamp is 312.5 rad/s^2 at the shoulder;
  3. the 2.5 N*m clamp freezes the integral, while the unclamped accumulator keeps growing;
  4. one encoder count at the plant's 1 kHz tick is 1.534 rad/s of apparent speed, and Kd = 0.4
     turns that single count of noise into a quarter of the whole torque budget.
"""

import math
import unittest

import harness

submission = harness.load_submission()
plant = harness.plant


def _close_the_loop(kp, kd, target, steps=3000, tau_g=None, u_max=None):
    """A PD loop on the plant's shoulder: no integral, so the sag is analytic."""
    tau_g = plant.gravity_torque(0.0, 0.0)[0] if tau_g is None else tau_g
    u_max = plant.TAU_LIMIT if u_max is None else u_max
    q = dq = 0.0
    for _step in range(steps):
        u = submission.saturate(submission.control_effort(target, q, dq, 0.0, kp, kd), u_max)
        dq += submission.arm_acceleration(u, dq, tau_g, plant.I1, plant.B1) * plant.DT
        q += dq * plant.DT
    return q, dq


class SagOnThePlantTests(unittest.TestCase):
    def test_the_horizontal_shoulder_sags_by_its_load_over_the_gain(self):
        # The plant's own gravity torque at q1 = q2 = 0 is 0.318825 N*m; at Kp = 10 that is
        # 0.0318825 rad of droop - the arm is never where the reference says.
        tau_g = plant.gravity_torque(0.0, 0.0)[0]
        self.assertAlmostEqual(
            submission.steady_state_sag(tau_g, 10.0), 0.0318825, delta=1e-12,
            msg="expected the plant's 0.318825 N*m horizontal load at Kp = 10 to sag 0.0318825 "
                "rad; 0.318825 means the gain was ignored - check tau / Kp",
        )

    def test_a_quarter_of_a_radian_at_the_clamp(self):
        # 2.5 N*m of load at Kp = 10 sags 0.25 rad - a pure P loop cannot hold this arm.
        self.assertAlmostEqual(
            submission.steady_state_sag(plant.TAU_LIMIT, 10.0), 0.25, delta=1e-15,
            msg="expected the full 2.5 N*m clamp at Kp = 10 to sag a quarter of a radian, the "
                "reason a pure P loop cannot hold this arm against its own weight; a smaller "
                "value means the clamp or the gain was scaled",
        )

    def test_the_loop_lands_on_the_analytic_sag(self):
        target, kp = 0.20, 8.0
        q, dq = _close_the_loop(kp, 0.15, target)
        expected = target - plant.gravity_torque(0.0, 0.0)[0] / kp
        self.assertAlmostEqual(
            q, expected, delta=1e-6,
            msg="expected the simulated arm to settle exactly one sag below its reference, "
                "0.20 - 0.0398531 rad; a larger error means the loop has not converged or the "
                "damping fights the analytic result - check the step count and Kd",
        )
        self.assertLess(
            abs(dq), 1e-6,
            msg="expected the arm to be at rest once settled, so the velocity is under a "
                "microradian per second; a moving joint means the loop is oscillating instead of "
                "holding - check the damping term",
        )

    def test_the_same_step_at_a_hundredfold_gain_saturates(self):
        demand = submission.control_effort(0.20, 0.0, 0.0, 0.0, 100.0, 0.0)
        self.assertAlmostEqual(
            demand, 20.0, delta=1e-12,
            msg="expected a 0.20 rad error at Kp = 100 to demand 20 N*m, far beyond the plant; a "
                "value near 2.0 means the gain was read as ten - check the argument order",
        )
        self.assertAlmostEqual(
            submission.saturate(demand, plant.TAU_LIMIT), plant.TAU_LIMIT, delta=1e-15,
            msg="expected the 20 N*m demand to be clamped at the plant's 2.5 N*m rail; a value "
                "above the rail means the saturation never applied and the integral would wind up",
        )


class PlantAccelerationTests(unittest.TestCase):
    def test_the_shoulder_clamp_over_the_shoulder_inertia(self):
        # 2.5 N*m / 0.008 kg*m^2 = 312.5 rad/s^2.
        self.assertAlmostEqual(
            submission.arm_acceleration(plant.TAU_LIMIT, 0.0, 0.0, plant.I1, plant.B1), 312.5,
            delta=1e-12,
            msg="expected the plant's full clamp with no speed and no load to accelerate the "
                "shoulder at 312.5 rad/s^2; 0.3 means the inertia was divided by the torque - "
                "check (u - b dq - tau_g) / J",
        )

    def test_the_plants_own_damping_at_the_plants_own_speed(self):
        # (0 - B1*100) / I1, with B1/I1 = 5 per second on this plant.
        expected = -plant.B1 * 100.0 / plant.I1
        self.assertAlmostEqual(
            submission.arm_acceleration(0.0, 100.0, 0.0, plant.I1, plant.B1), expected,
            delta=1e-12,
            msg="expected a coasting 100 rad/s joint to decelerate at -5 x 100 = -500 rad/s^2, "
                "the plant's own damping over its inertia; a positive value means the damping "
                "term was added - check the sign",
        )

    def test_gravity_and_damping_together_hold_the_joint_still(self):
        speed = 0.5
        holding = plant.gravity_torque(0.0, 0.0)[0] + plant.B1 * speed
        self.assertAlmostEqual(
            submission.arm_acceleration(holding, speed, plant.gravity_torque(0.0, 0.0)[0],
                                        plant.I1, plant.B1),
            0.0, delta=1e-12,
            msg="expected the one torque that exactly cancels gravity and damping to give zero "
                "acceleration, the equilibrium a steady hold sits at; a nonzero value means one "
                "of the three terms has the wrong sign - check the balance",
        )


class WindupOnThePlantTests(unittest.TestCase):
    def test_the_plants_clamp_freezes_the_integral(self):
        # The demand is 10 N*m against a 2.5 N*m clamp, with the error still pushing: freeze.
        frozen = submission.anti_windup_integral(2.5, 12.0, 0.4, plant.DT, 10.0, plant.TAU_LIMIT,
                                                 i_max=plant.TAU_LIMIT)
        self.assertAlmostEqual(
            frozen, 2.5, delta=1e-15,
            msg="expected the integrator to hold at 2.5 while the demand is clamped and the error "
                "pushes the same way; a larger value means the accumulator kept growing, which is "
                "the windup the module's second Common-mistakes row describes",
        )

    def test_the_unclamped_tick_keeps_growing(self):
        # 12 * 0.4 * 0.001 = 0.0048 per tick, on top of the clamp: 2.5048.
        self.assertAlmostEqual(
            submission.integral_step(2.5, 12.0, 0.4, plant.DT), 2.5048, delta=1e-15,
            msg="expected a bare integral step to add 12 x 0.4 x 0.001 = 0.0048, reaching 2.5048; "
                "2.5 means the increment was discarded, so the two branches would be "
                "indistinguishable",
        )


class EncoderNoiseTests(unittest.TestCase):
    def test_one_count_is_a_radian_and_a_half_per_second(self):
        # (2*pi/4096) / 0.001 s = 1.5339808 rad/s of apparent velocity from a single count.
        apparent = (2.0 * math.pi / plant.ENCODER_CPR) / plant.DT
        self.assertAlmostEqual(
            apparent, 1.5339807878856412, delta=1e-12,
            msg="expected one encoder count divided by the 1 ms tick to read 1.53398 rad/s of "
                "apparent speed; a value near 0.0015 means the count was not divided by the tick "
                "- check the units",
        )

    def test_kd_turns_one_count_into_a_quarter_of_the_budget(self):
        # 0.4 * 1.5339808 = 0.6135923 N*m, which is 24.5% of the 2.5 N*m rail - the buzz the
        # module's third Common-mistakes row describes.
        chatter = 0.4 * (2.0 * math.pi / plant.ENCODER_CPR) / plant.DT
        self.assertAlmostEqual(
            chatter, 0.6135923151542565, delta=1e-12,
            msg="expected Kd = 0.4 on a one-count velocity step to command 0.61359 N*m of "
                "torque; a value near 0.0015 means the derivative was applied to the position "
                "rather than the velocity - check what is differenced",
        )
        self.assertAlmostEqual(
            chatter / plant.TAU_LIMIT, 0.2454369260617026, delta=1e-12,
            msg="expected that one count of quantisation to spend 24.5 percent of the plant's "
                "2.5 N*m budget on its own, the buzz this row warns about; a much smaller "
                "fraction means the count was damped before it reached the gain",
        )


if __name__ == "__main__":
    unittest.main()
