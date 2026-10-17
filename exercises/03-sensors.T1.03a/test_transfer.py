"""Transfer tests for 03-sensors.T1.03a - the encoder and actuator the plant actually has.

Four claims, measured against `resources/plants/mechalab_plant.py`:
  1. the plant's 12-bit AS5600 is exactly a 1024-line encoder decoded 4x, and one of its counts is
     2*pi/4096 rad;
  2. at the plant's 1 kHz tick, a shaft fast enough to be interesting changes many counts per
     sample, so single-step decoding cannot keep up above ~1.53 rad/s;
  3. the plant's wrap and the module's electrical angle name the same angle at one pole pair;
  4. a 12 V / 4 ohm winding with Kt = Ke = 0.06 cannot reach the plant's 2.5 N*m clamp, while it
     can produce the -0.15 N*m disturbance pulse with 2.5 A of braking current.
"""

import math
import unittest

import harness

submission = harness.load_submission()
plant = harness.plant

TAU = 2.0 * math.pi
KT = 0.06  # N*m/A, and Ke = Kt in SI units
R_OHM = 4.0
V_BUS = 12.0


class PlantEncoderTests(unittest.TestCase):
    def test_the_plant_encoder_is_a_1024_line_quadrature_count(self):
        self.assertEqual(plant.ENCODER_BITS, 12)
        self.assertEqual(plant.ENCODER_CPR, 2 ** plant.ENCODER_BITS)
        self.assertEqual(plant.ENCODER_CPR, 4096)
        self.assertEqual(submission.quadrature_cpr(1024), plant.ENCODER_CPR)

    def test_one_plant_count_is_the_resolution(self):
        radians, degrees = submission.angle_resolution(plant.ENCODER_CPR)
        self.assertAlmostEqual(radians, TAU / 4096.0, delta=1e-18)
        self.assertAlmostEqual(degrees, 360.0 / 4096.0, delta=1e-12)
        self.assertAlmostEqual(degrees * plant.ENCODER_CPR, 360.0, delta=1e-9)

    def test_the_plant_tick_sees_many_counts_per_sample_at_speed(self):
        # One count per 1 ms tick is 2*pi/4096/0.001 = 1.5339807... rad/s - barely 14.6 RPM.
        per_tick_limit = submission.angle_resolution(plant.ENCODER_CPR)[0] / plant.DT
        self.assertAlmostEqual(per_tick_limit, 1.5339807878856412, delta=1e-9)
        # At the worked example's 200 rad/s no-load speed the shaft passes ~130 counts per tick,
        # so a decoder that only accepts single-step edges has already lost the direction.
        counts_per_tick = 200.0 / TAU * plant.ENCODER_CPR * plant.DT
        self.assertGreater(counts_per_tick, 100.0)
        self.assertGreater(counts_per_tick, 80.0 * per_tick_limit)


class PlantAngleTests(unittest.TestCase):
    def test_the_plant_wrap_is_the_electrical_angle_at_one_pole_pair(self):
        for angle in (0.0, 1.0, -2.5, math.pi, -math.pi, 7.0):
            mine = submission.electrical_angle(angle, 1)
            theirs = plant.wrap_pi(angle) % TAU
            self.assertAlmostEqual(mine, theirs, delta=1e-12, msg="angle %r" % angle)

    def test_a_seven_pole_pair_rotor_on_the_plant_shaft(self):
        # Half a mechanical turn through 7 pole pairs is exactly 7 electrical half-cycles, so the
        # wrapped angle is pi - and the plant's own 4096-count encoder spans that in 2048 counts.
        self.assertAlmostEqual(submission.electrical_angle(math.pi, 7), math.pi, delta=1e-12)
        self.assertEqual(plant.ENCODER_CPR // 2, 2048)


class PlantActuatorTests(unittest.TestCase):
    def test_the_plant_disturbance_pulse_needs_two_and_a_half_amps(self):
        current = plant.DIST_TAU1 / KT
        self.assertAlmostEqual(current, -2.5, delta=1e-12)
        self.assertAlmostEqual(submission.motor_torque(KT, current), plant.DIST_TAU1, delta=1e-12)
        # Within the 12 V / 4 ohm stall current of 3.0 A, which is why the pulse is survivable.
        stall = submission.winding_current(V_BUS, 0.0, KT, R_OHM)
        self.assertAlmostEqual(stall, 3.0, delta=1e-12)
        self.assertLess(abs(current), stall)

    def test_the_plant_clamp_is_out_of_reach_of_a_12v_winding(self):
        stall = submission.winding_current(V_BUS, 0.0, KT, R_OHM)
        stall_torque = submission.motor_torque(KT, stall)
        self.assertAlmostEqual(stall_torque, 0.18, delta=1e-12)
        self.assertGreater(plant.TAU_LIMIT, 10.0 * stall_torque)
        # Reaching the 2.5 N*m clamp needs 2.5/0.06 = 41.667 A, 13.9x the stall current.
        self.assertAlmostEqual(plant.TAU_LIMIT / KT, 41.666666666666664, delta=1e-9)
        self.assertGreater(plant.TAU_LIMIT / KT / stall, 13.0)

    def test_back_emf_eats_the_12v_bus(self):
        # 3.0 A at stall, 1.5 A at 100 rad/s, 0 A at 200 rad/s: the same supply, three currents.
        currents = [submission.winding_current(V_BUS, w, KT, R_OHM) for w in (0.0, 100.0, 200.0)]
        self.assertAlmostEqual(currents[0], 3.0, delta=1e-12)
        self.assertAlmostEqual(currents[1], 1.5, delta=1e-12)
        self.assertAlmostEqual(currents[2], 0.0, delta=1e-12)
        self.assertGreater(currents[0], currents[1])
        self.assertGreater(currents[1], currents[2])

    def test_a_reversal_costs_the_quadrature_count_its_direction(self):
        forward = [0b00, 0b10, 0b11, 0b01]
        backward = list(reversed(forward))
        up = sum(submission.quad_step(a, b) for a, b in zip(forward, forward[1:]))
        down = sum(submission.quad_step(a, b) for a, b in zip(backward, backward[1:]))
        self.assertEqual((up, down), (3, -3))
        self.assertEqual(up + down, 0)


if __name__ == "__main__":
    unittest.main()
