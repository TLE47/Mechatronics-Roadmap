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
        self.assertAlmostEqual(mag, plant.AX, delta=1e-9)
        self.assertAlmostEqual(phase, 0.0, delta=1e-9)
        # Resynthesis through Euler's formula must give the samples back.
        rebuilt = [plant.X0 + mag * math.sin(omega * k * plant.DT + phase) for k in range(50)]
        for index, value in enumerate(rebuilt):
            self.assertAlmostEqual(value, plant.figure8_target(index * plant.DT)[0], delta=1e-9)

    def test_the_two_channels_add_like_phasors(self):
        omega_x, x_samples = x_channel()
        omega_y, y_samples = y_channel()
        x_mag, x_phase = submission.to_polar(complex(*project(x_samples, omega_x, plant.DT)))
        y_mag, y_phase = submission.to_polar(complex(*project(y_samples, omega_y, plant.DT)))
        self.assertAlmostEqual(x_mag, plant.AX, delta=1e-9)
        self.assertAlmostEqual(y_mag, plant.AY, delta=1e-9)
        total = submission.add_phasors(
            submission.to_rect(x_mag, x_phase), submission.to_rect(y_mag, y_phase)
        )
        # Two sinusoids at different frequencies do not add to a sinusoid, but their phasors still
        # obey the triangle inequality - the check that catches a magnitude-only sum.
        self.assertLessEqual(abs(total), plant.AX + plant.AY + 1e-12)
        self.assertGreaterEqual(abs(total), abs(plant.AX - plant.AY) - 1e-12)


if __name__ == "__main__":
    unittest.main()
