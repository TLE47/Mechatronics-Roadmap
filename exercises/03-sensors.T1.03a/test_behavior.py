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
        self.assertAlmostEqual(
            submission.back_emf(0.05, 100.0),
            5.0,
            delta=1e-12,
            msg="expected 5.0 V from 0.05 V*s/rad at 100 rad/s; another value likely means the constant and speed were swapped - check the argument order",
        )

    def test_a_stationary_rotor_generates_nothing(self):
        self.assertAlmostEqual(
            submission.back_emf(0.06, 0.0),
            0.0,
            delta=1e-15,
            msg="expected 0.0 V at zero speed; a nonzero value likely means a constant is added or speed is read from elsewhere - check the multiplier",
        )

    def test_the_emf_is_linear_in_speed(self):
        slow = submission.back_emf(0.06, 50.0)
        fast = submission.back_emf(0.06, 100.0)
        self.assertAlmostEqual(
            fast,
            2.0 * slow,
            delta=1e-12,
            msg="expected the EMF to double when speed doubles; another ratio likely means speed is scaled or offset - check that only the linear term changed",
        )
        self.assertAlmostEqual(
            fast,
            6.0,
            delta=1e-12,
            msg="expected 6.0 V at 100 rad/s with 0.06 V*s/rad; a different value likely means the constant or the speed is wrong - check 0.06*100",
        )

    def test_a_reversing_shaft_gives_a_negative_emf(self):
        self.assertAlmostEqual(
            submission.back_emf(0.06, -100.0),
            -6.0,
            delta=1e-12,
            msg="expected -6.0 V for a reversing shaft; a positive value likely means the speed sign was dropped - check that nothing takes abs() of speed",
        )

    def test_a_zero_constant_is_refused(self):
        for ke in (0.0, -0.05):
            with self.assertRaises(ValueError):
                submission.back_emf(ke, 100.0)


class CurrentTests(unittest.TestCase):
    def test_the_formalization_current(self):
        # (12.0 - 0.05*100)/2.0 = 7.0/2.0 = 3.5 A. Ignoring the EMF gives 6.0 A.
        self.assertAlmostEqual(
            submission.winding_current(12.0, 100.0, 0.05, 2.0),
            3.5,
            delta=1e-12,
            msg="expected 3.5 A from (12.0 - 5.0)/2.0; a value near 6.0 A likely means the back-EMF was left out - check the numerator",
        )

    def test_the_worked_stall_current(self):
        # omega_m = 0, so V/R = 12.0/4.0 = 3.0 A - the highest current the motor ever draws.
        self.assertAlmostEqual(
            submission.winding_current(12.0, 0.0, 0.06, 4.0),
            3.0,
            delta=1e-12,
            msg="expected 3.0 A at stall, which is just V/R; a lower value likely means an EMF was subtracted at zero speed - check the speed term",
        )

    def test_the_worked_no_load_speed_draws_nothing(self):
        # At 12.0/0.06 = 200 rad/s the back-EMF cancels the supply exactly.
        self.assertAlmostEqual(
            submission.winding_current(12.0, 200.0, 0.06, 4.0),
            0.0,
            delta=1e-12,
            msg="expected 0.0 A when the EMF cancels the supply at 200 rad/s; a nonzero value likely means the no-load speed or R is wrong - check 12.0/0.06",
        )

    def test_above_no_load_it_generates(self):
        # (12.0 - 0.06*250)/4.0 = -3.0/4.0 = -0.75 A: current pushed back into the supply.
        self.assertAlmostEqual(
            submission.winding_current(12.0, 250.0, 0.06, 4.0),
            -0.75,
            delta=1e-12,
            msg="expected -0.75 A above no-load speed, pushed back into the supply; a positive value likely means the subtraction order or a clamp - check V - k*omega",
        )

    def test_the_current_falls_as_the_shaft_speeds_up(self):
        currents = [submission.winding_current(12.0, w, 0.06, 4.0) for w in (0.0, 50.0, 100.0, 200.0)]
        self.assertEqual(
            currents,
            sorted(currents, reverse=True),
            "expected current to fall as speed rises; an unsorted list likely means speed adds instead of subtracting - check the back-EMF term",
        )

    def test_bad_windings_are_refused(self):
        with self.assertRaises(ValueError):
            submission.winding_current(12.0, 0.0, 0.06, 0.0)
        with self.assertRaises(ValueError):
            submission.winding_current(12.0, 0.0, 0.0, 4.0)


