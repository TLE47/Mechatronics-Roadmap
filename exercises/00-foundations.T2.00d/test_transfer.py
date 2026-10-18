"""Transfer tests for 00-foundations.T2.00d - the plant's commanded trajectory, read as phasors.

The figure-8 command is two sinusoids at two frequencies. Each channel is projected onto its own
excitation's sine and cosine (a lock-in, the same arithmetic a bench sweep does), which leaves a
pair of coefficients `(a, b)`; that pair *is* a complex number, and `to_polar` reads its amplitude
and phase. Nothing here uses the submission to produce the "measured" value - the measurement
comes from `plant.figure8_target`, the phasor form from the submission.
"""

import math
import unittest

import harness

submission = harness.load_submission()
plant = harness.plant


def project(samples, omega, dt):
    """(a, b) such that the signal is approximately a*sin(w t) + b*cos(w t)."""
    n = len(samples)
    a = 2.0 * sum(value * math.sin(omega * k * dt) for k, value in enumerate(samples)) / n
    b = 2.0 * sum(value * math.cos(omega * k * dt) for k, value in enumerate(samples)) / n
    return a, b


def x_channel(periods=1):
    omega = 2.0 * math.pi * plant.FREQ_HZ
    n = int(round(periods / (plant.FREQ_HZ * plant.DT))) * periods
    return omega, [plant.figure8_target(k * plant.DT)[0] - plant.X0 for k in range(n)]


def y_channel(periods=1):
    omega = 4.0 * math.pi * plant.FREQ_HZ
    n = int(round(periods / (2.0 * plant.FREQ_HZ * plant.DT))) * periods
    return omega, [plant.figure8_target(k * plant.DT)[1] - plant.Y0 for k in range(n)]


class Figure8PhasorTests(unittest.TestCase):
    def test_the_x_channel_fits_as_a_phasor_of_the_plants_own_amplitude(self):
        omega, samples = x_channel()
        a, b = project(samples, omega, plant.DT)
        mag, phase = submission.to_polar(complex(a, b))
        self.assertAlmostEqual(
            mag, plant.AX, delta=1e-9,
            msg="expected the projected x channel to have the figure-8's published amplitude; a "
                "smaller magnitude means the projection lost its phase - check the lock-in pair",
        )
        self.assertAlmostEqual(
            phase, 0.0, delta=1e-9,
            msg="expected the projected phasor to sit at zero phase, since it was projected onto "
                "its own excitation; a nonzero angle means a and b were swapped",
        )
        # Resynthesis through Euler's formula must give the samples back.
        rebuilt = [plant.X0 + mag * math.sin(omega * k * plant.DT + phase) for k in range(50)]
        for index, value in enumerate(rebuilt):
            self.assertAlmostEqual(
                value, plant.figure8_target(index * plant.DT)[0], delta=1e-9,
                msg="expected the phasor resynthesis to reproduce the plant's own target samples; "
                    "a mismatch means the polar pair does not describe the same signal - check "
                    "that sin and cos use the same omega",
            )

    def test_the_two_channels_add_like_phasors(self):
        omega_x, x_samples = x_channel()
        omega_y, y_samples = y_channel()
        x_mag, x_phase = submission.to_polar(complex(*project(x_samples, omega_x, plant.DT)))
        y_mag, y_phase = submission.to_polar(complex(*project(y_samples, omega_y, plant.DT)))
        self.assertAlmostEqual(
            x_mag, plant.AX, delta=1e-9,
            msg="expected the x channel's amplitude to be the figure-8's published AX; a smaller "
                "reading means the projection window is off by a sample - check x_channel",
        )
        self.assertAlmostEqual(
            y_mag, plant.AY, delta=1e-9,
            msg="expected the y channel's amplitude at twice the frequency to be the published "
                "AY; a mismatch means the harmonic was projected at the wrong omega",
        )
        total = submission.add_phasors(
            submission.to_rect(x_mag, x_phase), submission.to_rect(y_mag, y_phase)
        )
        # Two sinusoids at different frequencies do not add to a sinusoid, but their phasors still
        # obey the triangle inequality - the check that catches a magnitude-only sum.
        self.assertLessEqual(
            abs(total), plant.AX + plant.AY + 1e-12,
            msg="expected the phasor sum to obey the triangle inequality, staying inside AX + AY; "
                "a larger total means the magnitudes were added without their angles",
        )
        self.assertGreaterEqual(
            abs(total), abs(plant.AX - plant.AY) - 1e-12,
            msg="expected the phasor sum to stay above the difference of the two amplitudes; a "
                "smaller total means the phases were made to cancel - check the phasor addition",
        )


if __name__ == "__main__":
    unittest.main()
