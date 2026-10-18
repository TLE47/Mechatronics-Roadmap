"""Transfer tests for 04-embedded.T3.04a - the plant's own tick, seen through the same laws.

Three claims, measured on the shared plant:
  1. the 40 kHz carrier the module is written for is exactly 40 PWM periods inside one 1 ms plant
     tick, so the ISR that reads the ADC at the triangle peak runs 40 times per control step;
  2. at the plant's own 1 kHz rate the same register arithmetic gives ARR = 85 000 and a 119.5 us
     low-side window - four orders of magnitude more room than the 25 us carrier leaves;
  3. the module's Q1.31 word maps the plant's 2.5 N*m clamp (over a 10 N*m full scale) to 2^29,
     and its sequence check leaves an even counter after a whole second of 1 kHz writes.
"""

import unittest

import harness

submission = harness.load_submission()
plant = harness.plant


def ticks_per_second():
    """The plant integrates at DT s per tick, so one second is 1/DT of them."""
    return int(round(1.0 / plant.DT))


class CarrierAgainstThePlantTickTests(unittest.TestCase):
    def test_the_control_tick_holds_forty_carrier_periods(self):
        carrier = submission.pwm_frequency(170_000_000.0, 2125)
        self.assertAlmostEqual(
            carrier, 40_000.0, delta=1e-6,
            msg="expected 170 MHz over twice 2125 to be the module's 40 kHz carrier; 20 kHz means "
                "the centre-aligned factor of two was dropped - check the register arithmetic",
        )
        self.assertAlmostEqual(
            carrier / (1.0 / plant.DT), 40.0, delta=1e-9,
            msg="expected the 40 kHz carrier to fit exactly forty times inside the plant's 1 ms "
                "tick; another count means the ISR would sample the triangle peak at a different "
                "rate than the module claims - check plant.DT",
        )

    def test_the_register_at_the_plants_control_rate(self):
        # 170 MHz / (2 * 1 kHz) = 85 000 ticks per 1 ms frame.
        self.assertEqual(
            submission.center_aligned_arr(170_000_000.0, 1.0 / plant.DT), 85_000,
            msg="expected the same 170 MHz clock at 1 kHz to give ARR = 85000 counts per frame; "
                "2125 means the 40 kHz carrier's register was returned instead of the plant "
                "rate's - check which frequency was passed",
        )

    def test_the_low_side_window_at_the_plants_control_rate(self):
        # 0.12 * 1 000 000 ns - 500 ns = 119 500 ns, 4.78x the whole 25 us carrier period.
        window = submission.low_side_window_ns(0.88, 250.0, 1.0 / plant.DT)
        self.assertAlmostEqual(
            window, 119_500.0, delta=1e-6,
            msg="expected a 12 percent low-side window at 1 kHz to leave 119500 ns after the "
                "250 ns dead time on each edge; 29500 means the 40 kHz period was used instead "
                "of the plant's frame - check the frequency argument",
        )
        self.assertAlmostEqual(
            window / 25_000.0, 4.78, delta=1e-12,
            msg="expected that window to be 4.78 entire 25 us carrier periods wide, the room the "
                "low-side shunt measurement needs; a value near 1 means the window was computed "
                "for the fast carrier rather than the slow frame",
        )

    def test_the_isr_share_of_a_plant_tick(self):
        # A 3 us WCET on the plant's 1 ms tick is 0.3% of the CPU, not 12% of a 25 us carrier.
        percent = submission.isr_cpu_percent(3.0, plant.DT * 1e6)
        self.assertAlmostEqual(
            percent, 0.3, delta=1e-12,
            msg="expected a 3 us ISR on a 1000 us tick to cost 0.3 percent of the CPU; 12 means "
                "the share was computed against the 25 us carrier period - check the period "
                "argument is the control tick",
        )


class Q31OnThePlantTests(unittest.TestCase):
    def test_the_torque_clamp_over_a_ten_newton_metre_scale(self):
        # 2.5 / 10 = 0.25, and 0.25 * 2^31 = 2^29.
        word = submission.q31_encode(plant.TAU_LIMIT / 10.0)
        self.assertEqual(
            word, 536870912,
            msg="expected a quarter of full scale to encode as 2^29 = 536870912; 1073741824 means "
                "the scale was treated as unity - check the 2.5 over 10 ratio",
        )
        self.assertAlmostEqual(
            submission.q31_decode(word) * 10.0, plant.TAU_LIMIT, delta=1e-12,
            msg="expected decoding that word back over the same 10 N*m scale to return the "
                "plant's 2.5 N*m clamp; a mismatch means encode and decode use different scales "
                "- check both take the same full-scale value",
        )

    def test_the_commanded_direction_is_the_other_sign_bit(self):
        word = submission.q31_encode(-plant.TAU_LIMIT / 10.0)
        self.assertEqual(
            word, -536870912,
            msg="expected the reversed command to encode as -2^29, the same magnitude with the "
                "sign bit flipped; a positive value means the encoder took an absolute value and "
                "the motor would always drive one way",
        )
        self.assertAlmostEqual(
            submission.q31_decode(word) * 10.0, -plant.TAU_LIMIT, delta=1e-12,
            msg="expected the negative word to decode back to -2.5 N*m; a positive result means "
                "the sign was lost in the decode rather than the encode",
        )


class SequenceCounterOnThePlantTests(unittest.TestCase):
    def test_a_second_of_writes_leaves_an_even_counter(self):
        seq = 2 * ticks_per_second()
        self.assertEqual(
            seq, 2000,
            msg="expected a second of 1 kHz writes at two increments each to leave the sequence "
                "counter at 2000; 1000 means the counter is incremented once per write, which "
                "breaks the even-before/odd-during convention",
        )
        self.assertTrue(
            submission.seqlock_valid(seq, seq),
            msg="expected an even counter read twice to be a valid window, since no writer is "
                "mid-update; False means the validity test rejects every even pair",
        )
        self.assertTrue(
            submission.seqlock_valid(seq, seq + 2) is False,
            msg="expected a reader that saw the counter move by two to be told to retry, since "
                "the writer wrapped a whole cycle underneath it; a True result means torn reads "
                "would be accepted as consistent",
        )

    def test_a_reader_caught_by_the_last_tick_retries(self):
        seq = 2 * ticks_per_second()
        self.assertFalse(
            submission.seqlock_valid(seq, seq + 2),
            msg="expected the same start and end counter to fail whenever the pair differs, "
                "whatever the parity; True means only the parity is checked and a moving counter "
                "slips through",
        )
        self.assertFalse(
            submission.seqlock_valid(seq + 1, seq + 1),
            msg="expected a read taken while the writer held the counter odd to be rejected even "
                "though it did not move; True means the odd-during-update guard is missing",
        )


if __name__ == "__main__":
    unittest.main()
