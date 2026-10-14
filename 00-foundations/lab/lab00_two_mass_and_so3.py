#!/usr/bin/env python3
"""Lab 00: Multi-Domain Two-Mass Resonant Actuator, SO(3) Lie Group & Notch Filter.

Zero-external-dependency pure Python 3 reference simulation & unit test suite.
Exit-code family: typed (0 = all checks pass, 1 = test failure, 2 = usage error).
"""

from __future__ import annotations

import argparse
import cmath
import json
import math
import struct
import sys
import unittest
from typing import Callable

Vec3 = tuple[float, float, float]
Mat3 = tuple[Vec3, Vec3, Vec3]
Vec4 = tuple[float, float, float, float]
Mat4 = tuple[Vec4, Vec4, Vec4, Vec4]


def f32(val: float) -> float:
    """Quantize a Python float64 to exact IEEE-754 single-precision float32."""
    return struct.unpack("<f", struct.pack("<f", val))[0]


# =============================================================================
# 1. Lie Group SO(3) Exponential & Logarithmic Maps (Singularity-Immune)
# =============================================================================

def hat_so3(w: Vec3) -> Mat3:
    wx, wy, wz = w
    return (
        (0.0, -wz, wy),
        (wz, 0.0, -wx),
        (-wy, wx, 0.0),
    )


def vee_so3(W: Mat3) -> Vec3:
    return (W[2][1] - W[1][2]) * 0.5, (W[0][2] - W[2][0]) * 0.5, (W[1][0] - W[0][1]) * 0.5


def mat3_mul(A: Mat3, B: Mat3) -> Mat3:
    return tuple(  # type: ignore[return-value]
        tuple(sum(A[i][k] * B[k][j] for k in range(3)) for j in range(3))
        for i in range(3)
    )


def mat3_add(A: Mat3, B: Mat3, scale_b: float = 1.0) -> Mat3:
    return tuple(  # type: ignore[return-value]
        tuple(A[i][j] + scale_b * B[i][j] for j in range(3))
        for i in range(3)
    )


def mat3_transpose(A: Mat3) -> Mat3:
    return tuple(tuple(A[j][i] for j in range(3)) for i in range(3))  # type: ignore[return-value]


def exp_so3(phi: Vec3) -> Mat3:
    """Rodrigues' rotation formula with Taylor series near theta = 0."""
    theta2 = phi[0] * phi[0] + phi[1] * phi[1] + phi[2] * phi[2]
    theta = math.sqrt(theta2)
    W = hat_so3(phi)
    W2 = mat3_mul(W, W)
    I3: Mat3 = ((1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0))

    if theta < 1e-4:
        c1 = 1.0 - theta2 / 6.0 + (theta2 * theta2) / 120.0
        c2 = 0.5 - theta2 / 24.0 + (theta2 * theta2) / 720.0
    else:
        c1 = math.sin(theta) / theta
        c2 = (1.0 - math.cos(theta)) / theta2

    return mat3_add(mat3_add(I3, W, c1), W2, c2)


def log_so3(R: Mat3) -> Vec3:
    """Logarithmic map on SO(3) with singularity handling at theta -> 0 and theta -> pi."""
    w_skew = vee_so3(R)
    sin_theta = math.sqrt(w_skew[0] ** 2 + w_skew[1] ** 2 + w_skew[2] ** 2)
    tr = R[0][0] + R[1][1] + R[2][2]
    cos_theta = max(-1.0, min(1.0, 0.5 * (tr - 1.0)))
    theta = math.atan2(sin_theta, cos_theta)

    if theta < 1e-5:
        scale = 1.0 + (theta * theta) / 6.0 + 7.0 * (theta**4) / 360.0
        return (w_skew[0] * scale, w_skew[1] * scale, w_skew[2] * scale)

    if math.pi - theta < 1e-3:
        # Near pi: extract unit axis u from B = 0.5 * (R + R^T) - cos_theta * I = (1 - cos_theta) * (u u^T)
        one_m_c = 1.0 - cos_theta
        b00 = max(0.0, (R[0][0] - cos_theta) / one_m_c)
        b11 = max(0.0, (R[1][1] - cos_theta) / one_m_c)
        b22 = max(0.0, (R[2][2] - cos_theta) / one_m_c)
        b01 = 0.5 * (R[0][1] + R[1][0]) / one_m_c
        b02 = 0.5 * (R[0][2] + R[2][0]) / one_m_c
        b12 = 0.5 * (R[1][2] + R[2][1]) / one_m_c

        if b00 >= b11 and b00 >= b22:
            ux = math.sqrt(b00)
            uy = b01 / ux
            uz = b02 / ux
        elif b11 >= b00 and b11 >= b22:
            uy = math.sqrt(b11)
            ux = b01 / uy
            uz = b12 / uy
        else:
            uz = math.sqrt(b22)
            ux = b02 / uz
            uy = b12 / uz

        if ux * w_skew[0] + uy * w_skew[1] + uz * w_skew[2] < 0.0:
            ux, uy, uz = -ux, -uy, -uz
        return (theta * ux, theta * uy, theta * uz)

    factor = theta / sin_theta
    return (w_skew[0] * factor, w_skew[1] * factor, w_skew[2] * factor)


