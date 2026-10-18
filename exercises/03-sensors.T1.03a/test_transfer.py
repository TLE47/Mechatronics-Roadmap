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
        self.assertEqual(
            plant.ENCODER_BITS, 12,
            msg="expected the plant's AS5600 to ship 12 bits; a different width means every "
                "count-to-radian figure below is compared against the wrong scale",
        )
        self.assertEqual(
            plant.ENCODER_CPR, 2 ** plant.ENCODER_BITS,
            msg="expected the plant's counts per revolution to be exactly 2**bits; a mismatch "
                "means the encoder constant was edited without the bit width",
        )
        self.assertEqual(
            plant.ENCODER_CPR, 4096,
            msg="expected a 12-bit encoder to give 4096 counts; another figure means the count is "
                "stored as lines or as an angle - check the constant",
        )
        self.assertEqual(
            submission.quadrature_cpr(1024), plant.ENCODER_CPR,
            msg="expected 1024 lines at 4x decoding to land on the plant's own 4096 counts; a "
                "mismatch means the module and the plant disagree about 4x - check the factor",
        )

    def test_one_plant_count_is_the_resolution(self):
        radians, degrees = submission.angle_resolution(plant.ENCODER_CPR)
        self.assertAlmostEqual(
            radians, TAU / 4096.0, delta=1e-18,
            msg="expected one 4096-count step to be 1.534e-3 rad; a hundredth of that means the "
                "cpr arrived as lines - check 2 pi / cpr",
        )
        self.assertAlmostEqual(
            degrees, 360.0 / 4096.0, delta=1e-12,
            msg="expected the same step to be 0.0879 degrees; a different value means the "
                "radian-to-degree conversion used pi without the factor of two",
        )
        self.assertAlmostEqual(
            degrees * plant.ENCODER_CPR, 360.0, delta=1e-9,
            msg="expected 4096 counts of 0.0879 degrees to close a full turn; a total away from "
                "360 means the resolution and the count disagree",
        )

    def test_the_plant_tick_sees_many_counts_per_sample_at_speed(self):
        # One count per 1 ms tick is 2*pi/4096/0.001 = 1.5339807... rad/s - barely 14.6 RPM.
        per_tick_limit = submission.angle_resolution(plant.ENCODER_CPR)[0] / plant.DT
        self.assertAlmostEqual(
            per_tick_limit, 1.5339807878856412, delta=1e-9,
            msg="expected one count per 1 ms tick to be 1.534 rad/s, the slowest speed a "
                "single-step decoder can follow; a different figure means the resolution or DT "
                "changed - check 2 pi / (4096 DT)",
        )
        # At the worked example's 200 rad/s no-load speed the shaft passes ~130 counts per tick,
        # so a decoder that only accepts single-step edges has already lost the direction.
        counts_per_tick = 200.0 / TAU * plant.ENCODER_CPR * plant.DT
        self.assertGreater(
            counts_per_tick, 100.0,
            msg="expected 200 rad/s to move the shaft more than 100 counts per plant tick; a "
                "smaller figure means the counts-per-revolution or DT is wrong - check the product",
        )
        self.assertGreater(
            counts_per_tick, 80.0 * per_tick_limit,
            msg="expected the interesting speed to exceed the single-step limit by more than "
                "eighty times, which is why direction decoding must accept multi-bit jumps",
        )


class PlantAngleTests(unittest.TestCase):
    def test_the_plant_wrap_is_the_electrical_angle_at_one_pole_pair(self):
        for angle in (0.0, 1.0, -2.5, math.pi, -math.pi, 7.0):
            mine = submission.electrical_angle(angle, 1)
            theirs = plant.wrap_pi(angle) % TAU
            self.assertAlmostEqual(
                mine, theirs, delta=1e-12,
                msg="expected the module's one-pole-pair angle to name the same angle as the "
                    "plant's own wrap across the full list, including 7 rad and negative turns; "
                    "a mismatch means one of the two wraps is not modulo 2 pi - check both",
            )

    def test_a_seven_pole_pair_rotor_on_the_plant_shaft(self):
        # Half a mechanical turn through 7 pole pairs is exactly 7 electrical half-cycles, so the
        # wrapped angle is pi - and the plant's own 4096-count encoder spans that in 2048 counts.
        self.assertAlmostEqual(
            submission.electrical_angle(math.pi, 7), math.pi, delta=1e-12,
            msg="expected half a mechanical turn at 7 pole pairs to wrap to pi, an odd number of "
                "half-cycles; 0 means the seven cycles fell back on themselves - check the wrap",
        )
        self.assertEqual(
            plant.ENCODER_CPR // 2, 2048,
            msg="expected half of the plant's 4096 counts to be 2048, the span this half turn "
                "covers; another value means the encoder constant changed",
        )


