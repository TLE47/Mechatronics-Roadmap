#!/usr/bin/env python3
"""Lab 03: Sensor Metrology (Allan Deviation, Encoder LUT) & 25 kHz Closed-Loop FOC Drive.

Zero-external-dependency pure Python 3 reference simulation & unit test suite.
Exit-code family: typed (0 = all checks pass, 1 = test failure, 2 = usage error).
"""

from __future__ import annotations

import argparse
import json
import math
import random
import sys
import unittest


# =============================================================================
# 1. Overlapping Allan Deviation & Encoder Harmonic Calibration LUT + PLL
# =============================================================================

def overlapping_allan_deviation(rate_samples: list[float], dt: float, m_cluster: int) -> float:
    """Compute Overlapping Allan Deviation sigma_A(tau = m * dt) directly from rate samples."""
    n = len(rate_samples)
    tau = m_cluster * dt
    # Prefix sum of rate samples to form cluster averages in O(N)
    prefix = [0.0] * (n + 1)
    for i, val in enumerate(rate_samples):
        prefix[i + 1] = prefix[i] + val * dt  # integrated angle theta_i

    diffs_sq = 0.0
    count = n - 2 * m_cluster + 1
    for k in range(count):
        term = prefix[k + 2 * m_cluster] - 2.0 * prefix[k + m_cluster] + prefix[k]
        diffs_sq += term * term

    variance = diffs_sq / (2.0 * (tau * tau) * count)
    return math.sqrt(variance)


class MagneticEncoderCalibrator:
    """Calibrates 1x and 2x spatial eccentricity/dipole harmonics via Fourier LUT."""

    def __init__(self, e1_rad: float = 0.0085, e2_rad: float = -0.0042) -> None:
        self.e1_rad = e1_rad
        self.e2_rad = e2_rad
        self.a1 = 0.0
        self.b1 = 0.0
        self.a2 = 0.0
        self.b2 = 0.0

    def raw_reading(self, true_theta: float) -> float:
        return true_theta + self.e1_rad * math.sin(true_theta + 0.3) + self.e2_rad * math.cos(2.0 * true_theta - 0.2)

    def calibrate_sweep(self, n_points: int = 256) -> None:
        a1 = b1 = a2 = b2 = 0.0
        for k in range(n_points):
            th_true = 2.0 * math.pi * k / n_points
            th_raw = self.raw_reading(th_true)
            err = th_raw - th_true
            a1 += err * math.cos(th_raw)
            b1 += err * math.sin(th_raw)
            a2 += err * math.cos(2.0 * th_raw)
            b2 += err * math.sin(2.0 * th_raw)
        scale = 2.0 / n_points
        self.a1, self.b1, self.a2, self.b2 = a1 * scale, b1 * scale, a2 * scale, b2 * scale

    def compensated_reading(self, th_raw: float) -> float:
        corr = (
            self.a1 * math.cos(th_raw)
            + self.b1 * math.sin(th_raw)
            + self.a2 * math.cos(2.0 * th_raw)
            + self.b2 * math.sin(2.0 * th_raw)
        )
        return th_raw - corr


class TypeIIAngleTrackingPLL:
    """Zero-lag velocity & angle tracking observer on SO(2)."""

    def __init__(self, bandwidth_hz: float = 400.0, zeta: float = 0.85) -> None:
        wn = 2.0 * math.pi * bandwidth_hz
        self.kp = 2.0 * zeta * wn
        self.ki = wn * wn
        self.theta_hat = 0.0
        self.omega_hat = 0.0

    def step(self, theta_meas: float, dt: float) -> tuple[float, float]:
        err = math.atan2(math.sin(theta_meas - self.theta_hat), math.cos(theta_meas - self.theta_hat))
        self.omega_hat += self.ki * err * dt
        self.theta_hat += (self.omega_hat + self.kp * err) * dt
        return self.theta_hat, self.omega_hat