# =============================================================================
# 2. Coupled 4-State Electromechanical Two-Mass Resonant Actuator Model
# =============================================================================

class TwoMassActuator:
    """4-state Bond-Graph electromechanical model: x = [i_a, w_m, dtheta, w_L]."""

    def __init__(
        self,
        R_a: float = 0.8,
        L_a: float = 1.2e-3,
        K_t: float = 0.12,
        J_m: float = 4.5e-5,
        J_L: float = 1.8e-4,
        k_s: float = 120.0,
        b_s: float = 0.008,
        b_m: float = 1.0e-4,
        b_L: float = 1.0e-4,
    ) -> None:
        self.R_a = R_a
        self.L_a = L_a
        self.K_t = K_t
        self.K_e = K_t  # Power conservation in SI units
        self.J_m = J_m
        self.J_L = J_L
        self.k_s = k_s
        self.b_s = b_s
        self.b_m = b_m
        self.b_L = b_L

    @property
    def omega_anti_res(self) -> float:
        return math.sqrt(self.k_s / self.J_L)

    @property
    def omega_res(self) -> float:
        return math.sqrt(self.k_s * (1.0 / self.J_m + 1.0 / self.J_L))

    def rhs(self, x: Vec4, v_in: float, tau_ext: float = 0.0) -> Vec4:
        i_a, w_m, dtheta, w_L = x
        tau_s = self.k_s * dtheta + self.b_s * (w_m - w_L)
        di_a = (v_in - self.R_a * i_a - self.K_e * w_m) / self.L_a
        dw_m = (self.K_t * i_a - self.b_m * w_m - tau_s) / self.J_m
        ddtheta = w_m - w_L
        dw_L = (tau_s - self.b_L * w_L - tau_ext) / self.J_L
        return (di_a, dw_m, ddtheta, dw_L)

    def stored_energy(self, x: Vec4) -> float:
        i_a, w_m, dtheta, w_L = x
        return (
            0.5 * self.L_a * i_a * i_a
            + 0.5 * self.J_m * w_m * w_m
            + 0.5 * self.k_s * dtheta * dtheta
            + 0.5 * self.J_L * w_L * w_L
        )

    def dissipated_power(self, x: Vec4) -> float:
        i_a, w_m, _, w_L = x
        return (
            self.R_a * i_a * i_a
            + self.b_m * w_m * w_m
            + self.b_s * (w_m - w_L) ** 2
            + self.b_L * w_L * w_L
        )

    def transfer_wm_over_tau(self, s: complex) -> complex:
        """Exact analytical continuous transfer function omega_m(s) / tau_m(s)."""
        Z_L = self.J_L * s + self.b_L
        Z_s = self.k_s / s + self.b_s
        Z_m = self.J_m * s + self.b_m
        # w_L = (Z_s / (Z_L + Z_s)) * w_m
        Z_eq = Z_m + (Z_L * Z_s) / (Z_L + Z_s)
        return 1.0 / Z_eq

    def step_rk4_with_energy(
        self, x: Vec4, v_in_fn: Callable[[float], float], t: float, dt: float
    ) -> tuple[Vec4, float, float]:
        """Integrate state x and energy balance [E_in, E_diss] simultaneously via 4th-order RK4."""
        def aug_rhs(st: Vec4, tau_t: float) -> tuple[Vec4, float, float]:
            u = v_in_fn(tau_t)
            dx = self.rhs(st, u)
            return dx, u * st[0], self.dissipated_power(st)

        k1_x, k1_ein, k1_ediss = aug_rhs(x, t)
        x2: Vec4 = tuple(x[i] + 0.5 * dt * k1_x[i] for i in range(4))  # type: ignore[assignment]
        k2_x, k2_ein, k2_ediss = aug_rhs(x2, t + 0.5 * dt)
        x3: Vec4 = tuple(x[i] + 0.5 * dt * k2_x[i] for i in range(4))  # type: ignore[assignment]
        k3_x, k3_ein, k3_ediss = aug_rhs(x3, t + 0.5 * dt)
        x4: Vec4 = tuple(x[i] + dt * k3_x[i] for i in range(4))  # type: ignore[assignment]
        k4_x, k4_ein, k4_ediss = aug_rhs(x4, t + dt)

        x_next: Vec4 = tuple(  # type: ignore[assignment]
            x[i] + (dt / 6.0) * (k1_x[i] + 2.0 * k2_x[i] + 2.0 * k3_x[i] + k4_x[i])
            for i in range(4)
        )
        d_ein = (dt / 6.0) * (k1_ein + 2.0 * k2_ein + 2.0 * k3_ein + k4_ein)
        d_ediss = (dt / 6.0) * (k1_ediss + 2.0 * k2_ediss + 2.0 * k3_ediss + k4_ediss)
        return x_next, d_ein, d_ediss


