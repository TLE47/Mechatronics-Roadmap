"""Behaviour tests for 02-mechanics.T1.02a.

Each test names the mistake it catches:
  * gravity torque built from sin instead of cos, which puts the maximum holding torque overhead
    instead of horizontal - the module's first Common-mistakes row;
  * a link whose own mass is dropped from the sum, so a shoulder motor is sized on the payload
    alone;
  * a balance force that multiplies by the lever instead of dividing by it;
  * a gear ratio upside down (driver over driven), which turns a 4.5:1 reducer into 0.22:1;
  * an output speed multiplied by N, so a reducer is reported as a speed multiplier;
  * an output torque that ignores the belt's efficiency.
"""

import math
import unittest

import harness

submission = harness.load_submission()


class GravityTests(unittest.TestCase):
    def test_the_worked_horizontal_torque(self):
        # (0.40*0.10 + 0.50*0.20) * 9.81 = 0.14 * 9.81 = 1.3734 N*m.
        self.assertAlmostEqual(
            submission.gravity_torque(0.0, 0.40, 0.10, 0.50, 0.20), 1.3734, delta=1e-9,
            msg="expected the horizontal arm to need 1.373 N*m from the shoulder; 0.0 means cos "
                "was evaluated at the wrong angle - check theta measured from horizontal",
        )

    def test_the_worked_sixty_degree_torque(self):
        self.assertAlmostEqual(
            submission.gravity_torque(math.pi / 3.0, 0.40, 0.10, 0.50, 0.20), 0.6867,
            delta=1e-9,
            msg="expected 60 degrees of elevation to halve the holding torque to 0.687 N*m; 1.19 "
                "means cos was replaced by sin and the profile is inverted",
        )

    def test_overhead_has_no_lever_arm(self):
        # The Skip test: 1 kg at 0.30 m straight up needs nothing from the shoulder.
        self.assertAlmostEqual(
            submission.gravity_torque(math.pi / 2.0, 1.0, 0.30), 0.0, delta=1e-9,
            msg="expected a straight-up arm to need no holding torque at all; 2.94 means the "
                "angle was measured from vertical, so the peak lands overhead",
        )

    def test_the_maximum_is_horizontal(self):
        # This is the sin/cos discriminator: horizontal must beat 45 degrees, which beats vertical.
        horizontal = submission.gravity_torque(0.0, 0.8, 0.25)
        diagonal = submission.gravity_torque(math.pi / 4.0, 0.8, 0.25)
        vertical = submission.gravity_torque(math.pi / 2.0, 0.8, 0.25)
        self.assertGreater(
            horizontal, diagonal,
            msg="expected horizontal to hold the most torque, above the 45 degree pose; the "
                "reverse is the sin/cos swap the module warns about - check the angle offset",
        )
        self.assertGreater(
            diagonal, vertical,
            msg="expected the 45 degree pose to sit between horizontal and vertical; a smaller "
                "value means the profile is not a cosine at all",
        )

    def test_the_gate_test_maximum(self):
        self.assertAlmostEqual(
            submission.gravity_torque(0.0, 0.0, 0.0, 0.80, 0.25), 1.962, delta=1e-6,
            msg="expected a 0.80 kg payload at 0.25 m to need 1.962 N*m horizontally; 1.71 means "
                "the link mass was subtracted rather than defaulted to zero",
        )

    def test_the_gate_test_sixty_degrees(self):
        self.assertAlmostEqual(
            submission.gravity_torque(math.pi / 3.0, 0.0, 0.0, 0.80, 0.25), 0.981, delta=1e-6,
            msg="expected the same payload at 60 degrees to need half of 1.962, so 0.981 N*m; "
                "1.70 means the cosine was not applied to the payload term",
        )

    def test_a_negative_mass_is_refused(self):
        with self.assertRaises(ValueError):
            submission.gravity_torque(0.0, -0.1, 0.1)


class BalanceTests(unittest.TestCase):
    def test_the_skip_test_balancing_force(self):
        # 30 N at 0.20 m needs 60 N at 0.10 m.
        self.assertAlmostEqual(
            submission.balance_force(30.0, 0.20, 0.10), 60.0, delta=1e-12,
            msg="expected 30 N at twice the lever to need 60 N on the short arm; 15 means the "
                "levers were multiplied instead of divided - check F1 x1 / x2",
        )

    def test_a_longer_lever_needs_less_force(self):
        self.assertAlmostEqual(
            submission.balance_force(30.0, 0.20, 0.40), 15.0, delta=1e-12,
            msg="expected the same 30 N to need only 15 N on a lever twice as long; 60 means the "
                "ratio was inverted, so a longer arm demanded more force",
        )

    def test_a_force_at_the_pivot_balances_nothing(self):
        with self.assertRaises(ValueError):
            submission.balance_force(30.0, 0.20, 0.0)


