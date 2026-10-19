"""Transfer tests for 00-foundations.T2.00f - the arm's elbow, sampled at two rates.

The claim is measured against the shared plant rather than restated: the elbow's damped mode is
faster than half of a 12 Hz controller's rate, so that controller folds it, while the capstone's
1 kHz tick is two orders of magnitude inside the limit and passes it untouched.
"""

import math
import unittest

import harness

submission = harness.load_submission()
plant = harness.plant

K_ELBOW = 8.0  # N*m/rad, the elbow stiffness the 00c and 00e packages use


def elbow_damped_hz():
    wn = math.sqrt(K_ELBOW / plant.I2)
    zeta = plant.B2 / (2.0 * math.sqrt(plant.I2 * K_ELBOW))
    return wn * math.sqrt(1.0 - zeta * zeta) / (2.0 * math.pi)


class AliasingAtTheJointTests(unittest.TestCase):
    def test_the_elbow_mode_aliases_below_a_slow_sample_rate(self):
        f_damped = elbow_damped_hz()
        self.assertGreater(
            f_damped,
            6.0,
            msg="expected the elbow's damped mode to sit above 6 Hz, which is why a 12 Hz "
                "controller cannot see it; a lower figure means the stiffness or the inertia was "
                "taken from the wrong joint",
        )
        self.assertAlmostEqual(
            submission.alias_hz(f_damped, 12.0),
            12.0 - f_damped,
            delta=1e-9,
            msg="expected the mode above Nyquist to fold to fs - f at a 12 Hz sample rate; the "
                "original frequency means no folding happened - check the comparison with fs/2",
        )
        self.assertAlmostEqual(
            submission.nyquist_hz(12.0),
            6.0,
            delta=1e-12,
            msg="expected a 12 Hz loop to represent only up to 6 Hz; a value of 12 means the "
                "rate was not halved - check the factor of two",
        )

    def test_the_capstone_tick_passes_the_mode_through(self):
        f_damped = elbow_damped_hz()
        self.assertAlmostEqual(
            submission.alias_hz(f_damped, 1000.0),
            f_damped,
            delta=1e-9,
            msg="expected the same mode to pass through unchanged at the capstone's 1 kHz tick, "
                "since it is two orders below Nyquist; a different value means the fold is "
                "applied unconditionally",
        )
        self.assertAlmostEqual(
            submission.alias_hz(f_damped, 1.0 / plant.DT),
            f_damped,
            delta=1e-9,
            msg="expected the plant's own tick rate (1/DT) to leave the mode untouched, so the "
                "transfer comparison is not an artefact of a loop that folds everything; a "
                "different value means fs was taken from the wrong constant",
        )


if __name__ == "__main__":
    unittest.main()