# =============================================================================
# 2. Complete 25 kHz Field-Oriented Control (FOC) + SVPWM + Anticogging Simulation
# =============================================================================

def clarke_transform(ia: float, ib: float) -> tuple[float, float]:
    i_alpha = ia
    i_beta = (ia + 2.0 * ib) / math.sqrt(3.0)
    return (i_alpha, i_beta)


def park_transform(i_alpha: float, i_beta: float, theta_e: float) -> tuple[float, float]:
    c, s = math.cos(theta_e), math.sin(theta_e)
    return (c * i_alpha + s * i_beta, -s * i_alpha + c * i_beta)


def inv_park_transform(vd: float, vq: float, theta_e: float) -> tuple[float, float]:
    c, s = math.cos(theta_e), math.sin(theta_e)
    return (c * vd - s * vq, s * vd + c * vq)


def svpwm_minmax(v_alpha: float, v_beta: float, v_bus: float) -> tuple[float, float, float]:
    """Min-Max Zero-Sequence Injected Space Vector PWM duty cycles in [0, 1]."""
    va = v_alpha
    vb = -0.5 * v_alpha + (math.sqrt(3.0) * 0.5) * v_beta
    vc = -0.5 * v_alpha - (math.sqrt(3.0) * 0.5) * v_beta
    v_off = -0.5 * (max(va, vb, vc) + min(va, vb, vc))
    da = max(0.0, min(1.0, 0.5 + (va + v_off) / v_bus))
    db = max(0.0, min(1.0, 0.5 + (vb + v_off) / v_bus))
    dc = max(0.0, min(1.0, 0.5 + (vc + v_off) / v_bus))
    return (da, db, dc)


class PMSMDriveSimulation:
    """Simulates a 3-phase PMSM driven by a 25 kHz decoupled d-q PI FOC controller."""

    def __init__(
        self,
        r_s: float = 0.25,
        l_d: float = 0.12e-3,
        l_q: float = 0.12e-3,
        lambda_pm: float = 0.008,
        n_poles: int = 7,
        v_bus: float = 48.0,
        f_bw_hz: float = 2500.0,
    ) -> None:
        self.r_s = r_s
        self.l_d = l_d
        self.l_q = l_q
        self.lambda_pm = lambda_pm
        self.n_poles = n_poles
        self.v_bus = v_bus

        w_bw = 2.0 * math.pi * f_bw_hz
        # Exact pole-zero cancellation PI gains
        self.kp_d = l_d * w_bw
        self.ki_d = r_s * w_bw
        self.kp_q = l_q * w_bw
        self.ki_q = r_s * w_bw

        self.int_d = 0.0
        self.int_q = 0.0
        self.id = 0.0
        self.iq = 0.0

    def step_current_loop(
        self, id_ref: float, iq_ref: float, omega_m: float, dt: float
    ) -> tuple[float, float]:
        omega_e = self.n_poles * omega_m
        err_d = id_ref - self.id
        err_q = iq_ref - self.iq

        self.int_d += self.ki_d * err_d * dt
        self.int_q += self.ki_q * err_q * dt

        # PI + Cross-coupling & Back-EMF decoupling feedforward
        vd_cmd = self.kp_d * err_d + self.int_d - omega_e * self.l_q * self.iq
        vq_cmd = self.kp_q * err_q + self.int_q + omega_e * (self.l_d * self.id + self.lambda_pm)

        # Circular SVPWM voltage saturation with d-axis priority
        v_max = self.v_bus / math.sqrt(3.0)
        vd_sat = max(-v_max, min(v_max, vd_cmd))
        vq_limit = math.sqrt(max(0.0, v_max * v_max - vd_sat * vd_sat))
        vq_sat = max(-vq_limit, min(vq_limit, vq_cmd))

        # Sub-step plant ODE (4 substeps per 40 us PWM period)
        sub_dt = dt * 0.25
        for _ in range(4):
            did = (vd_sat - self.r_s * self.id + omega_e * self.l_q * self.iq) / self.l_d
            diq = (vq_sat - self.r_s * self.iq - omega_e * (self.l_d * self.id + self.lambda_pm)) / self.l_q
            self.id += did * sub_dt
            self.iq += diq * sub_dt

        return self.id, self.iq


