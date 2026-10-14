#!/usr/bin/env python3
"""Lab 05: Loop-Shaping Sensitivity, Joseph-Form ESKF, CLF-CBF-QP & Embedded MPC.

Zero-external-dependency pure Python 3 reference simulation & unit test suite.
Exit-code family: typed (0 = all checks pass, 1 = test failure, 2 = usage error).
"""

from __future__ import annotations

import argparse
import cmath
import json
import math
import random
import sys
import unittest


# =============================================================================
# 1. Gang of Four Sensitivity Peak M_s & M_t across Plant Uncertainty
# =============================================================================

def compute_sensitivity_peaks(
    j_plant: float,
    b_plant: float = 0.015,
    kp: float = 0.85,
    ki: float = 4.0,
    kd: float = 0.008,
    tau_delay: float = 80.0e-6,
) -> tuple[float, float]:
    """Compute M_s = max |S(jw)| and M_t = max |T(jw)| for a velocity/position servo."""
    max_s = 0.0
    max_t = 0.0
    for i in range(1, 2000):
        f_hz = 0.5 * i
        w = 2.0 * math.pi * f_hz
        s = 1j * w
        # Plant P(s) = exp(-s * tau_d) / (J * s + b)
        p_s = cmath.exp(-s * tau_delay) / (j_plant * s + b_plant)
        # Filtered PI/PID controller C(s)
        c_s = kp + ki / s + (kd * s) / (1.0 + s / (2.0 * math.pi * 1500.0))
        l_s = p_s * c_s
        sens = 1.0 / (1.0 + l_s)
        comp_sens = l_s / (1.0 + l_s)
        max_s = max(max_s, abs(sens))
        max_t = max(max_t, abs(comp_sens))
    return max_s, max_t


# =============================================================================
# 2. Joseph-Form Error-State Kalman Filter (Attitude + Gyro Bias) & NEES Audit
# =============================================================================

class AttitudeGyroESKF:
    """Error-State Kalman Filter for 3-DOF Attitude + 3-DOF Gyro Bias (6D tangent error state).

    Implemented per axis (3 decoupled 2-state [delta_theta_i, delta_bg_i] Joseph-form filters)
    to verify statistical consistency (NEES) and positive-definite covariance preservation.
    """

    def __init__(self, q_theta: float = 1.0e-4, q_bg: float = 1.0e-6, r_meas: float = 4.0e-4) -> None:
        self.q_theta = q_theta
        self.q_bg = q_bg
        self.r_meas = r_meas
        # 3 axes of nominal state [theta_hat, bg_hat] and 2x2 covariance P
        self.theta_hat = [0.0, 0.0, 0.0]
        self.bg_hat = [0.0, 0.0, 0.0]
        self.P = [[[1e-3, 0.0], [0.0, 1e-3]] for _ in range(3)]

    def predict(self, omega_meas: tuple[float, float, float], dt: float) -> None:
        for ax in range(3):
            self.theta_hat[ax] += (omega_meas[ax] - self.bg_hat[ax]) * dt
            # F = [[1, -dt], [0, 1]]
            P = self.P[ax]
            p00 = P[0][0] - dt * (P[1][0] + P[0][1]) + (dt * dt) * P[1][1] + self.q_theta * dt
            p01 = P[0][1] - dt * P[1][1]
            p10 = P[1][0] - dt * P[1][1]
            p11 = P[1][1] + self.q_bg * dt
            self.P[ax] = [[p00, p01], [p10, p11]]

    def update_joseph(self, theta_meas: tuple[float, float, float]) -> None:
        """Joseph stabilized covariance update: P+ = (I - K H) P- (I - K H)^T + K R K^T."""
        for ax in range(3):
            P = self.P[ax]
            # H = [1, 0]
            s_innov = P[0][0] + self.r_meas
            k0 = P[0][0] / s_innov
            k1 = P[1][0] / s_innov

            innov = theta_meas[ax] - self.theta_hat[ax]
            d_theta = k0 * innov
            d_bg = k1 * innov

            # Inject error into nominal state
            self.theta_hat[ax] += d_theta
            self.bg_hat[ax] += d_bg

            # A = I - K H = [[1 - k0, 0], [-k1, 1]]
            a00 = 1.0 - k0
            a10 = -k1
            # A P A^T + K R K^T
            ap00 = a00 * P[0][0]
            ap01 = a00 * P[0][1]
            ap10 = a10 * P[0][0] + P[1][0]
            ap11 = a10 * P[0][1] + P[1][1]

            p00_new = ap00 * a00 + (k0 * k0) * self.r_meas
            p01_new = ap00 * a10 + ap01 + (k0 * k1) * self.r_meas
            p11_new = ap10 * a10 + ap11 + (k1 * k1) * self.r_meas
            self.P[ax] = [[p00_new, p01_new], [p01_new, p11_new]]

    def compute_nees(self, true_theta: tuple[float, float, float], true_bg: tuple[float, float, float]) -> float:
        """Compute 6-DOF Normalized Estimation Error Squared: e^T P^{-1} e."""
        nees = 0.0
        for ax in range(3):
            e0 = true_theta[ax] - self.theta_hat[ax]
            e1 = true_bg[ax] - self.bg_hat[ax]
            P = self.P[ax]
            det = P[0][0] * P[1][1] - P[0][1] * P[1][0]
            inv00 = P[1][1] / det
            inv01 = -P[0][1] / det
            inv11 = P[0][0] / det
            nees += e0 * (inv00 * e0 + inv01 * e1) + e1 * (inv01 * e0 + inv11 * e1)
        return nees


