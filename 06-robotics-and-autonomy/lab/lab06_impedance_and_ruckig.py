#!/usr/bin/env python3
"""Lab 06: Operational-Space Cartesian Impedance, Null-Space Projector & Jerk-Bounded Planning.

Zero-external-dependency pure Python 3 reference simulation & unit test suite.
Exit-code family: typed (0 = all checks pass, 1 = test failure, 2 = usage error).
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import unittest


# =============================================================================
# 1. Minimum-Jerk (5th-Order Polynomial) Bounded-Jerk Trajectory Generator
# =============================================================================

class MinimumJerkTrajectory1D:
    """Generates C^2 smooth (bounded jerk) trajectories between x0 and x1 over duration T."""

    def __init__(self, x0: float, x1: float, duration: float) -> None:
        self.x0 = x0
        self.dx = x1 - x0
        self.T = max(1e-6, duration)

    def sample(self, t: float) -> tuple[float, float, float, float]:
        """Return (pos, vel, acc, jerk) at time t."""
        if t <= 0.0:
            return (self.x0, 0.0, 0.0, 0.0)
        if t >= self.T:
            return (self.x0 + self.dx, 0.0, 0.0, 0.0)
        s = t / self.T
        s2 = s * s
        s3 = s2 * s
        s4 = s3 * s
        s5 = s4 * s

        pos = self.x0 + self.dx * (10.0 * s3 - 15.0 * s4 + 6.0 * s5)
        vel = (self.dx / self.T) * (30.0 * s2 - 60.0 * s3 + 30.0 * s4)
        acc = (self.dx / (self.T**2)) * (60.0 * s - 180.0 * s2 + 120.0 * s3)
        jerk = (self.dx / (self.T**3)) * (60.0 - 360.0 * s + 360.0 * s2)
        return (pos, vel, acc, jerk)


# =============================================================================
# 2. 3-DOF Redundant Planar Manipulator with Dynamically Consistent Null-Space
# =============================================================================

class Redundant3DOFArm:
    """3-DOF planar arm controlling 2D tip (x, y) with 1-DOF redundant elbow posture."""

    def __init__(self, l1: float = 0.25, l2: float = 0.25, l3: float = 0.20) -> None:
        self.l1 = l1
        self.l2 = l2
        self.l3 = l3
        # Diagonal joint-space inertia matrix M = diag(m1, m2, m3) for clean verification
        self.m_diag = (0.15, 0.08, 0.04)
        self.m_inv_diag = (1.0 / 0.15, 1.0 / 0.08, 1.0 / 0.04)

    def fk(self, q: tuple[float, float, float]) -> tuple[float, float]:
        q1, q2, q3 = q
        q12 = q1 + q2
        q123 = q12 + q3
        x = self.l1 * math.cos(q1) + self.l2 * math.cos(q12) + self.l3 * math.cos(q123)
        y = self.l1 * math.sin(q1) + self.l2 * math.sin(q12) + self.l3 * math.sin(q123)
        return (x, y)

    def jacobian(self, q: tuple[float, float, float]) -> tuple[tuple[float, float, float], tuple[float, float, float]]:
        q1, q2, q3 = q
        q12 = q1 + q2
        q123 = q12 + q3
        s1, c1 = math.sin(q1), math.cos(q1)
        s12, c12 = math.sin(q12), math.cos(q12)
        s123, c123 = math.sin(q123), math.cos(q123)

        j02 = -self.l3 * s123
        j01 = -self.l2 * s12 + j02
        j00 = -self.l1 * s1 + j01

        j12 = self.l3 * c123
        j11 = self.l2 * c12 + j12
        j10 = self.l1 * c1 + j11
        return ((j00, j01, j02), (j10, j11, j12))

    def operational_space_matrices(
        self, q: tuple[float, float, float]
    ) -> tuple[tuple[tuple[float, float], tuple[float, float]], tuple[tuple[float, float], tuple[float, float], tuple[float, float]]]:
        """Compute Khatib's Lambda(q) = (J M^{-1} J^T)^{-1} and J_bar = M^{-1} J^T Lambda."""
        J = self.jacobian(q)
        mi = self.m_inv_diag

        # A = J M^{-1} J^T (2x2)
        a00 = sum(J[0][k] * mi[k] * J[0][k] for k in range(3))
        a01 = sum(J[0][k] * mi[k] * J[1][k] for k in range(3))
        a11 = sum(J[1][k] * mi[k] * J[1][k] for k in range(3))
        det = a00 * a11 - a01 * a01

        lam00 = a11 / det
        lam01 = -a01 / det
        lam11 = a00 / det
        Lambda = ((lam00, lam01), (lam01, lam11))

        # J_bar = M^{-1} J^T Lambda (3x2)
        J_bar = tuple(  # type: ignore[assignment]
            (
                mi[k] * (J[0][k] * lam00 + J[1][k] * lam01),
                mi[k] * (J[0][k] * lam01 + J[1][k] * lam11),
            )
            for k in range(3)
        )
        return Lambda, J_bar  # type: ignore[return-value]

    def null_space_torque(
        self, q: tuple[float, float, float], tau_posture: tuple[float, float, float]
    ) -> tuple[float, float, float]:
        """Project posture torque through N^T(q) = I - J^T J_bar^T."""
        J = self.jacobian(q)
        _, J_bar = self.operational_space_matrices(q)
        # First compute w = J_bar^T * tau_posture (2D)
        w0 = sum(J_bar[k][0] * tau_posture[k] for k in range(3))
        w1 = sum(J_bar[k][1] * tau_posture[k] for k in range(3))
        # Then tau_null = tau_posture - J^T * w
        return tuple(  # type: ignore[return-value]
            tau_posture[k] - (J[0][k] * w0 + J[1][k] * w1) for k in range(3)
        )