# =============================================================================
# 3. Pre-Warped Tustin Biquad Notch Filter in Float32 Transposed Direct Form II
# =============================================================================

class Float32TDF2BiquadNotch:
    """Pre-warped Tustin digital notch filter implemented in float32 TDF-II."""

    def __init__(self, f_notch_hz: float, q_factor: float, fs_hz: float) -> None:
        w0 = 2.0 * math.pi * f_notch_hz
        ts = 1.0 / fs_hz
        # Pre-warped bilinear constant K = w0 / tan(w0 * Ts / 2)
        # Normalizing by K: let k_tan = tan(w0 * Ts / 2)
        k_tan = math.tan(0.5 * w0 * ts)
        norm = 1.0 + k_tan / q_factor + k_tan * k_tan

        b0 = (1.0 + k_tan * k_tan) / norm
        b1 = 2.0 * (k_tan * k_tan - 1.0) / norm
        b2 = b0
        a1 = b1
        a2 = (1.0 - k_tan / q_factor + k_tan * k_tan) / norm

        self.b0 = f32(b0)
        self.b1 = f32(b1)
        self.b2 = f32(b2)
        self.a1 = f32(a1)
        self.a2 = f32(a2)
        self.z1 = f32(0.0)
        self.z2 = f32(0.0)

    def step(self, x_in: float) -> float:
        x = f32(x_in)
        y = f32(f32(self.b0 * x) + self.z1)
        self.z1 = f32(f32(self.b1 * x) - f32(self.a1 * y) + self.z2)
        self.z2 = f32(f32(self.b2 * x) - f32(self.a2 * y))
        return y

    def freq_response(self, f_hz: float, fs_hz: float) -> complex:
        z = cmath.exp(1j * 2.0 * math.pi * f_hz / fs_hz)
        z_inv = 1.0 / z
        num = self.b0 + self.b1 * z_inv + self.b2 * (z_inv**2)
        den = 1.0 + self.a1 * z_inv + self.a2 * (z_inv**2)
        return num / den


# =============================================================================
# 4. Unit Test Suite (Verifies Track 00 Milestone Gate)
# =============================================================================