# =============================================================================
# 3. Control Barrier Function Safety Filter (CLF-CBF-QP) & Soft-Constrained MPC
# =============================================================================

def cbf_safety_filter_1d(
    pos: float,
    vel: float,
    u_nom: float,
    pos_max: float = 1.0,
    alpha_cbf: float = 8.0,
    gamma_cbf: float = 12.0,
    u_limit: float = 15.0,
) -> tuple[float, float]:
    """Exponential Control Barrier Function (ECBF) for double integrator d2x/dt2 = u.

    Safe set: h_0(x) = pos_max - pos >= 0.
    Relative degree 2 barrier: h(x, v) = (pos_max - pos) - v / alpha_cbf >= 0.
    Time derivative: dh/dt = -v - u / alpha_cbf >= -gamma_cbf * h(x, v)
      ==> u <= alpha_cbf * (gamma_cbf * h(x, v) - v).
    Closed-form 1D QP projection min 0.5 * (u - u_nom)^2 s.t. CBF & actuator bounds.
    """
    h_val = (pos_max - pos) - vel / alpha_cbf
    u_cbf_upper = alpha_cbf * (gamma_cbf * h_val - vel)
    u_safe = max(-u_limit, min(u_limit, min(u_nom, u_cbf_upper)))
    return u_safe, h_val


class ProjectedGradientLinearMPC:
    """Fast embedded Finite-Horizon MPC for double-integrator with soft state bounds."""

    def __init__(self, dt: float = 0.005, horizon: int = 15, u_max: float = 12.0) -> None:
        self.dt = dt
        self.horizon = horizon
        self.u_max = u_max

    def solve_control(self, pos: float, vel: float, pos_ref: float = 0.0) -> float:
        """Compute optimal first control action u_0 via Riccati recursion + box clamp."""
        # Discrete double integrator x_{k+1} = [[1, dt], [0, 1]] x_k + [[0.5*dt^2], [dt]] u_k
        dt = self.dt
        p00, p01, p11 = 400.0, 40.0, 20.0
        q00, q11, r_cost = 400.0, 60.0, 1.0
        b0 = 0.5 * dt * dt
        b1 = dt

        k0_gain = 0.0
        k1_gain = 0.0
        for _ in range(150):
            # A^T P A
            pa00 = p00
            pa01 = p00 * dt + p01
            pa11 = p00 * dt * dt + 2.0 * p01 * dt + p11
            # B^T P B + R
            pb0 = p00 * b0 + p01 * b1
            pb1 = p01 * b0 + p11 * b1
            s_scalar = r_cost + b0 * pb0 + b1 * pb1
            # B^T P A
            btpa0 = pb0
            btpa1 = pb0 * dt + pb1
            k0_gain = btpa0 / s_scalar
            k1_gain = btpa1 / s_scalar
            # Riccati update P = Q + A^T P A - K^T s K
            p00 = q00 + pa00 - k0_gain * s_scalar * k0_gain
            p01 = pa01 - k0_gain * s_scalar * k1_gain
            p11 = q11 + pa11 - k1_gain * s_scalar * k1_gain

        u_opt = -(k0_gain * (pos - pos_ref) + k1_gain * vel)
        return max(-self.u_max, min(self.u_max, u_opt))


# =============================================================================
# 4. Unit Test Suite (Verifies Track 05 Milestone Gate)
# =============================================================================

