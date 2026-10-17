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
        self.assertAlmostEqual(submission.steady_state_sag(tau_g, 10.0), 0.0318825, delta=1e-12)

    def test_a_quarter_of_a_radian_at_the_clamp(self):
        # 2.5 N*m of load at Kp = 10 sags 0.25 rad - a pure P loop cannot hold this arm.
        self.assertAlmostEqual(submission.steady_state_sag(plant.TAU_LIMIT, 10.0), 0.25,
                               delta=1e-15)

    def test_the_loop_lands_on_the_analytic_sag(self):
        target, kp = 0.20, 8.0
        q, dq = _close_the_loop(kp, 0.15, target)
        expected = target - plant.gravity_torque(0.0, 0.0)[0] / kp
        self.assertAlmostEqual(q, expected, delta=1e-6)
        self.assertLess(abs(dq), 1e-6)

    def test_the_same_step_at_a_hundredfold_gain_saturates(self):
        demand = submission.control_effort(0.20, 0.0, 0.0, 0.0, 100.0, 0.0)
        self.assertAlmostEqual(demand, 20.0, delta=1e-12)
        self.assertAlmostEqual(submission.saturate(demand, plant.TAU_LIMIT), plant.TAU_LIMIT,
                               delta=1e-15)


class PlantAccelerationTests(unittest.TestCase):
    def test_the_shoulder_clamp_over_the_shoulder_inertia(self):
        # 2.5 N*m / 0.008 kg*m^2 = 312.5 rad/s^2.
        self.assertAlmostEqual(
            submission.arm_acceleration(plant.TAU_LIMIT, 0.0, 0.0, plant.I1, plant.B1), 312.5,
            delta=1e-12)

    def test_the_plants_own_damping_at_the_plants_own_speed(self):
        # (0 - B1*100) / I1, with B1/I1 = 5 per second on this plant.
        expected = -plant.B1 * 100.0 / plant.I1
        self.assertAlmostEqual(
            submission.arm_acceleration(0.0, 100.0, 0.0, plant.I1, plant.B1), expected,
            delta=1e-12)

    def test_gravity_and_damping_together_hold_the_joint_still(self):
        speed = 0.5
        holding = plant.gravity_torque(0.0, 0.0)[0] + plant.B1 * speed
        self.assertAlmostEqual(
            submission.arm_acceleration(holding, speed, plant.gravity_torque(0.0, 0.0)[0],
                                        plant.I1, plant.B1),
            0.0, delta=1e-12)


class WindupOnThePlantTests(unittest.TestCase):
    def test_the_plants_clamp_freezes_the_integral(self):
        # The demand is 10 N*m against a 2.5 N*m clamp, with the error still pushing: freeze.
        frozen = submission.anti_windup_integral(2.5, 12.0, 0.4, plant.DT, 10.0, plant.TAU_LIMIT,
                                                 i_max=plant.TAU_LIMIT)
        self.assertAlmostEqual(frozen, 2.5, delta=1e-15)

    def test_the_unclamped_tick_keeps_growing(self):
        # 12 * 0.4 * 0.001 = 0.0048 per tick, on top of the clamp: 2.5048.
        self.assertAlmostEqual(submission.integral_step(2.5, 12.0, 0.4, plant.DT), 2.5048,
                               delta=1e-15)


class EncoderNoiseTests(unittest.TestCase):
    def test_one_count_is_a_radian_and_a_half_per_second(self):
        # (2*pi/4096) / 0.001 s = 1.5339808 rad/s of apparent velocity from a single count.
        apparent = (2.0 * math.pi / plant.ENCODER_CPR) / plant.DT
        self.assertAlmostEqual(apparent, 1.5339807878856412, delta=1e-12)

    def test_kd_turns_one_count_into_a_quarter_of_the_budget(self):
        # 0.4 * 1.5339808 = 0.6135923 N*m, which is 24.5% of the 2.5 N*m rail - the buzz the
        # module's third Common-mistakes row describes.
        chatter = 0.4 * (2.0 * math.pi / plant.ENCODER_CPR) / plant.DT
        self.assertAlmostEqual(chatter, 0.6135923151542565, delta=1e-12)
        self.assertAlmostEqual(chatter / plant.TAU_LIMIT, 0.2454369260617026, delta=1e-12)


if __name__ == "__main__":
    unittest.main()