class GearTests(unittest.TestCase):
    def test_the_exercise_ratio(self):
        self.assertAlmostEqual(
            submission.gear_ratio(72, 16), 4.5, delta=1e-12,
            msg="expected 72 driven teeth over 16 driver teeth to be a 4.5:1 reducer; 0.222 "
                "means the ratio is upside down - check driven / driver",
        )

    def test_the_gate_test_ratio(self):
        self.assertAlmostEqual(
            submission.gear_ratio(100, 20), 5.0, delta=1e-12,
            msg="expected a 100-tooth driven pulley over a 20-tooth driver to be 5:1; 0.2 means "
                "the driver was divided by the driven",
        )

    def test_the_exercise_output_speed(self):
        self.assertAlmostEqual(
            submission.gear_output_speed(90.0, 4.5), 20.0, delta=1e-12,
            msg="expected a 4.5:1 reducer to drop 90 rad/s to 20 rad/s; 405 means the speed was "
                "multiplied by N, which turns a reducer into an overdrive",
        )

    def test_the_gate_test_output_speed(self):
        self.assertAlmostEqual(
            submission.gear_output_speed(150.0, 5.0), 30.0, delta=1e-12,
            msg="expected a 5:1 stage to drop 150 rad/s to 30 rad/s; 750 means the reduction was "
                "applied in the wrong direction - check omega / N",
        )

    def test_the_exercise_output_torque(self):
        # 0.40 * 4.5 * 0.95 = 1.71 N*m.
        self.assertAlmostEqual(
            submission.gear_output_torque(0.40, 4.5, 0.95), 1.71, delta=1e-12,
            msg="expected 0.40 N*m through a 95 percent efficient 4.5:1 belt to reach 1.71 N*m; "
                "1.8 means the efficiency was ignored - check eta x N x tau",
        )

    def test_the_gate_test_output_torque(self):
        self.assertAlmostEqual(
            submission.gear_output_torque(0.50, 5.0, 0.92), 2.3, delta=1e-12,
            msg="expected 0.50 N*m through a 5:1 stage at 92 percent to reach 2.3 N*m; 2.5 means "
                "the belt was treated as lossless",
        )

    def test_an_ideal_reducer_conserves_power(self):
        torque = submission.gear_output_torque(0.25, 8.0, 1.0)
        speed = submission.gear_output_speed(160.0, 8.0)
        self.assertAlmostEqual(
            torque, 2.0, delta=1e-12,
            msg="expected 0.25 N*m through an ideal 8:1 stage to reach 2.0 N*m; 0.031 means the "
                "ratio was divided instead of multiplied - check eta N tau",
        )
        self.assertAlmostEqual(
            speed, 20.0, delta=1e-12,
            msg="expected the ideal stage to drop 160 rad/s to 20 rad/s; 1280 means the speed was "
                "scaled by N and the gear train does no work at all",
        )
        self.assertAlmostEqual(
            submission.mechanical_power(torque, speed),
            submission.mechanical_power(0.25, 160.0), delta=1e-12,
            msg="expected power in to equal power out at unity efficiency, 40 W each; a mismatch "
                "means the torque and speed laws disagree by a factor of N",
        )

    def test_a_lossy_reducer_loses_exactly_eta(self):
        torque = submission.gear_output_torque(0.40, 4.5, 0.95)
        speed = submission.gear_output_speed(90.0, 4.5)
        self.assertAlmostEqual(
            submission.mechanical_power(torque, speed),
            0.95 * submission.mechanical_power(0.40, 90.0), delta=1e-9,
            msg="expected the 95 percent belt to pass 0.95 of 36 W, so 34.2 W; 36 W means the "
                "efficiency never reached the output side - check where eta is applied",
        )

    def test_bad_ratios_and_efficiencies_are_refused(self):
        with self.assertRaises(ValueError):
            submission.gear_ratio(72, 0)
        with self.assertRaises(ValueError):
            submission.gear_output_speed(90.0, 0.0)
        for eta in (0.0, 1.5, -0.1):
            with self.assertRaises(ValueError):
                submission.gear_output_torque(0.4, 4.5, eta)


class InertiaTests(unittest.TestCase):
    def test_the_square_law(self):
        # Reflecting 1e-5 kg*m^2 through a 4.5:1 belt multiplies it by 20.25.
        self.assertAlmostEqual(
            submission.reflected_inertia(1e-5, 4.5), 2.025e-4, delta=1e-15,
            msg="expected 1e-5 kg m^2 reflected through 4.5:1 to become 2.025e-4; 4.5e-5 means "
                "the ratio was applied once instead of squared - check N^2 J",
        )

    def test_doubling_the_ratio_quadruples_the_inertia(self):
        one = submission.reflected_inertia(2e-5, 4.0)
        two = submission.reflected_inertia(2e-5, 8.0)
        self.assertAlmostEqual(
            two / one, 4.0, delta=1e-12,
            msg="expected doubling the ratio to quadruple the reflected inertia; 2.0 means the "
                "square is missing, which understates what the motor must accelerate",
        )


if __name__ == "__main__":
    unittest.main()