# =============================================================================
# 3. Unit Test Suite (Verifies Track 06 Milestone Gate)
# =============================================================================

class TestLab06RoboticsAndAutonomy(unittest.TestCase):
    def test_jerk_bounded_trajectory_and_cartesian_tracking(self) -> None:
        # Choose duration T >= (60 * dx / J_max)^(1/3) so peak jerk <= 20 m/s^3
        traj = MinimumJerkTrajectory1D(x0=0.0, x1=0.35, duration=1.10)
        dt = 0.001
        pos = 0.0
        vel = 0.0
        m_eff = 1.5
        kp = 2500.0
        kd = 120.0

        max_jerk = 0.0
        sq_err_sum = 0.0
        steps = 1100
        for k in range(steps):
            t = k * dt
            x_d, v_d, a_d, j_d = traj.sample(t)
            max_jerk = max(max_jerk, abs(j_d))
            # Operational-space impedance + inverse dynamics feedforward
            f_cmd = m_eff * a_d + kp * (x_d - pos) + kd * (v_d - vel)
            acc = f_cmd / m_eff
            pos += vel * dt + 0.5 * acc * dt * dt
            vel += acc * dt
            sq_err_sum += (x_d - pos) ** 2

        rms_err_mm = math.sqrt(sq_err_sum / steps) * 1000.0
        self.assertLessEqual(max_jerk, 20.0)
        self.assertLess(rms_err_mm, 1.5)  # Gate: < 1.5 mm RMS tracking error

    def test_compliant_wall_contact_force_overshoot(self) -> None:
        # 1D operational-space tip impacting a rigid wall at x_wall = 0.10 m
        # Active damping D_x matched to coupled contact stiffness k_wall + k_x
        x_wall = 0.10
        x_target = 0.15  # 50 mm virtual penetration -> steady-state force = K_x * 0.05 = 20 N
        m_tip = 0.25
        k_x = 400.0
        d_x = 120.0
        k_wall = 4000.0
        d_wall = 60.0

        pos = 0.0
        vel = 0.0
        dt = 0.0001
        # Steady-state equilibrium: k_x * (x_target - x_eq) = k_wall * (x_eq - x_wall)
        f_steady = (k_x * k_wall / (k_x + k_wall)) * (x_target - x_wall)
        max_contact_force = 0.0
        traj = MinimumJerkTrajectory1D(x0=0.0, x1=x_target, duration=0.85)

        for k in range(10000):
            x_d, v_d, _, _ = traj.sample(k * dt)
            # In Hogan's impedance control, damping acts on (-vel) during contact or reference velocity is gated
            f_imp = k_x * (x_d - pos) - d_x * vel
            if pos > x_wall:
                f_env = max(0.0, k_wall * (pos - x_wall) + d_wall * vel)
            else:
                f_env = 0.0
            max_contact_force = max(max_contact_force, f_env)
            acc = (f_imp - f_env) / m_tip
            pos += vel * dt + 0.5 * acc * dt * dt
            vel += acc * dt

        overshoot_ratio = (max_contact_force - f_steady) / f_steady
        # Gate: Peak contact force overshoot < 15% above steady-state contact force
        self.assertLess(overshoot_ratio, 0.15)

    def test_dynamically_consistent_null_space_zero_tip_acceleration(self) -> None:
        arm = Redundant3DOFArm()
        q = (0.4, 0.7, -0.5)
        tau_posture = (4.5, -3.2, 1.8)
        tau_null = arm.null_space_torque(q, tau_posture)

        # Verify J(q) * M^{-1} * tau_null == [0, 0] (zero instantaneous end-effector acceleration!)
        J = arm.jacobian(q)
        ddq_null = tuple(arm.m_inv_diag[k] * tau_null[k] for k in range(3))
        ddx_tip = sum(J[0][k] * ddq_null[k] for k in range(3))
        ddy_tip = sum(J[1][k] * ddq_null[k] for k in range(3))

        self.assertLess(math.hypot(ddx_tip, ddy_tip), 1e-12)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Lab 06 Reference Simulation & Unit Tests.\nExit-code family: typed."
    )
    parser.add_argument("--json", action="store_true", help="Output JSON summary")
    args = parser.parse_args(argv)

    suite = unittest.defaultTestLoader.loadTestsFromTestCase(TestLab06RoboticsAndAutonomy)
    stream = sys.stderr if args.json else sys.stdout
    runner = unittest.TextTestRunner(stream=stream, verbosity=2 if not args.json else 0)
    result = runner.run(suite)

    summary = {
        "lab": "06-robotics-and-autonomy",
        "ok": result.wasSuccessful(),
        "tests_run": result.testsRun,
    }
    if args.json:
        sys.stdout.write(json.dumps(summary) + "\n")
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    sys.exit(main())