class TorqueTests(unittest.TestCase):
    def test_the_gate_test_torque(self):
        # 0.08 N*m/A * 4.5 A = 0.36 N*m.
        self.assertAlmostEqual(
            submission.motor_torque(0.08, 4.5),
            0.36,
            delta=1e-12,
            msg="expected 0.36 N*m from 0.08 N*m/A at 4.5 A; another value likely means the constant and current were swapped - check the argument order",
        )

    def test_electromechanical_power_balances(self):
        # v_bemf * i must equal tau * omega: 5.0 V * 3.5 A = 17.5 W = 0.175 N*m * 100 rad/s.
        v_bemf = submission.back_emf(0.05, 100.0)
        current = submission.winding_current(12.0, 100.0, 0.05, 2.0)
        torque = submission.motor_torque(0.05, current)
        self.assertAlmostEqual(
            v_bemf * current,
            torque * 100.0,
            delta=1e-9,
            msg="expected electrical power v_bemf*i to equal mechanical power tau*omega; a gap likely means one side used the wrong speed - check both sides are in the same units",
        )

    def test_braking_current_gives_negative_torque(self):
        self.assertAlmostEqual(
            submission.motor_torque(0.08, -2.0),
            -0.16,
            delta=1e-12,
            msg="expected -0.16 N*m from a braking current; a positive value likely means the current sign was dropped - check for abs() on current",
        )

    def test_a_zero_constant_is_refused(self):
        with self.assertRaises(ValueError):
            submission.motor_torque(0.0, 1.0)


class PolePairTests(unittest.TestCase):
    def test_the_worked_pole_pairs(self):
        # The worked example's 14-pole gimbal motor has p = 7 pole pairs.
        self.assertEqual(
            submission.pole_pairs(14),
            7,
            "expected 7 pole pairs from 14 magnets; 14 here likely means the magnet count was returned - check the division by two",
        )

    def test_the_skip_test_pole_pairs(self):
        self.assertEqual(
            submission.pole_pairs(28),
            14,
            "expected 14 pole pairs from 28 magnets; another value likely means the answer is hard-coded - check that the input is used",
        )

    def test_the_exercise_motor_is_seven_pole_pairs(self):
        # '12N14P' is 12 stator slots and 14 rotor magnets, so p = 7 and one electrical cycle
        # spans 360/7 = 51.428571... mechanical degrees.
        p = submission.pole_pairs(14)
        self.assertEqual(
            p,
            7,
            "expected p = 7 for a 12N14P motor; another value likely means stator slots were counted as pairs - check that only magnets enter",
        )
        self.assertAlmostEqual(
            360.0 / p,
            51.42857142857143,
            delta=1e-9,
            msg="expected one electrical cycle to span 51.4286 mechanical degrees at p = 7; a different span likely means p or 360 is wrong - check 360/p",
        )

    def test_a_pole_count_is_not_a_pair_count(self):
        # The module's first Common-mistakes row: BLDCMotor(14) for a 12N14P motor.
        self.assertNotEqual(
            submission.pole_pairs(14),
            14,
            "expected the pair count to differ from the magnet count; equality likely means the input was returned unhalved - check the divide by two",
        )

    def test_an_odd_magnet_count_is_refused(self):
        with self.assertRaises(ValueError):
            submission.pole_pairs(13)

    def test_no_magnets_is_refused(self):
        with self.assertRaises(ValueError):
            submission.pole_pairs(0)