class TestLab00Foundations(unittest.TestCase):
    def test_so3_roundtrip_and_singularities(self) -> None:
        test_vectors: list[Vec3] = [
            (0.0, 0.0, 0.0),
            (1e-9, -2e-9, 1.5e-9),
            (1e-6, 0.0, 0.0),
            (0.4, -0.7, 1.1),
            (math.pi - 1e-7, 0.0, 0.0),
            (0.0, math.pi - 1e-7, 0.0),
            ((math.pi - 1e-6) / math.sqrt(3), -(math.pi - 1e-6) / math.sqrt(3), (math.pi - 1e-6) / math.sqrt(3)),
        ]
        for phi in test_vectors:
            R = exp_so3(phi)
            # Check orthogonality R^T R = I
            RtR = mat3_mul(mat3_transpose(R), R)
            for i in range(3):
                for j in range(3):
                    expected = 1.0 if i == j else 0.0
                    self.assertAlmostEqual(RtR[i][j], expected, places=13)
            # Check roundtrip exp(log(R)) == R
            phi_rec = log_so3(R)
            R_rec = exp_so3(phi_rec)
            for i in range(3):
                for j in range(3):
                    self.assertAlmostEqual(R[i][j], R_rec[i][j], places=11)

    def test_bond_graph_energy_conservation(self) -> None:
        plant = TwoMassActuator()
        dt = 2.0e-5  # 50 kHz RK4 integration
        steps = 2500
        x: Vec4 = (0.0, 0.0, 0.0, 0.0)
        e_in = 0.0
        e_diss = 0.0
        e0 = plant.stored_energy(x)

        v_fn = lambda tau_t: 12.0 * math.sin(2.0 * math.pi * 80.0 * tau_t)
        for k in range(steps):
            t = k * dt
            x, d_ein, d_ediss = plant.step_rk4_with_energy(x, v_fn, t, dt)
            e_in += d_ein
            e_diss += d_ediss

        delta_stored = plant.stored_energy(x) - e0
        energy_residual = abs(e_in - (delta_stored + e_diss))
        self.assertLess(energy_residual, 1e-9)

    def test_resonance_identification_and_float32_notch(self) -> None:
        plant = TwoMassActuator(b_s=1e-4, b_m=1e-5, b_L=1e-5)
        f_ar_true = plant.omega_anti_res / (2.0 * math.pi)
        f_r_true = plant.omega_res / (2.0 * math.pi)

        # Scan frequency grid around anti-resonance and resonance
        freqs = [100.0 + 0.25 * i for i in range(1800)]
        mags = [abs(plant.transfer_wm_over_tau(1j * 2.0 * math.pi * f)) for f in freqs]

        min_idx = min(range(len(freqs)), key=lambda idx: mags[idx])
        max_idx = max(range(len(freqs)), key=lambda idx: mags[idx])
        f_ar_est = freqs[min_idx]
        f_r_est = freqs[max_idx]

        self.assertLess(abs(f_ar_est - f_ar_true) / f_ar_true, 0.005)
        self.assertLess(abs(f_r_est - f_r_true) / f_r_true, 0.005)

        # Design float32 pre-warped Tustin notch at f_r_true (fs = 10 kHz)
        fs = 10000.0
        notch = Float32TDF2BiquadNotch(f_notch_hz=f_r_true, q_factor=6.0, fs_hz=fs)
        attenuation_db = 20.0 * math.log10(abs(notch.freq_response(f_r_true, fs)) + 1e-15)
        self.assertLessEqual(attenuation_db, -25.0)

        # Verify time-domain sine suppression at f_r_true in float32
        n_samples = 1000
        outputs = []
        for k in range(n_samples):
            u = math.sin(2.0 * math.pi * f_r_true * (k / fs))
            y = notch.step(u)
            if k > 500:
                outputs.append(y)
        rms_out = math.sqrt(sum(v * v for v in outputs) / len(outputs))
        self.assertLess(rms_out, 0.04)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Lab 00 Reference Simulation & Unit Tests.\nExit-code family: typed."
    )
    parser.add_argument("--json", action="store_true", help="Output JSON summary")
    args = parser.parse_args(argv)

    suite = unittest.defaultTestLoader.loadTestsFromTestCase(TestLab00Foundations)
    stream = sys.stderr if args.json else sys.stdout
    runner = unittest.TextTestRunner(stream=stream, verbosity=2 if not args.json else 0)
    result = runner.run(suite)

    plant = TwoMassActuator()
    summary = {
        "lab": "00-foundations",
        "ok": result.wasSuccessful(),
        "tests_run": result.testsRun,
        "anti_resonance_hz": round(plant.omega_anti_res / (2.0 * math.pi), 2),
        "resonance_hz": round(plant.omega_res / (2.0 * math.pi), 2),
    }
    if args.json:
        sys.stdout.write(json.dumps(summary) + "\n")
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    sys.exit(main())
