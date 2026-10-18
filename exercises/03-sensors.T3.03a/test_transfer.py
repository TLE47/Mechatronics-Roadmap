"""Transfer tests for 03-sensors.T3.03a - the same laws on the plant's own numbers.

Three claims, all against `resources/plants/mechalab_plant.py`:

  1. the plant's 12-bit encoder is exact at its own count centres, so the Fourier fit must report
     zero eccentricity on an ideal encoder - it cannot invent error out of quantisation;
  2. one count is the fit's resolution: 2*pi/4096 = 0.00153398 rad, and a 0.012 rad eccentricity
     is 7.8 counts, so the encoder cannot hide it and the fitted coefficient removes it;
  3. the fit stays orthogonal at plant resolution - a 2nd harmonic leaks nothing into the 1st -
     and the 25 kHz FOC loop the module drives executes 25 updates inside one plant tick.
"""

import math
import unittest

import harness
import mechalab_plant as plant  # noqa: E402  (harness put the plant directory on sys.path)

submission = harness.load_submission()

TURN = 2.0 * math.pi
ONE_COUNT = TURN / plant.ENCODER_CPR  # 2*pi/4096 = 0.0015339807878856412 rad
ANGLES = [TURN * k / plant.ENCODER_CPR for k in range(plant.ENCODER_CPR)]


class PlantEncoderTests(unittest.TestCase):
    def test_the_plant_encoder_is_exact_at_its_own_counts(self):
        # The ideal encoder reports the count it was given, so the measured error is zero and the
        # fit must say so: a first harmonic that is not zero would be invented, not measured.
        errors = [plant.quantize_angle(angle) - angle for angle in ANGLES]
        self.assertLess(
            max(abs(error) for error in errors), 1e-12,
            msg="expected the plant's ideal encoder to be exact at each of its own 4096 count "
                "centres; a larger residue means the quantiser rounds to the wrong centre - "
                "check the count grid against the half-count",
        )
        a1, b1 = submission.harmonic_coefficients(errors, 1)
        self.assertLess(
            abs(a1), 1e-12,
            msg="expected the fit's cosine coefficient to be zero on a perfect encoder, since "
                "there is no error to fit; a nonzero value means the fit invents a harmonic - "
                "check the normalisation 2/N",
        )
        self.assertLess(
            abs(b1), 1e-12,
            msg="expected the fit's sine coefficient to vanish on the same ideal data; a nonzero "
                "value of the same size as a1 would mean the fit returns a constant - check the "
                "phase of the basis functions",
        )

    def test_one_count_is_the_fit_resolution(self):
        # A one-count eccentricity at the plant's 4096 cpr: the fit returns exactly 2*pi/4096 rad.
        errors = [ONE_COUNT * math.cos(angle) for angle in ANGLES]
        a1, b1 = submission.harmonic_coefficients(errors, 1)
        self.assertAlmostEqual(
            a1, ONE_COUNT, delta=1e-12,
            msg="expected a one-count cosine ripple to fit back to exactly 2 pi / 4096 rad; a "
                "value of half that means the 2/N factor was dropped - check the normalisation",
        )
        self.assertAlmostEqual(
            a1, 0.0015339807878856412, delta=1e-12,
            msg="expected that coefficient to be 1.53398e-3 rad, the plant's own count; a "
                "different number means the encoder count used here is not the plant's - check "
                "ENCODER_CPR",
        )
        self.assertLess(
            abs(b1), 1e-12,
            msg="expected a pure cosine ripple to leave no sine term; a b1 comparable to a1 means "
                "the fit mixed the two phases because the sample grid is not uniform - check the "
                "angle step",
        )

    def test_a_twelve_bit_encoder_cannot_hide_the_eccentricity(self):
        # The module's 0.012 rad of first-harmonic error is 7.82 counts, and one fitted term
        # cancels it to machine precision.
        counts = 0.012 / ONE_COUNT
        self.assertGreater(
            counts, 7.0,
            msg="expected the module's 0.012 rad eccentricity to span more than seven encoder "
                "counts; a smaller figure means ONE_COUNT was taken as something finer - check "
                "the division",
        )
        self.assertLess(
            counts, 8.0,
            msg="expected that eccentricity to span fewer than eight counts, 7.82 at 4096 cpr; a "
                "larger figure means the encoder count was mis-set, so the resolution claim in "
                "the module would be wrong",
        )
        errors = [0.012 * math.cos(angle) for angle in ANGLES]
        a1, _b1 = submission.harmonic_coefficients(errors, 1)
        residual = max(abs(0.012 * math.cos(angle) - a1 * math.cos(angle)) for angle in ANGLES)
        self.assertLess(
            residual, 1e-15,
            msg="expected one fitted harmonic to cancel the 0.012 rad error to machine precision; "
                "a larger leftover means the coefficient is off by a fraction, so the correction "
                "table would leave a visible wobble - check a1 first",
        )

    def test_the_second_harmonic_is_orthogonal_at_plant_resolution(self):
        errors = [0.005 * math.sin(2.0 * angle) for angle in ANGLES]
        a1, b1 = submission.harmonic_coefficients(errors, 1)
        a2, b2 = submission.harmonic_coefficients(errors, 2)
        self.assertLess(
            abs(a1), 1e-12,
            msg="expected a pure 2nd harmonic to leave no first-harmonic cosine term, the "
                "orthogonality the module relies on; a nonzero value means the basis functions "
                "are not orthogonal at this sample count - check the harmonic factor",
        )
        self.assertLess(
            abs(b1), 1e-12,
            msg="expected the same 2nd harmonic to leave no first-harmonic sine term; leakage "
                "here means the fit mixes harmonic orders and the encoder table would over-"
                "correct",
        )
        self.assertLess(
            abs(a2), 1e-12,
            msg="expected a pure sine 2nd harmonic to have no cosine coefficient of its own; a "
                "nonzero a2 means the fit rotated the phase by a quarter cycle - check which "
                "basis function each coefficient multiplies",
        )
        self.assertAlmostEqual(
            b2, 0.005, delta=1e-12,
            msg="expected the 2nd-harmonic sine coefficient to recover the 0.005 rad amplitude "
                "that was fed in; a mismatch means the fit scaled by 2/N twice or not at all",
        )

    def test_two_counts_of_ripple_at_plant_resolution(self):
        # A ripple of two counts is 0.00306796 rad - below the module's 0.012 rad concern, but the
        # fit still has to resolve it, and the leftover after correction is under one count.
        amplitude = 2.0 * ONE_COUNT
        errors = [amplitude * math.cos(angle) for angle in ANGLES]
        a1, _b1 = submission.harmonic_coefficients(errors, 1)
        self.assertAlmostEqual(
            a1, 0.0030679615757712825, delta=1e-12,
            msg="expected a two-count ripple to fit back to 3.06796e-3 rad, exactly two encoder "
                "counts; a value near 1.534e-3 means the amplitude was halved - check the input",
        )
        residual = max(abs(amplitude * math.cos(angle) - a1 * math.cos(angle)) for angle in ANGLES)
        self.assertLess(
            residual, ONE_COUNT,
            msg="expected the corrected ripple to leave under one encoder count of residue, which "
                "is the best a 4096-count table can promise; a larger leftover means the fit is "
                "not removing the term it measured",
        )