# =============================================================================
# 3. Unit Test Suite (Verifies Track 03 Milestone Gate)
# =============================================================================

class TestLab03SensorsAndFOC(unittest.TestCase):
    def test_encoder_harmonic_calibration_inl(self) -> None:
        enc = MagneticEncoderCalibrator(e1_rad=0.0085, e2_rad=-0.0042)
        enc.calibrate_sweep(n_points=256)

        max_uncal_deg = 0.0
        max_cal_deg = 0.0
        for k in range(360):
            th_true = math.radians(k)
            th_raw = enc.raw_reading(th_true)
            th_cal = enc.compensated_reading(th_raw)
            max_uncal_deg = max(max_uncal_deg, abs(math.degrees(th_raw - th_true)))
            max_cal_deg = max(max_cal_deg, abs(math.degrees(th_cal - th_true)))

        self.assertGreater(max_uncal_deg, 0.5)
        self.assertLess(max_cal_deg, 0.04)  # Gate: < 0.04 deg peak error

    def test_allan_deviation_white_noise_extraction(self) -> None:
        rng = random.Random(1234)
        dt = 0.01  # 100 Hz IMU log
        n_true = 0.02  # White noise density = 0.02 rad/s/sqrt(Hz)
        sigma_sample = n_true / math.sqrt(dt)
        samples = [rng.gauss(0.0, sigma_sample) for _ in range(20000)]

        # At tau = 1.0 s (m_cluster = 100), sigma_A(1.0) should match n_true within 8%
        sigma_tau_1s = overlapping_allan_deviation(samples, dt=dt, m_cluster=100)
        self.assertLess(abs(sigma_tau_1s - n_true) / n_true, 0.08)

    def test_foc_step_response_bandwidth_and_decoupling(self) -> None:
        foc = PMSMDriveSimulation(f_bw_hz=2500.0)
        dt = 40.0e-6  # 25 kHz FOC loop
        omega_m = 2000.0 * (2.0 * math.pi / 60.0)  # 2,000 RPM

        rise_90_step = None
        max_id_cross_coupling = 0.0
        max_iq = 0.0

        for step in range(1, 100):
            id_val, iq_val = foc.step_current_loop(id_ref=0.0, iq_ref=5.0, omega_m=omega_m, dt=dt)
            max_id_cross_coupling = max(max_id_cross_coupling, abs(id_val))
            max_iq = max(max_iq, iq_val)
            if rise_90_step is None and iq_val >= 4.5:
                rise_90_step = step

        self.assertIsNotNone(rise_90_step)
        rise_time_us = (rise_90_step or 999) * 40.0
        # Gate: 90% rise time <= 180 us, overshoot < 4%, |i_d| perturbation < 0.15 A
        self.assertLessEqual(rise_time_us, 180.0)
        self.assertLess(max_iq, 5.0 * 1.04)
        self.assertLess(max_id_cross_coupling, 0.15)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Lab 03 Reference Simulation & Unit Tests.\nExit-code family: typed."
    )
    parser.add_argument("--json", action="store_true", help="Output JSON summary")
    args = parser.parse_args(argv)

    suite = unittest.defaultTestLoader.loadTestsFromTestCase(TestLab03SensorsAndFOC)
    stream = sys.stderr if args.json else sys.stdout
    runner = unittest.TextTestRunner(stream=stream, verbosity=2 if not args.json else 0)
    result = runner.run(suite)

    summary = {
        "lab": "03-sensors-and-actuators",
        "ok": result.wasSuccessful(),
        "tests_run": result.testsRun,
    }
    if args.json:
        sys.stdout.write(json.dumps(summary) + "\n")
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    sys.exit(main())
