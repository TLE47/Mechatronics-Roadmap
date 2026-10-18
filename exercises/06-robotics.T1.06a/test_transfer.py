"""Transfer tests for 06-robotics.T1.06a - the trajectory and the spring on the real arm.

Three claims, measured on the shared plant:
  1. the spring-damper plus gravity feedforward reproduces the plant's own shipped PD+gravity law
     at the same gains and states, term for term;
  2. a cubic from the plant's current figure-8 pose ends exactly on the target with zero speed, and
     its peak speed is 1.5 dq/T rather than the average a step setpoint implies;
  3. the compliance yield is the plant's own static equilibrium: with the plant's shoulder
     stiffness, a hand torque of 0.5 N*m moves the joint by tau/kp and no more.
"""

import math
import unittest

import harness

submission = harness.load_submission()
plant = harness.plant


class SpringMatchesThePlantTests(unittest.TestCase):
    def test_the_shipped_law_is_the_sum_of_the_three_terms(self):
        for q1, q2, dq1, dq2 in ((0.0, 0.0, 0.0, 0.0), (0.4, -0.7, 0.2, -0.3), (-1.1, 0.9, -0.5, 0.4)):
            q_des, dq_des = (0.5, 0.3), (0.1, 0.0)
            tau_plant = plant.pd_gravity_torque((q1, q2), (dq1, dq2), q_des, dq_des, limit=1e9)
            tau_g = plant.gravity_torque(q1, q2)
            mine = (
                submission.spring_damper_torque(q_des[0], q1, dq_des[0], dq1,
                                                plant.KP1, plant.KD1, tau_g[0]),
                submission.spring_damper_torque(q_des[1], q2, dq_des[1], dq2,
                                                plant.KP2, plant.KD2, tau_g[1]),
            )
            self.assertAlmostEqual(
                mine[0], tau_plant[0], delta=1e-12,
                msg="expected shoulder torque to match the plant law term for term; a mismatch likely swapped kp and kd - check the order")
            self.assertAlmostEqual(
                mine[1], tau_plant[1], delta=1e-12,
                msg="expected elbow torque to match the plant law; a difference on joint 2 likely fed joint 1's gravity term - check the index")

    def test_without_gravity_feedforward_the_shoulder_sags(self):
        q1, q2 = 0.0, 0.0
        tau_g = plant.gravity_torque(q1, q2)
        with_feedforward = submission.spring_damper_torque(0.0, q1, 0.0, 0.0,
                                                           plant.KP1, plant.KD1, tau_g[0])
        without = submission.spring_damper_torque(0.0, q1, 0.0, 0.0, plant.KP1, plant.KD1, 0.0)
        self.assertAlmostEqual(
            with_feedforward, tau_g[0], delta=1e-12,
            msg="expected the feedforward alone at zero error, the plant's gravity torque; a zero torque likely dropped the ff argument")
        self.assertAlmostEqual(
            without, 0.0, delta=1e-12,
            msg="expected no torque at zero error without feedforward; a non-zero value likely used the gravity term anyway")
        self.assertNotEqual(
            tau_g[0], 0.0,
            msg="expected the shoulder to need gravity torque at q = 0; a zero value likely evaluated at the wrong pose - check q1")
        self.assertAlmostEqual(
            with_feedforward - without, tau_g[0], delta=1e-12,
            msg="expected feedforward to add exactly the gravity term; a different gap likely double-counted it - check the subtraction")


class TrajectoryTests(unittest.TestCase):
    def test_a_move_from_the_plants_current_pose_lands_on_the_target(self):
        q1, q2 = plant.ik(*plant.figure8_target(0.0))
        q_target = plant.ik(*plant.figure8_target(0.25))
        T = 0.5
        samples = [submission.cubic_rest_to_rest(T * k / 100.0, q1, q_target[0], T)
                   for k in range(101)]
        self.assertAlmostEqual(
            samples[0][0], q1, delta=1e-12,
            msg="expected the first sample to sit on the plant's current pose; a different start likely used the target - check q0")
        self.assertAlmostEqual(
            samples[-1][0], q_target[0], delta=1e-12,
            msg="expected the last sample to land exactly on the figure-8 target; an offset likely evaluated at T-1 instead of T")
        self.assertAlmostEqual(
            samples[-1][1], 0.0, delta=1e-12,
            msg="expected zero arrival speed at the target; a non-zero value likely used a cubic with no end-velocity condition")
        peak = max(abs(s[1]) for s in samples)
        self.assertAlmostEqual(
            peak, 1.5 * (q_target[0] - q1) / T, delta=1e-9,
            msg="expected the peak speed to be 1.5 dq/T; a lower peak likely sampled too coarsely - check the 101 samples")

    def test_a_step_setpoint_demands_a_thousand_times_the_speed(self):
        # At 1 kHz, a 1 rad step is an implied 1000 rad/s; a 1 s cubic peaks at 1.5 rad/s.
        step_speed = 1.0 / plant.DT
        cubic_speed = submission.peak_velocity(1.0, 1.0)
        self.assertAlmostEqual(
            step_speed, 1000.0, delta=1e-9,
            msg="expected a 1 kHz step to imply 1000 rad/s; a 100 value likely used DT instead of 1/DT")
        self.assertLess(
            cubic_speed, step_speed / 100.0,
            msg="expected the cubic to stay far below the step's implied speed; a near-1000 result likely returned dq/T")

    def test_the_plant_budget_sets_the_duration(self):
        # A 90-degree move whose peak speed is 60 deg/s takes 1.5 * 90 / 60 = 2.25 s.
        T = submission.min_duration_s(math.pi / 2.0, math.radians(60.0))
        self.assertAlmostEqual(
            T, 2.25, delta=1e-9,
            msg="expected 1.5 * 90 / 60 = 2.25 s from the plant's speed budget; a 1.5 s answer likely used the average speed")


class ComplianceTests(unittest.TestCase):
    def test_the_yield_is_the_plants_static_equilibrium(self):
        for kp, tau_ext in ((plant.KP1, 0.5), (plant.KP2, 0.2), (5.0, 0.5)):
            deflection = submission.compliance_deflection(tau_ext, kp)
            tau_at_deflection = submission.spring_damper_torque(
                deflection, 0.0, 0.0, 0.0, kp, plant.KD1, 0.0)
            self.assertAlmostEqual(
                tau_at_deflection, tau_ext, delta=1e-12,
                msg="expected the spring at its own deflection to reproduce the external torque; a different value likely inverted tau/kp")

    def test_a_stiffer_joint_yields_less_than_the_soft_one(self):
        soft = submission.compliance_deflection(0.5, plant.KP2)
        stiff = submission.compliance_deflection(0.5, plant.KP1)
        self.assertLess(
            stiff, soft,
            msg="expected the stiffer shoulder to yield less than the elbow; a larger value likely multiplied by stiffness")
        self.assertGreater(
            soft * plant.KP2, 0.49,
            msg="expected the elbow deflection times its stiffness to return 0.5 N*m; a lower product likely used the shoulder kp")


if __name__ == "__main__":
    unittest.main()
