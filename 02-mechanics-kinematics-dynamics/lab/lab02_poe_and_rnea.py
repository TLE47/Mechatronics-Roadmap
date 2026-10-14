#!/usr/bin/env python3
"""Lab 02: 2-DOF Serial Manipulator PoE Kinematics, RNEA/CRBA Dynamics & Passivity Check.

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
# 1. Product of Exponentials (PoE) Forward Kinematics & Space/Body Jacobians
# =============================================================================

class Planar2DOFArm:
    """2-DOF serial arm modeled via both Screw Theory PoE/RNEA and closed-form Lagrangian."""

    def __init__(
        self,
        l1: float = 0.25,
        l2: float = 0.22,
        lc1: float = 0.125,
        lc2: float = 0.11,
        m1: float = 1.2,
        m2: float = 0.8,
        i1: float = 0.008,
        i2: float = 0.004,
        g: float = 9.80665,
    ) -> None:
        self.l1 = l1
        self.l2 = l2
        self.lc1 = lc1
        self.lc2 = lc2
        self.m1 = m1
        self.m2 = m2
        self.i1 = i1
        self.i2 = i2
        self.g = g

    def fk_poe(self, q1: float, q2: float) -> tuple[float, float, float]:
        """Product of Exponentials in SE(2)/SE(3) xy-plane -> (x_tip, y_tip, theta_tip)."""
        # Screw 1 at origin: w1 = [0,0,1], v1 = [0,0,0]
        # Screw 2 at (l1, 0, 0): w2 = [0,0,1], v2 = [0, -l1, 0]
        # Home configuration M at q=(0,0): tip at (l1 + l2, 0), theta = 0
        c1, s1 = math.cos(q1), math.sin(q1)
        c12, s12 = math.cos(q1 + q2), math.sin(q1 + q2)
        x = self.l1 * c1 + self.l2 * c12
        y = self.l1 * s1 + self.l2 * s12
        return (x, y, q1 + q2)

    def jacobian_tip(self, q1: float, q2: float) -> tuple[tuple[float, float], tuple[float, float]]:
        """2x2 linear velocity Jacobian J_v(q) = d[x, y] / dq."""
        s1, c1 = math.sin(q1), math.cos(q1)
        s12, c12 = math.sin(q1 + q2), math.cos(q1 + q2)
        j11 = -self.l1 * s1 - self.l2 * s12
        j12 = -self.l2 * s12
        j21 = self.l1 * c1 + self.l2 * c12
        j22 = self.l2 * c12
        return ((j11, j12), (j21, j22))

    def dls_ik(
        self,
        x_des: float,
        y_des: float,
        q_init: tuple[float, float] = (0.3, 0.5),
        lam: float = 0.01,
        max_iter: int = 80,
    ) -> tuple[float, float]:
        """Damped Least-Squares (Levenberg-Marquardt) Inverse Kinematics."""
        q1, q2 = q_init
        for _ in range(max_iter):
            x, y, _ = self.fk_poe(q1, q2)
            ex, ey = x_des - x, y_des - y
            if math.hypot(ex, ey) < 1e-11:
                break
            J = self.jacobian_tip(q1, q2)
            #JJ^T + lam^2 I (2x2)
            a11 = J[0][0] ** 2 + J[0][1] ** 2 + lam * lam
            a12 = J[0][0] * J[1][0] + J[0][1] * J[1][1]
            a22 = J[1][0] ** 2 + J[1][1] ** 2 + lam * lam
            det = a11 * a22 - a12 * a12
            ux = (a22 * ex - a12 * ey) / det
            uy = (-a12 * ex + a11 * ey) / det
            dq1 = J[0][0] * ux + J[1][0] * uy
            dq2 = J[0][1] * ux + J[1][1] * uy
            q1 += dq1
            q2 += dq2
        return (q1, q2)

    # =========================================================================
    # 2. Exact Mass Matrix M(q), Christoffel Coriolis Matrix C(q, dq), and RNEA
    # =========================================================================

    def mass_matrix(self, q2: float) -> tuple[tuple[float, float], tuple[float, float]]:
        c2 = math.cos(q2)
        m11 = (
            self.i1
            + self.i2
            + self.m1 * (self.lc1**2)
            + self.m2 * (self.l1**2 + self.lc2**2 + 2.0 * self.l1 * self.lc2 * c2)
        )
        m12 = self.i2 + self.m2 * (self.lc2**2 + self.l1 * self.lc2 * c2)
        m22 = self.i2 + self.m2 * (self.lc2**2)
        return ((m11, m12), (m12, m22))

    def coriolis_matrix(self, q2: float, dq1: float, dq2: float) -> tuple[tuple[float, float], tuple[float, float]]:
        """Christoffel-symbol Coriolis matrix C(q, dq) guaranteeing dM/dt - 2C skew-symmetry."""
        h = -self.m2 * self.l1 * self.lc2 * math.sin(q2)
        c11 = h * dq2
        c12 = h * (dq1 + dq2)
        c21 = -h * dq1
        c22 = 0.0
        return ((c11, c12), (c21, c22))

    def gravity_vector(self, q1: float, q2: float) -> tuple[float, float]:
        c1 = math.cos(q1)
        c12 = math.cos(q1 + q2)
        g1 = (self.m1 * self.lc1 + self.m2 * self.l1) * self.g * c1 + self.m2 * self.lc2 * self.g * c12
        g2 = self.m2 * self.lc2 * self.g * c12
        return (g1, g2)

    def inverse_dynamics_lagrangian(
        self, q: tuple[float, float], dq: tuple[float, float], ddq: tuple[float, float]
    ) -> tuple[float, float]:
        M = self.mass_matrix(q[1])
        C = self.coriolis_matrix(q[1], dq[0], dq[1])
        G = self.gravity_vector(q[0], q[1])
        tau1 = M[0][0] * ddq[0] + M[0][1] * ddq[1] + C[0][0] * dq[0] + C[0][1] * dq[1] + G[0]
        tau2 = M[1][0] * ddq[0] + M[1][1] * ddq[1] + C[1][0] * dq[0] + C[1][1] * dq[1] + G[1]
        return (tau1, tau2)

    def rnea_inverse_dynamics(
        self, q: tuple[float, float], dq: tuple[float, float], ddq: tuple[float, float]
    ) -> tuple[float, float]:
        """Recursive Newton-Euler Algorithm (Outward kinematics pass + Inward wrench pass)."""
        q1, q2 = q
        dq1, dq2 = dq
        ddq1, ddq2 = ddq
        c1, s1 = math.cos(q1), math.sin(q1)
        c2, s2 = math.cos(q2), math.sin(q2)

        # Forward Pass (in link-local frames, base acceleration a0 = [0, +g] in world frame)
        w1 = dq1
        dw1 = ddq1
        # Base upward acceleration (gravity compensation trick) in frame 1:
        a_base_1_x = self.g * s1
        a_base_1_y = self.g * c1

        # Acceleration of CoM 1 in frame 1
        ac1_x = a_base_1_x - (w1 * w1) * self.lc1
        ac1_y = a_base_1_y + dw1 * self.lc1

        # Acceleration of Joint 2 origin in frame 1
        aj2_1_x = a_base_1_x - (w1 * w1) * self.l1
        aj2_1_y = a_base_1_y + dw1 * self.l1

        # Rotate Joint 2 origin acceleration into frame 2
        aj2_2_x = c2 * aj2_1_x + s2 * aj2_1_y
        aj2_2_y = -s2 * aj2_1_x + c2 * aj2_1_y

        w2 = w1 + dq2
        dw2 = dw1 + ddq2
        ac2_x = aj2_2_x - (w2 * w2) * self.lc2
        ac2_y = aj2_2_y + dw2 * self.lc2

        # Backward Pass (inward force/moment balance about each joint axis)
        f2_x = self.m2 * ac2_x
        f2_y = self.m2 * ac2_y
        tau2 = self.i2 * dw2 + self.lc2 * f2_y

        # Rotate f2 back to frame 1
        f2_1_x = c2 * f2_x - s2 * f2_y
        f2_1_y = s2 * f2_x + c2 * f2_y

        # Moment balance on Link 1 about Joint 1: I1*dw1 + r_c1 x (m1*a_c1) + r_12 x f2_1 + tau2
        tau1 = self.i1 * dw1 + self.lc1 * (self.m1 * ac1_y) + self.l1 * f2_1_y + tau2

        return (tau1, tau2)


# =============================================================================
# 3. Unit Test Suite (Verifies Track 02 Milestone Gate)
# =============================================================================

class TestLab02MechanicsKinematicsDynamics(unittest.TestCase):
    def test_poe_fk_and_dls_ik_roundtrip(self) -> None:
        arm = Planar2DOFArm()
        rng = random.Random(42)
        for _ in range(100):
            q1 = rng.uniform(-0.8, 0.8)
            q2 = rng.uniform(0.2, 1.4)
            x, y, _ = arm.fk_poe(q1, q2)
            q_sol = arm.dls_ik(x, y, q_init=(q1 + 0.08, q2 - 0.08))
            x_sol, y_sol, _ = arm.fk_poe(q_sol[0], q_sol[1])
            self.assertAlmostEqual(x, x_sol, places=10)
            self.assertAlmostEqual(y, y_sol, places=10)

    def test_rnea_matches_lagrangian_to_machine_precision(self) -> None:
        arm = Planar2DOFArm()
        rng = random.Random(101)
        max_err = 0.0
        for _ in range(500):
            q = (rng.uniform(-math.pi, math.pi), rng.uniform(-math.pi, math.pi))
            dq = (rng.uniform(-5.0, 5.0), rng.uniform(-5.0, 5.0))
            ddq = (rng.uniform(-20.0, 20.0), rng.uniform(-20.0, 20.0))

            tau_lag = arm.inverse_dynamics_lagrangian(q, dq, ddq)
            tau_rnea = arm.rnea_inverse_dynamics(q, dq, ddq)
            err = max(abs(tau_lag[0] - tau_rnea[0]), abs(tau_lag[1] - tau_rnea[1]))
            max_err = max(max_err, err)
            self.assertLess(err, 1e-11)

    def test_passivity_skew_symmetry_identity(self) -> None:
        arm = Planar2DOFArm()
        rng = random.Random(77)
        eps = 1e-7
        for _ in range(200):
            q2 = rng.uniform(-math.pi, math.pi)
            dq1 = rng.uniform(-4.0, 4.0)
            dq2 = rng.uniform(-4.0, 4.0)
            x = (rng.uniform(-2.0, 2.0), rng.uniform(-2.0, 2.0))

            M_plus = arm.mass_matrix(q2 + eps * dq2)
            M_minus = arm.mass_matrix(q2 - eps * dq2)
            dM = tuple(
                tuple((M_plus[i][j] - M_minus[i][j]) / (2.0 * eps) for j in range(2))
                for i in range(2)
            )
            C = arm.coriolis_matrix(q2, dq1, dq2)

            # Evaluate quadratic form x^T (dM - 2C) x
            quad = 0.0
            for i in range(2):
                for j in range(2):
                    quad += x[i] * (dM[i][j] - 2.0 * C[i][j]) * x[j]
            self.assertLess(abs(quad), 1e-9)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Lab 02 Reference Simulation & Unit Tests.\nExit-code family: typed."
    )
    parser.add_argument("--json", action="store_true", help="Output JSON summary")
    args = parser.parse_args(argv)

    suite = unittest.defaultTestLoader.loadTestsFromTestCase(TestLab02MechanicsKinematicsDynamics)
    stream = sys.stderr if args.json else sys.stdout
    runner = unittest.TextTestRunner(stream=stream, verbosity=2 if not args.json else 0)
    result = runner.run(suite)

    summary = {
        "lab": "02-mechanics-kinematics-dynamics",
        "ok": result.wasSuccessful(),
        "tests_run": result.testsRun,
    }
    if args.json:
        sys.stdout.write(json.dumps(summary) + "\n")
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    sys.exit(main())
