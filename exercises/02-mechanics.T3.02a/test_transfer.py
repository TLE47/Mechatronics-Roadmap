"""Transfer tests for 02-mechanics.T3.02a - the same six-dimensional algebra on the shared arm.

The claims:
  1. the shoulder turns about +Z through the base origin, so its screw axis has no linear part and
     a pure joint torque delivers exactly tau * dq;
  2. the elbow turns about +Z through (L1, 0, 0), so its linear part is (0, -L1, 0);
  3. the plant's whole weight descending at 0.40 m/s delivers its own 1.3734 W;
  4. the two-pass recursion on the plant's inertias gives (0.017, 0.009) N*m, and the coupling is
     what makes the shoulder carry the elbow;
  5. the plant's disturbance pulses are negative power while they push;
  6. the Christoffel form vanishes on the plant's decoupled mass matrix;
  7. a 1 mm notch that holds 0.5 deg at 207.7 MPa would need 2.65 deg and 1.1 GPa to hold the
     plant's 2.5 N*m clamp - past yield, which is why the stroke is rated, not the torque.
"""

import math
import unittest

import harness

submission = harness.load_submission()
plant = harness.plant

TI_E, TI_B, TI_T, TI_R = 114e9, 0.015, 0.001, 0.005
HALF_DEGREE = math.radians(0.50)


class JointAxisTests(unittest.TestCase):
    def test_the_shoulder_axis_runs_through_the_base(self):
        axis = submission.screw_axis([0.0, 0.0, 1.0], [0.0, 0.0, 0.0])
        for mine, expected in zip(axis, [0.0, 0.0, 1.0, 0.0, 0.0, 0.0]):
            self.assertAlmostEqual(
                mine,
                expected,
                delta=1e-15,
                msg="expected the shoulder axis through the base to have no linear part; a non-zero term likely used a point off the axis - check q is the origin",
            )

    def test_the_elbow_axis_runs_through_the_shoulder_tip(self):
        # -[0,0,1] x [L1, 0, 0] = [0, -L1, 0], with L1 = 0.10 m on this plant.
        axis = submission.screw_axis([0.0, 0.0, 1.0], [plant.L1, 0.0, 0.0])
        self.assertAlmostEqual(
            axis[3],
            0.0,
            delta=1e-15,
            msg="expected no x component for -[0,0,1] x [L1, 0, 0]; a non-zero value likely used +omega x q - check the sign",
        )
        self.assertAlmostEqual(
            axis[4],
            -plant.L1,
            delta=1e-15,
            msg="expected the y component to be -L1; a +L1 likely dropped the leading minus - check the cross-product order",
        )
        self.assertAlmostEqual(
            axis[4],
            -0.10,
            delta=1e-15,
            msg="expected -0.10 m on this plant; a value near -1.0 likely treated L1 as centimetres - check the plant's units",
        )
        self.assertAlmostEqual(
            axis[5],
            0.0,
            delta=1e-15,
            msg="expected no z component for a planar z-axis joint; a non-zero value likely crossed the wrong pair - check the linear part is -omega x q",
        )

    def test_a_joint_torque_delivers_its_own_power(self):
        axis = submission.screw_axis([0.0, 0.0, 1.0], [0.0, 0.0, 0.0])
        dq1 = 2.5  # rad/s
        twist = [value * dq1 for value in axis]
        wrench = [0.0, 0.0, plant.TAU_LIMIT, 0.0, 0.0, 0.0]
        self.assertAlmostEqual(submission.spatial_power(twist, wrench),
                               plant.TAU_LIMIT * dq1, delta=1e-12,
                               msg="expected tau*dq = 1.2 W from a pure joint torque; a zero likely kept only v.f - check the omega.m term")


class WeightPowerTests(unittest.TestCase):
    def test_the_plant_falling_under_its_own_weight(self):
        # (M1 + M2) * G = 0.35 * 9.81 = 3.4335 N, descending at 0.40 m/s: 1.3734 W.
        weight = (plant.M1 + plant.M2) * plant.G
        self.assertAlmostEqual(
            weight,
            3.4335,
            delta=1e-12,
            msg="expected (M1+M2)*G = 0.35*9.81 = 3.4335 N; a 2.5 N result likely used one link's mass - check both are added",
        )
        power = submission.spatial_power([0.0, 0.0, 0.0, 0.0, 0.0, -0.40],
                                         [0.0, 0.0, 0.0, 0.0, 0.0, -weight])
        self.assertAlmostEqual(
            power,
            1.3734,
            delta=1e-12,
            msg="expected 1.3734 W from the plant's weight at 0.40 m/s; a -1.3734 likely flipped the descent sign - check the velocity is negative",
        )

    def test_holding_still_costs_nothing(self):
        wrench = [0.0, 0.0, 0.0, 0.0, 0.0, -(plant.M1 + plant.M2) * plant.G]
        self.assertAlmostEqual(
            submission.spatial_power([0.0] * 6, wrench),
            0.0,
            delta=1e-15,
            msg="expected zero power when nothing moves; a non-zero value likely used another test's twist - check the twist is all zeros",
        )