class ElectricalAngleTests(unittest.TestCase):
    def test_the_gate_test_electrical_angle(self):
        # 7 * 1.0 rad = 7.0 rad, wrapped: 7.0 - 2*pi = 0.7168146928204138 rad.
        self.assertAlmostEqual(
            submission.electrical_angle(1.0, 7),
            0.7168146928204138,
            delta=1e-12,
            msg="expected 0.7168 rad after wrapping 7.0 rad; 7.0 here likely means the wrap was skipped - check the modulo before returning",
        )

    def test_one_electrical_cycle_per_seventh_of_a_turn(self):
        # pi/7 rad of shaft is exactly half an electrical cycle for p = 7.
        self.assertAlmostEqual(
            submission.electrical_angle(math.pi / 7.0, 7),
            math.pi,
            delta=1e-12,
            msg="expected pi at half an electrical cycle for p = 7; another angle likely means p is not multiplied in - check p*theta",
        )

    def test_eleven_pairs_are_eleven_cycles_per_turn(self):
        self.assertAlmostEqual(
            submission.electrical_angle(math.pi / 11.0, 11),
            math.pi,
            delta=1e-12,
            msg="expected pi at half a cycle for p = 11; a different angle likely means p was fixed at 7 - check the second argument is used",
        )

    def test_a_full_mechanical_turn_is_a_whole_number_of_cycles(self):
        # p full electrical cycles land back on zero however the wrap rounds the last flop.
        for p in (1, 7, 11):
            value = submission.electrical_angle(TAU, p)
            self.assertTrue(
                0.0 <= value < TAU,
                "expected the wrapped angle in [0, 2*pi); a value outside it likely means the modulo was skipped - check the wrap at the end",
            )
            self.assertLess(
                min(value, TAU - value),
                1e-9,
                "expected a full mechanical turn to land near 0 or 2*pi; a value away from both likely means the wrap lost a cycle - check the modulo arithmetic",
            )

    def test_reverse_rotation_wraps_forward(self):
        # 3 * -0.5 rad = -1.5 rad, which is -1.5 + 2*pi = 4.783185307179586 rad.
        self.assertAlmostEqual(
            submission.electrical_angle(-0.5, 3),
            4.783185307179586,
            delta=1e-12,
            msg="expected 4.7832 rad for a backwards rotation; a negative result likely means the wrap only handles forward motion - check adding 2*pi",
        )

    def test_a_bad_pole_pair_count_is_refused(self):
        for p in (0, -7):
            with self.assertRaises(ValueError):
                submission.electrical_angle(1.0, p)