class PlantTimingTests(unittest.TestCase):
    def test_the_plant_tick_holds_twenty_five_foc_periods(self):
        # Tab 3's 25 kHz loop against the plant's 1 ms tick: 25 updates per tick, 40 us each.
        pwm_hz = 25000.0
        self.assertAlmostEqual(
            plant.DT * pwm_hz, 25.0, delta=1e-12,
            msg="expected the plant's 1 ms tick to hold exactly 25 periods of the module's 25 kHz "
                "FOC loop; a different count means the tick or the PWM rate is not the one the "
                "module states",
        )
        self.assertAlmostEqual(
            1.0 / pwm_hz, 40e-6, delta=1e-15,
            msg="expected that loop's period to be 40 us; a value 1000 times smaller means the "
                "period was left in milliseconds - check the units",
        )

    def test_the_hexagon_limit_holds_all_the_way_round(self):
        # At V_bus/sqrt(3) every leg stays on its rail at every electrical angle the plant's
        # encoder resolves, and the line-to-line voltage is unchanged by the offset.
        limit = submission.hexagon_limit(48.0)
        for k in range(0, plant.ENCODER_CPR, 64):
            theta = TURN * k / plant.ENCODER_CPR
            va = limit * math.cos(theta)
            vb = limit * math.cos(theta - TURN / 3.0)
            vc = limit * math.cos(theta + TURN / 3.0)
            duties = submission.svpwm_duties(va, vb, vc, 48.0)
            for duty in duties:
                self.assertGreaterEqual(
                    duty, -1e-9,
                    msg="expected every duty to stay at or above zero at every angle the encoder "
                        "resolves on this 48 V bus; a negative duty means the zero-sequence "
                        "offset pushed a leg below its rail - check the Min-Max term",
                )
                self.assertLessEqual(
                    duty, 1.0 + 1e-9,
                    msg="expected every duty to stay at or below one on the same sweep; a duty "
                        "above one means the reference left the hexagon and the module's radial "
                        "scale would be needed instead",
                )
            self.assertAlmostEqual(
                duties[0] - duties[1], (va - vb) / 48.0, delta=1e-12,
                msg="expected the line-to-line duty difference to equal the line-to-line "
                    "reference over the bus, since the common-mode term must cancel exactly; a "
                    "mismatch means the offset entered the difference - check it is added to all "
                    "three legs",
            )


if __name__ == "__main__":
    unittest.main()