class RneaOnThePlantTests(unittest.TestCase):
    def test_the_plants_inertias_through_the_two_passes(self):
        # I1 = 0.008, I2 = 0.003 kg*m^2; alpha = (1, 3): tau2 = 0.009, tau1 = 0.008 + 0.009.
        tau1, tau2 = submission.rnea_2link(plant.I1, plant.I2, 1.0, 2.0)
        self.assertAlmostEqual(
            tau2,
            0.009,
            delta=1e-15,
            msg="expected tau2 = 0.003*3 = 0.009 N*m; a 0.003 result likely skipped ddq2 - check the elbow's own inertia term",
        )
        self.assertAlmostEqual(
            tau1,
            0.017,
            delta=1e-15,
            msg="expected tau1 = 0.008 + 0.009 = 0.017 N*m; a 0.008 likely dropped the carried elbow - check the second pass",
        )

    def test_the_shoulder_carries_the_elbow(self):
        tau1, tau2 = submission.rnea_2link(plant.I1, plant.I2, 1.0, 2.0)
        self.assertAlmostEqual(
            tau1 - tau2,
            plant.I1 * 1.0,
            delta=1e-15,
            msg="expected the shoulder's own share to be I1*ddq1 = 0.008 N*m; a zero likely reported tau2 twice - check the subtraction",
        )


class DisturbancePowerTests(unittest.TestCase):
    def test_the_shoulder_pulse_removes_power(self):
        power = submission.spatial_power([0.0, 0.0, 1.0, 0.0, 0.0, 0.0],
                                         [0.0, 0.0, plant.DIST_TAU1, 0.0, 0.0, 0.0])
        self.assertAlmostEqual(
            power,
            -0.15,
            delta=1e-15,
            msg="expected the shoulder pulse to remove 0.15 W; a +0.15 likely read the disturbance as driving - check its sign",
        )

    def test_the_elbow_pulse_removes_power(self):
        power = submission.spatial_power([0.0, 0.0, 2.0, 0.0, 0.0, 0.0],
                                         [0.0, 0.0, plant.DIST_TAU2, 0.0, 0.0, 0.0])
        self.assertAlmostEqual(
            power,
            -0.16,
            delta=1e-15,
            msg="expected the elbow pulse to remove 0.16 W; a +0.16 likely flipped the moment sign - check DIST_TAU2 is negative",
        )


class PassivityOnThePlantTests(unittest.TestCase):
    def test_the_decoupled_mass_matrix_has_no_coriolis_form(self):
        # M = diag(I1, I2) with Mdot = C = 0: the identity holds for any joint velocity.
        zero = [[0.0, 0.0], [0.0, 0.0]]
        self.assertAlmostEqual(
            submission.passivity_quadratic_form(zero, zero, [1.5, -2.5]), 0.0, delta=1e-15,
            msg="expected zero for any velocity on a decoupled mass matrix; a non-zero likely used a coupled Mdot - check both matrices are zero")
        self.assertAlmostEqual(
            submission.passivity_quadratic_form(zero, zero, [plant.B1, plant.B2]), 0.0, delta=1e-15,
            msg="expected zero at the plant's damping values too; a non-zero likely mixed damping into the form - check the damping is not an argument")


class FlexureAgainstTheClampTests(unittest.TestCase):
    def test_the_worked_notch_cannot_hold_the_plants_clamp(self):
        stiffness = submission.flexure_stiffness(TI_E, TI_B, TI_T, TI_R)
        theta = plant.TAU_LIMIT / stiffness
        self.assertAlmostEqual(
            math.degrees(theta),
            2.6480,
            delta=1e-3,
            msg="expected 2.648 deg to hold the 2.5 N*m clamp; a 26.48 likely used radians where degrees belong - check the conversion",
        )
        sigma = submission.flexure_stress(stiffness, theta, TI_B, TI_T, TI_R)
        self.assertAlmostEqual(
            sigma,
            1.1e9,
            delta=1e6,
            msg="expected about 1.1 GPa at that angle; a 0.11 GPa likely forgot Kt - check the concentration factor",
        )
        self.assertGreater(
            sigma,
            880e6,
            "expected the clamp stress past Ti-6Al-4V yield, which is why the stroke is rated; a lower value likely used the wrong modulus - check E = 114 GPa",
        )

    def test_the_rated_stroke_is_the_one_that_survives(self):
        stiffness = submission.flexure_stiffness(TI_E, TI_B, TI_T, TI_R)
        rated = submission.flexure_stress(stiffness, HALF_DEGREE, TI_B, TI_T, TI_R)
        self.assertLess(
            rated,
            0.30 * 880e6,
            "expected the rated half-degree stroke to stay under 30% of yield; a higher stress likely dropped Kt - check the factor",
        )
        self.assertAlmostEqual(
            rated / 880e6,
            0.2360,
            delta=1e-3,
            msg="expected 0.236 of yield at the rated stroke; a value off by 1000 likely mixed MPa with Pa - check the units before dividing",
        )


if __name__ == "__main__":
    unittest.main()