class PlantActuatorTests(unittest.TestCase):
    def test_the_plant_disturbance_pulse_needs_two_and_a_half_amps(self):
        current = plant.DIST_TAU1 / KT
        self.assertAlmostEqual(
            current, -2.5, delta=1e-12,
            msg="expected the plant's -0.15 N*m pulse to need -2.5 A of braking current; a "
                "positive value means the disturbance sign was dropped - check DIST_TAU1",
        )
        self.assertAlmostEqual(
            submission.motor_torque(KT, current), plant.DIST_TAU1, delta=1e-12,
            msg="expected that 2.5 A at Kt = 0.06 to reproduce the pulse exactly; a mismatch "
                "means the torque constant is not the one the plant uses - check KT",
        )
        # Within the 12 V / 4 ohm stall current of 3.0 A, which is why the pulse is survivable.
        stall = submission.winding_current(V_BUS, 0.0, KT, R_OHM)
        self.assertAlmostEqual(
            stall, 3.0, delta=1e-12,
            msg="expected a 12 V bus across a 4 ohm winding to stall at 3.0 A; a lower figure "
                "means an EMF was subtracted at zero speed - check V / R",
        )
        self.assertLess(
            abs(current), stall,
            msg="expected the disturbance's 2.5 A to stay under the 3.0 A stall current, which "
                "is why the plant survives it; a larger demand means the pulse is out of reach",
        )

    def test_the_plant_clamp_is_out_of_reach_of_a_12v_winding(self):
        stall = submission.winding_current(V_BUS, 0.0, KT, R_OHM)
        stall_torque = submission.motor_torque(KT, stall)
        self.assertAlmostEqual(
            stall_torque, 0.18, delta=1e-12,
            msg="expected the 3.0 A stall current to yield only 0.18 N*m at this Kt; a larger "
                "value means the torque constant was scaled - check Kt x I",
        )
        self.assertGreater(
            plant.TAU_LIMIT, 10.0 * stall_torque,
            msg="expected the plant's 2.5 N*m clamp to sit more than ten times above what this "
                "winding can hold; a smaller ratio means the winding is stronger than the module "
                "claims - check the constants",
        )
        # Reaching the 2.5 N*m clamp needs 2.5/0.06 = 41.667 A, 13.9x the stall current.
        self.assertAlmostEqual(
            plant.TAU_LIMIT / KT, 41.666666666666664, delta=1e-9,
            msg="expected the 2.5 N*m clamp at Kt = 0.06 to need 41.67 A; a different figure "
                "means the clamp or the constant changed - check TAU_LIMIT / Kt",
        )
        self.assertGreater(
            plant.TAU_LIMIT / KT / stall, 13.0,
            msg="expected that demand to exceed the stall current by more than thirteen times, "
                "so the clamp is unreachable from this bus; a smaller ratio means the numbers "
                "were taken from a stronger winding",
        )

    def test_back_emf_eats_the_12v_bus(self):
        # 3.0 A at stall, 1.5 A at 100 rad/s, 0 A at 200 rad/s: the same supply, three currents.
        currents = [submission.winding_current(V_BUS, w, KT, R_OHM) for w in (0.0, 100.0, 200.0)]
        self.assertAlmostEqual(
            currents[0], 3.0, delta=1e-12,
            msg="expected a stalled 12 V winding to draw the full 3.0 A; a lower value means an "
                "EMF was subtracted at zero speed - check the stall case",
        )
        self.assertAlmostEqual(
            currents[1], 1.5, delta=1e-12,
            msg="expected 100 rad/s to halve the current to 1.5 A, since the EMF takes half the "
                "bus; a larger value means the EMF was not scaled by the speed",
        )
        self.assertAlmostEqual(
            currents[2], 0.0, delta=1e-12,
            msg="expected the no-load speed to draw nothing at all; a nonzero value means the "
                "EMF and the supply do not cancel exactly - check V / Ke",
        )
        self.assertGreater(
            currents[0], currents[1],
            msg="expected the stall current to exceed the running current, so the winding heats "
                "most when held; an inversion means the EMF sign was flipped",
        )
        self.assertGreater(
            currents[1], currents[2],
            msg="expected current to keep falling with speed up to the no-load point; an "
                "inversion means the back-EMF term adds instead of subtracting",
        )

    def test_a_reversal_costs_the_quadrature_count_its_direction(self):
        forward = [0b00, 0b10, 0b11, 0b01]
        backward = list(reversed(forward))
        up = sum(submission.quad_step(a, b) for a, b in zip(forward, forward[1:]))
        down = sum(submission.quad_step(a, b) for a, b in zip(backward, backward[1:]))
        self.assertEqual(
            (up, down), (3, -3),
            msg="expected the three-edge forward sweep to count +3 and the reversed sweep -3; "
                "another pair means the transition table or the direction sign is wrong - check "
                "the single-bit edges",
        )
        self.assertEqual(
            up + down, 0,
            msg="expected the reversal to cancel the count exactly, the property a real encoder "
                "has; a nonzero sum means the decoder counts up and down asymmetrically",
        )


if __name__ == "__main__":
    unittest.main()
