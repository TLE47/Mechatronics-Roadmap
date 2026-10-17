"""Behaviour tests for 03-sensors.T1.03a.

Each test names the mistake it catches:
  * a current computed as V/R, as if the spinning rotor generated nothing;
  * a pole-pair count that reports the 14 magnets instead of the 7 pairs;
  * an electrical angle left unwrapped, so a 14-pole motor reads 7 rad instead of 0.717 rad;
  * a quadrature count that reports the 1024 encoder lines instead of 4096 counts;
  * a decoder that counts a two-bit jump (00 -> 11) as a step in one direction.
"""

import math
import unittest

import harness

submission = harness.load_submission()

TAU = 2.0 * math.pi


class BackEmfTests(unittest.TestCase):
    def test_the_formalization_back_emf(self):
        # 0.05 V*s/rad at 100 rad/s is 5.0 V, which is why 12.0 V leaves 7.0 V across R.
        self.assertAlmostEqual(submission.back_emf(0.05, 100.0), 5.0, delta=1e-12)

    def test_a_stationary_rotor_generates_nothing(self):
        self.assertAlmostEqual(submission.back_emf(0.06, 0.0), 0.0, delta=1e-15)

    def test_the_emf_is_linear_in_speed(self):
        slow = submission.back_emf(0.06, 50.0)
        fast = submission.back_emf(0.06, 100.0)
        self.assertAlmostEqual(fast, 2.0 * slow, delta=1e-12)
        self.assertAlmostEqual(fast, 6.0, delta=1e-12)

    def test_a_reversing_shaft_gives_a_negative_emf(self):
        self.assertAlmostEqual(submission.back_emf(0.06, -100.0), -6.0, delta=1e-12)

    def test_a_zero_constant_is_refused(self):
        for ke in (0.0, -0.05):
            with self.assertRaises(ValueError):
                submission.back_emf(ke, 100.0)


class CurrentTests(unittest.TestCase):
    def test_the_formalization_current(self):
        # (12.0 - 0.05*100)/2.0 = 7.0/2.0 = 3.5 A. Ignoring the EMF gives 6.0 A.
        self.assertAlmostEqual(submission.winding_current(12.0, 100.0, 0.05, 2.0), 3.5, delta=1e-12)

    def test_the_worked_stall_current(self):
        # omega_m = 0, so V/R = 12.0/4.0 = 3.0 A - the highest current the motor ever draws.
        self.assertAlmostEqual(submission.winding_current(12.0, 0.0, 0.06, 4.0), 3.0, delta=1e-12)

    def test_the_worked_no_load_speed_draws_nothing(self):
        # At 12.0/0.06 = 200 rad/s the back-EMF cancels the supply exactly.
        self.assertAlmostEqual(submission.winding_current(12.0, 200.0, 0.06, 4.0), 0.0, delta=1e-12)

    def test_above_no_load_it_generates(self):
        # (12.0 - 0.06*250)/4.0 = -3.0/4.0 = -0.75 A: current pushed back into the supply.
        self.assertAlmostEqual(submission.winding_current(12.0, 250.0, 0.06, 4.0), -0.75, delta=1e-12)

    def test_the_current_falls_as_the_shaft_speeds_up(self):
        currents = [submission.winding_current(12.0, w, 0.06, 4.0) for w in (0.0, 50.0, 100.0, 200.0)]
        self.assertEqual(currents, sorted(currents, reverse=True))

    def test_bad_windings_are_refused(self):
        with self.assertRaises(ValueError):
            submission.winding_current(12.0, 0.0, 0.06, 0.0)
        with self.assertRaises(ValueError):
            submission.winding_current(12.0, 0.0, 0.0, 4.0)


class TorqueTests(unittest.TestCase):
    def test_the_gate_test_torque(self):
        # 0.08 N*m/A * 4.5 A = 0.36 N*m.
        self.assertAlmostEqual(submission.motor_torque(0.08, 4.5), 0.36, delta=1e-12)

    def test_electromechanical_power_balances(self):
        # v_bemf * i must equal tau * omega: 5.0 V * 3.5 A = 17.5 W = 0.175 N*m * 100 rad/s.
        v_bemf = submission.back_emf(0.05, 100.0)
        current = submission.winding_current(12.0, 100.0, 0.05, 2.0)
        torque = submission.motor_torque(0.05, current)
        self.assertAlmostEqual(v_bemf * current, torque * 100.0, delta=1e-9)

    def test_braking_current_gives_negative_torque(self):
        self.assertAlmostEqual(submission.motor_torque(0.08, -2.0), -0.16, delta=1e-12)

    def test_a_zero_constant_is_refused(self):
        with self.assertRaises(ValueError):
            submission.motor_torque(0.0, 1.0)


class PolePairTests(unittest.TestCase):
    def test_the_worked_pole_pairs(self):
        # The worked example's 14-pole gimbal motor has p = 7 pole pairs.
        self.assertEqual(submission.pole_pairs(14), 7)

    def test_the_skip_test_pole_pairs(self):
        self.assertEqual(submission.pole_pairs(28), 14)

    def test_the_exercise_motor_is_seven_pole_pairs(self):
        # '12N14P' is 12 stator slots and 14 rotor magnets, so p = 7 and one electrical cycle
        # spans 360/7 = 51.428571... mechanical degrees.
        p = submission.pole_pairs(14)
        self.assertEqual(p, 7)
        self.assertAlmostEqual(360.0 / p, 51.42857142857143, delta=1e-9)

    def test_a_pole_count_is_not_a_pair_count(self):
        # The module's first Common-mistakes row: BLDCMotor(14) for a 12N14P motor.
        self.assertNotEqual(submission.pole_pairs(14), 14)

    def test_an_odd_magnet_count_is_refused(self):
        with self.assertRaises(ValueError):
            submission.pole_pairs(13)

    def test_no_magnets_is_refused(self):
        with self.assertRaises(ValueError):
            submission.pole_pairs(0)


