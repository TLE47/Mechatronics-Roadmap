"""Transfer tests for 02-mechanics.T1.02a - the lever arms the plant actually has.

Three claims, measured on the shared arm:
  1. the shoulder's gravity torque is one lever arm holding the link plus the elbow's payload, so
     `gravity_torque(q1, M1, LC1, M2, L1)` must equal `plant.gravity_torque(q1, q2)[0] - [1]` at
     every pose;
  2. the elbow's own term is a single link whose angle is `q1 + q2`;
  3. the plant's 2.5 N*m torque clamp, driven back through an 8:1 belt at 90% efficiency, needs
     0.347 N*m at the motor - and reflecting the plant's joint inertia through a 4:1 stage is
     exactly sixteen times it.
"""

import math
import unittest

import harness

submission = harness.load_submission()
plant = harness.plant

POSES = ((0.0, 0.0), (0.4, -0.7), (-1.1, 0.9), (math.pi / 2.0, 0.3))


class ShoulderLeverTests(unittest.TestCase):
    def test_the_shoulders_term_is_the_accumulated_lever(self):
        for q1, q2 in POSES:
            tau_g1, tau_g2 = plant.gravity_torque(q1, q2)
            mine = submission.gravity_torque(q1, plant.M1, plant.LC1, plant.M2, plant.L1,
                                             g=plant.G)
            self.assertAlmostEqual(
                mine, tau_g1 - tau_g2, delta=1e-12,
                msg="expected the shoulder's term to equal the plant's total minus the elbow's "
                    "own at every pose; a mismatch means the payload lever or its cosine is "
                    "wrong - check M2 L1 cos(q1)",
            )

    def test_the_elbow_is_one_link_at_q1_plus_q2(self):
        for q1, q2 in POSES:
            _tau_g1, tau_g2 = plant.gravity_torque(q1, q2)
            mine = submission.gravity_torque(q1 + q2, plant.M2, plant.LC2, g=plant.G)
            self.assertAlmostEqual(
                mine, tau_g2, delta=1e-12,
                msg="expected the elbow to be one link evaluated at q1 + q2; a mismatch means "
                    "the absolute joint angle was passed as the relative one - check the sum",
            )

    def test_the_two_link_torque_is_the_sum_of_two_levers(self):
        for q1, q2 in POSES:
            tau_g1, _tau_g2 = plant.gravity_torque(q1, q2)
            shoulder = submission.gravity_torque(q1, plant.M1, plant.LC1, plant.M2, plant.L1,
                                                 g=plant.G)
            elbow = submission.gravity_torque(q1 + q2, plant.M2, plant.LC2, g=plant.G)
            self.assertAlmostEqual(
                shoulder + elbow, tau_g1, delta=1e-12,
                msg="expected the two lever arms to add up to the plant's shoulder torque; a "
                    "mismatch means one term is counted twice or dropped - check both levers",
            )

    def test_the_plant_is_heaviest_horizontal(self):
        horizontal = plant.gravity_torque(0.0, 0.0)[0]
        vertical = plant.gravity_torque(math.pi / 2.0, 0.0)[0]
        self.assertGreater(
            horizontal, vertical,
            msg="expected the plant's shoulder to hold more torque horizontal than straight up; "
                "the reverse means the model is driven by sin instead of cos",
        )
        self.assertAlmostEqual(
            vertical, 0.0, delta=1e-12,
            msg="expected the fully raised arm to need no holding torque; a nonzero value means "
                "the link's own weight is still levered at 90 degrees",
        )
        # Straight up, but with the elbow folded back out horizontally: the shoulder then holds
        # nothing but the elbow's own lever arm.
        folded = plant.gravity_torque(math.pi / 2.0, -math.pi / 2.0)[0]
        self.assertAlmostEqual(
            folded, plant.M2 * plant.G * plant.LC2, delta=1e-12,
            msg="expected the folded pose to leave only the elbow's own M2 G LC2 term; a larger "
                "value means the shoulder link mass survived a vertical pose",
        )


class BeltBudgetTests(unittest.TestCase):
    def test_the_clamp_through_an_eight_to_one_belt(self):
        ratio, eta = 8.0, 0.9
        motor = plant.TAU_LIMIT / (eta * ratio)
        self.assertAlmostEqual(
            motor, 0.3472222222222222, delta=1e-15,
            msg="expected the 2.5 N*m clamp to need 0.347 N*m at the motor through 8:1 at 90 "
                "percent; 0.312 means the efficiency was dropped - check eta x ratio",
        )
        self.assertAlmostEqual(
            submission.gear_output_torque(motor, ratio, eta), plant.TAU_LIMIT, delta=1e-12,
            msg="expected the computed motor torque to drive back to exactly the 2.5 N*m clamp; "
                "a mismatch means the two directions use different formulas",
        )

    def test_the_speed_the_motor_needs(self):
        # A 160 rad/s motor into 8:1 turns the joint at 20 rad/s.
        self.assertAlmostEqual(
            submission.gear_output_speed(160.0, 8.0), 20.0, delta=1e-12,
            msg="expected 160 rad/s through 8:1 to turn the joint at 20 rad/s; 1280 means the "
                "reduction multiplied instead of dividing, so the belt would speed the joint up",
        )

    def test_power_out_is_eta_times_power_in(self):
        ratio, eta = 8.0, 0.9
        motor_torque = plant.TAU_LIMIT / (eta * ratio)
        motor_speed = 160.0
        out_torque = submission.gear_output_torque(motor_torque, ratio, eta)
        out_speed = submission.gear_output_speed(motor_speed, ratio)
        self.assertAlmostEqual(
            submission.mechanical_power(out_torque, out_speed),
            eta * submission.mechanical_power(motor_torque, motor_speed), delta=1e-9,
            msg="expected the belt to deliver 90 percent of the motor's 55.6 W, so 50 W; a larger "
                "figure means the loss was invented rather than lost - check where eta sits",
        )

    def test_reflecting_the_plants_joint_inertia(self):
        self.assertAlmostEqual(
            submission.reflected_inertia(plant.I1, 4.0), 0.128, delta=1e-15,
            msg="expected the plant's shoulder inertia reflected through 4:1 to be 0.128; 0.032 "
                "means the ratio was applied once - check N^2 J",
        )
        self.assertAlmostEqual(
            submission.reflected_inertia(plant.I1, 4.0), 16.0 * plant.I1, delta=1e-15,
            msg="expected the reflected inertia to be exactly sixteen times the joint's own, the "
                "square of 4:1; a smaller factor means the belt looks stiffer than it is",
        )


if __name__ == "__main__":
    unittest.main()
