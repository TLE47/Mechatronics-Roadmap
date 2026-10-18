"""Transfer tests for 00-foundations.T2.00h - measure the Bode plot on the plant itself.

The elbow joint is driven with a sine torque reference and the response is read back by projecting
the position onto the excitation's sine and cosine - a lock-in measurement, the same thing a bench
sine-sweep does. Nothing here reuses the submission's transfer function to produce the "measured"
number: the measurement comes from `plant.step_arm`, the prediction from the submission.

The plant's own viscous damping `plant.B2` is part of the damping, so `b_command` is what is left
for the PD law after the plant's share.
"""

import math
import unittest

import harness

submission = harness.load_submission()
plant = harness.plant


def elbow_setup(zeta, k=8.0):
    j = plant.I2
    wn = math.sqrt(k / j)
    b_total = 2.0 * zeta * math.sqrt(j * k)
    return j, wn, b_total, b_total - plant.B2


def measure(wn, zeta, omega, cycles=20, dt=2e-5):
    """Gain and phase (degrees) of the plant's elbow at `omega`, by sine/cosine projection."""
    j, _, _, b_command = elbow_setup(zeta)
    k = 8.0
    period = 2.0 * math.pi / omega
    steps = int((cycles + 3) * period / dt)
    skip = steps - int(cycles * period / dt)
    state = (0.0, 0.0, 0.0, 0.0)
    sum_th_sin = 0.0
    sum_th_cos = 0.0
    t = 0.0
    used = 0
    for n in range(steps):
        reference = math.sin(omega * t)
        tau2 = k * (reference - state[1]) - b_command * state[3]
        state = plant.step_arm(state, (0.0, tau2), dt=dt, gravity=False)
        t += dt
        if n >= skip:
            sum_th_sin += state[1] * reference
            sum_th_cos += state[1] * math.cos(omega * t)
            used += 1
    a = 2.0 * sum_th_sin / used
    b = 2.0 * sum_th_cos / used
    return math.hypot(a, b), math.degrees(math.atan2(b, a))


class PlantBodeTests(unittest.TestCase):
    def test_gain_and_phase_follow_the_transfer_function(self):
        zeta = 0.35
        _, wn, b_total, _ = elbow_setup(zeta)
        for ratio in (0.5, 1.0, 1.5):
            omega = ratio * wn
            predicted = submission.second_order_response(wn, zeta, omega)
            mag, phase = measure(wn, zeta, omega)
            self.assertAlmostEqual(mag, abs(predicted), delta=0.02 * abs(predicted))
            self.assertAlmostEqual(phase, submission.phase_deg(predicted), delta=1.5)

    def test_the_peak_is_where_the_formula_says(self):
        zeta = 0.2
        _, wn, _, _ = elbow_setup(zeta)
        omega_r, peak = submission.resonance_peak(wn, zeta)
        at_peak, _ = measure(wn, zeta, omega_r)
        at_natural, _ = measure(wn, zeta, wn)
        self.assertAlmostEqual(at_peak, peak, delta=0.03 * peak)
        self.assertGreater(at_peak, at_natural + 0.05,
                           "the peak must sit below wn for zeta < 1/sqrt(2)")


class WindingImpedanceTests(unittest.TestCase):
    def test_the_winding_impedance_is_the_ratio_the_motor_sees(self):
        # A 3 ohm, 4 mH winding at 1 krad/s is 3 + j4, i.e. 5 ohms at +53.13 degrees. Those are
        # the numbers the current loop's PI gains are tuned against.
        z = submission.impedance_rl(3.0, 0.004, 1000.0)
        self.assertAlmostEqual(abs(z), 5.0, delta=1e-9)
        self.assertAlmostEqual(submission.phase_deg(z), 53.13010235415598, delta=1e-9)
        # At a frequency where the reactance equals the resistance, the current lags by 45 degrees.
        z45 = submission.impedance_rl(plant.B2 * 1000.0, plant.B2, 1000.0)
        self.assertAlmostEqual(submission.phase_deg(z45), 45.0, delta=1e-9)


if __name__ == "__main__":
    unittest.main()