class ElectricalAngleTests(unittest.TestCase):
    def test_the_gate_test_electrical_angle(self):
        # 7 * 1.0 rad = 7.0 rad, wrapped: 7.0 - 2*pi = 0.7168146928204138 rad.
        self.assertAlmostEqual(submission.electrical_angle(1.0, 7), 0.7168146928204138, delta=1e-12)

    def test_one_electrical_cycle_per_seventh_of_a_turn(self):
        # pi/7 rad of shaft is exactly half an electrical cycle for p = 7.
        self.assertAlmostEqual(submission.electrical_angle(math.pi / 7.0, 7), math.pi, delta=1e-12)

    def test_eleven_pairs_are_eleven_cycles_per_turn(self):
        self.assertAlmostEqual(submission.electrical_angle(math.pi / 11.0, 11), math.pi, delta=1e-12)

    def test_a_full_mechanical_turn_is_a_whole_number_of_cycles(self):
        # p full electrical cycles land back on zero however the wrap rounds the last flop.
        for p in (1, 7, 11):
            value = submission.electrical_angle(TAU, p)
            self.assertTrue(0.0 <= value < TAU, "p=%d returned %r" % (p, value))
            self.assertLess(min(value, TAU - value), 1e-9, "p=%d returned %r" % (p, value))

    def test_reverse_rotation_wraps_forward(self):
        # 3 * -0.5 rad = -1.5 rad, which is -1.5 + 2*pi = 4.783185307179586 rad.
        self.assertAlmostEqual(submission.electrical_angle(-0.5, 3), 4.783185307179586, delta=1e-12)

    def test_a_bad_pole_pair_count_is_refused(self):
        for p in (0, -7):
            with self.assertRaises(ValueError):
                submission.electrical_angle(1.0, p)


class EncoderTests(unittest.TestCase):
    def test_the_worked_quadrature_cpr(self):
        # 1024 lines, 4x decoded: 4096 counts per revolution.
        self.assertEqual(submission.quadrature_cpr(1024), 4096)

    def test_the_skip_test_cpr(self):
        self.assertEqual(submission.quadrature_cpr(500), 2000)

    def test_counting_lines_instead_of_counts(self):
        # The module's second Common-mistakes row: a 4x-small angle after one full turn.
        self.assertNotEqual(submission.quadrature_cpr(1024), 1024)
        self.assertEqual(submission.quadrature_cpr(1024), 4 * 1024)

    def test_the_12_bit_resolution(self):
        radians, degrees = submission.angle_resolution(4096)
        self.assertAlmostEqual(radians, 0.0015339807878856412, delta=1e-18)
        self.assertAlmostEqual(degrees, 0.087890625, delta=1e-12)

    def test_the_exercise_14_bit_encoder(self):
        # AS5048A: 2**14 = 16384 counts per revolution -> 0.02197265625 degrees per count.
        radians, degrees = submission.angle_resolution(16384)
        self.assertAlmostEqual(degrees, 0.02197265625, delta=1e-12)
        self.assertAlmostEqual(radians, 0.0003834951969714103, delta=1e-18)

    def test_the_four_times_relation_holds(self):
        cpr = submission.quadrature_cpr(2048)
        self.assertEqual(cpr, 8192)
        self.assertAlmostEqual(submission.angle_resolution(cpr)[0], TAU / 8192.0, delta=1e-18)

    def test_an_empty_encoder_is_refused(self):
        with self.assertRaises(ValueError):
            submission.quadrature_cpr(0)
        with self.assertRaises(ValueError):
            submission.angle_resolution(0)


class QuadratureTests(unittest.TestCase):
    def test_the_worked_sequence_counts_five(self):
        # 00 -> 10 -> 11 -> 01 -> 00 -> 10: five forward edges.
        states = [0b00, 0b10, 0b11, 0b01, 0b00, 0b10]
        count = sum(submission.quad_step(states[k], states[k + 1]) for k in range(len(states) - 1))
        self.assertEqual(count, 5)

    def test_the_reverse_sequence_counts_minus_five(self):
        states = [0b00, 0b01, 0b11, 0b10, 0b00, 0b01]
        count = sum(submission.quad_step(states[k], states[k + 1]) for k in range(len(states) - 1))
        self.assertEqual(count, -5)

    def test_a_two_bit_jump_is_not_a_step(self):
        # 00 -> 11 flips both channels: a glitch, or a sample rate below the edge rate.
        self.assertEqual(submission.quad_step(0b00, 0b11), 0)
        self.assertEqual(submission.quad_step(0b11, 0b00), 0)

    def test_a_single_bit_step_has_a_direction(self):
        self.assertEqual(submission.quad_step(0b00, 0b10), 1)
        self.assertEqual(submission.quad_step(0b10, 0b00), -1)

    def test_no_change_is_zero(self):
        for state in (0b00, 0b01, 0b10, 0b11):
            self.assertEqual(submission.quad_step(state, state), 0)

    def test_a_three_bit_code_is_refused(self):
        with self.assertRaises(ValueError):
            submission.quad_step(0b00, 0b100)


if __name__ == "__main__":
    unittest.main()