class EncoderTests(unittest.TestCase):
    def test_the_worked_quadrature_cpr(self):
        # 1024 lines, 4x decoded: 4096 counts per revolution.
        self.assertEqual(
            submission.quadrature_cpr(1024),
            4096,
            "expected 4096 counts from 1024 lines at 4x decoding; 1024 here likely means the line count was returned - check the times-four",
        )

    def test_the_skip_test_cpr(self):
        self.assertEqual(
            submission.quadrature_cpr(500),
            2000,
            "expected 2000 counts from 500 lines; another value likely means the 4x factor is missing or fixed - check lines*4",
        )

    def test_counting_lines_instead_of_counts(self):
        # The module's second Common-mistakes row: a 4x-small angle after one full turn.
        self.assertNotEqual(
            submission.quadrature_cpr(1024),
            1024,
            "expected the count to exceed the line count; equality likely means the 4x decoding was skipped - check the multiplier",
        )
        self.assertEqual(
            submission.quadrature_cpr(1024),
            4 * 1024,
            "expected exactly four counts per line; another multiple likely means edges were miscounted - check the factor of four",
        )

    def test_the_12_bit_resolution(self):
        radians, degrees = submission.angle_resolution(4096)
        self.assertAlmostEqual(
            radians,
            0.0015339807878856412,
            delta=1e-18,
            msg="expected 2*pi/4096 rad per count; a different value likely means the count was not used as the divisor - check 2*pi/cpr",
        )
        self.assertAlmostEqual(
            degrees,
            0.087890625,
            delta=1e-12,
            msg="expected 0.0879 degrees per count at 4096 cpr; a different value likely means a radian/degree mix-up - check the conversion",
        )

    def test_the_exercise_14_bit_encoder(self):
        # AS5048A: 2**14 = 16384 counts per revolution -> 0.02197265625 degrees per count.
        radians, degrees = submission.angle_resolution(16384)
        self.assertAlmostEqual(
            degrees,
            0.02197265625,
            delta=1e-12,
            msg="expected 0.02197 degrees per count at 2**14; a value near 0.0879 likely means 4096 was used instead - check the cpr passed in",
        )
        self.assertAlmostEqual(
            radians,
            0.0003834951969714103,
            delta=1e-18,
            msg="expected 3.835e-4 rad per count at 16384 cpr; a different value likely means the wrong count-per-turn - check 2*pi/16384",
        )

    def test_the_four_times_relation_holds(self):
        cpr = submission.quadrature_cpr(2048)
        self.assertEqual(
            cpr,
            8192,
            "expected 8192 counts from 2048 lines; a different multiple likely means the 4x factor is applied twice or not at all - check lines*4",
        )
        self.assertAlmostEqual(
            submission.angle_resolution(cpr)[0],
            TAU / 8192.0,
            delta=1e-18,
            msg="expected the resolution to equal 2*pi/8192; a mismatch likely means the resolution used the line count - check which count is passed",
        )

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
        self.assertEqual(
            count,
            5,
            "expected five forward edges in the worked sequence; a lower count likely means a two-bit jump was skipped as well - check the transition table",
        )

    def test_the_reverse_sequence_counts_minus_five(self):
        states = [0b00, 0b01, 0b11, 0b10, 0b00, 0b01]
        count = sum(submission.quad_step(states[k], states[k + 1]) for k in range(len(states) - 1))
        self.assertEqual(
            count,
            -5,
            "expected minus five for the reverse sequence; a positive count likely means direction ignores which channel moved first - check the sign per edge",
        )

    def test_a_two_bit_jump_is_not_a_step(self):
        # 00 -> 11 flips both channels: a glitch, or a sample rate below the edge rate.
        self.assertEqual(
            submission.quad_step(0b00, 0b11),
            0,
            "expected 0 for a two-bit jump; a step here likely means both channels flipping was counted as one edge - check that only single-bit changes count",
        )
        self.assertEqual(
            submission.quad_step(0b11, 0b00),
            0,
            "expected 0 for the reversed two-bit jump; a step here likely means the guard only catches one direction - check the XOR popcount",
        )

    def test_a_single_bit_step_has_a_direction(self):
        self.assertEqual(
            submission.quad_step(0b00, 0b10),
            1,
            "expected +1 for that single-bit edge; another value likely means the direction table is reversed - check which bit changed",
        )
        self.assertEqual(
            submission.quad_step(0b10, 0b00),
            -1,
            "expected -1 when the same edge runs backwards; +1 here likely means direction ignores the channel that moved - check the lookup",
        )

    def test_no_change_is_zero(self):
        for state in (0b00, 0b01, 0b10, 0b11):
            self.assertEqual(
                submission.quad_step(state, state),
                0,
                "expected 0 for a repeated state; a nonzero step likely means equal codes are counted as an edge - check the equality guard",
            )

    def test_a_three_bit_code_is_refused(self):
        with self.assertRaises(ValueError):
            submission.quad_step(0b00, 0b100)


if __name__ == "__main__":
    unittest.main()