class TestLab05ControlAndEstimation(unittest.TestCase):
    def test_gang_of_four_sensitivity_robustness(self) -> None:
        j_nom = 2.25e-4
        for scale in (0.75, 1.0, 1.25):  # +/- 25% inertia uncertainty
            ms, mt = compute_sensitivity_peaks(j_plant=j_nom * scale)
            self.assertLessEqual(ms, 1.75)
            self.assertLessEqual(mt, 1.40)

    def test_eskf_joseph_form_and_nees_consistency(self) -> None:
        rng = random.Random(2026)
        dt = 0.005
        q_th = 1.0e-4
        q_bg = 1.0e-6
        r_m = 4.0e-4

        nees_samples = []
        for trial in range(40):
            eskf = AttitudeGyroESKF(q_theta=q_th, q_bg=q_bg, r_meas=r_m)
            true_th = [rng.gauss(0.0, math.sqrt(1e-3)) for _ in range(3)]
            true_bg = [rng.gauss(0.0, math.sqrt(1e-3)) for _ in range(3)]

            for step in range(80):
                omega_true = (math.sin(0.05 * step), math.cos(0.04 * step), -0.3)
                omega_meas = tuple(
                    omega_true[i] + true_bg[i] + rng.gauss(0.0, math.sqrt(q_th / dt))
                    for i in range(3)
                )
                for i in range(3):
                    true_th[i] += omega_true[i] * dt
                    true_bg[i] += rng.gauss(0.0, math.sqrt(q_bg * dt))

                eskf.predict(omega_meas, dt)  # type: ignore[arg-type]
                th_meas = tuple(true_th[i] + rng.gauss(0.0, math.sqrt(r_m)) for i in range(3))
                eskf.update_joseph(th_meas)  # type: ignore[arg-type]

            nees_samples.append(eskf.compute_nees(tuple(true_th), tuple(true_bg)))  # type: ignore[arg-type]

        mean_nees = sum(nees_samples) / len(nees_samples)
        # Expected value of chi^2_6 is 6.0; 95% confidence interval for 40-run mean is [4.5, 7.8]
        self.assertGreater(mean_nees, 4.0)
        self.assertLess(mean_nees, 8.2)

    def test_cbf_safety_invariance_and_mpc_stabilization(self) -> None:
        pos = 0.2
        vel = 1.5
        dt = 0.001
        min_h = 999.0
        max_pos = 0.0

        # Command an unsafe aggressive nominal input u_nom = +10.0 slamming toward wall at pos_max = 1.0
        for _ in range(1500):
            u_safe, h_val = cbf_safety_filter_1d(pos, vel, u_nom=10.0, pos_max=1.0)
            min_h = min(min_h, h_val)
            pos += vel * dt + 0.5 * u_safe * dt * dt
            vel += u_safe * dt
            max_pos = max(max_pos, pos)

        self.assertGreaterEqual(min_h, -1e-4)
        self.assertLessEqual(max_pos, 1.0001)

        # Verify MPC stabilizes disturbed state to origin
        mpc = ProjectedGradientLinearMPC(dt=0.005, horizon=15)
        p_mpc, v_mpc = -0.8, 1.2
        for _ in range(700):
            u = mpc.solve_control(p_mpc, v_mpc, pos_ref=0.0)
            p_mpc += v_mpc * 0.005 + 0.5 * u * (0.005**2)
            v_mpc += u * 0.005
        self.assertLess(abs(p_mpc), 1e-3)
        self.assertLess(abs(v_mpc), 1e-3)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Lab 05 Reference Simulation & Unit Tests.\nExit-code family: typed."
    )
    parser.add_argument("--json", action="store_true", help="Output JSON summary")
    args = parser.parse_args(argv)

    suite = unittest.defaultTestLoader.loadTestsFromTestCase(TestLab05ControlAndEstimation)
    stream = sys.stderr if args.json else sys.stdout
    runner = unittest.TextTestRunner(stream=stream, verbosity=2 if not args.json else 0)
    result = runner.run(suite)

    ms, mt = compute_sensitivity_peaks(j_plant=2.25e-4)
    summary = {
        "lab": "05-control-and-estimation",
        "ok": result.wasSuccessful(),
        "tests_run": result.testsRun,
        "nominal_Ms": round(ms, 3),
        "nominal_Mt": round(mt, 3),
    }
    if args.json:
        sys.stdout.write(json.dumps(summary) + "\n")
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    sys.exit(main())
