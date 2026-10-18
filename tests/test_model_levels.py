#!/usr/bin/env python3
"""Model levels A-D: the linear model is proved against the plant, not asserted.

The one thing this file refuses to do is check the Jacobian against itself. Every derivative is
compared with a finite difference of `mechalab_plant.motor_dynamics`, every discretisation with
either the closed form or one `step_arm` step, and the integration order is pinned with a case where
forward Euler and semi-implicit Euler disagree.

Run: python3 tests/test_model_levels.py
"""

import math
import os
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLANT_DIR = os.path.join(ROOT, "resources", "plants")
if PLANT_DIR not in sys.path:
    sys.path.insert(0, PLANT_DIR)

import mechalab_models as models  # noqa: E402
import mechalab_plant as plant  # noqa: E402


def accelerations(state, tau=(0.0, 0.0)):
    return plant.motor_dynamics(state[0], state[1], state[2], state[3], tau[0], tau[1])


class JacobianTests(unittest.TestCase):
    POSES = [(0.30, 0.80), (0.0, 0.0), (1.20, 0.40), (-0.70, 1.30)]

    def test_jacobian_matches_finite_differences(self):
        h = 1e-7
        for q1, q2 in self.POSES:
            a, _ = models.linearize(q1, q2)
            base = (q1, q2, 0.0, 0.0)
            f0 = accelerations(base)
            for column in range(4):
                plus = list(base)
                minus = list(base)
                plus[column] += h
                minus[column] -= h
                fp = accelerations(plus)
                fm = accelerations(minus)
                for row in range(2):
                    numeric = (fp[row] - fm[row]) / (2 * h)
                    self.assertAlmostEqual(
                        a[row + 2][column], numeric, delta=1e-6,
                        msg=f"expected A[{row + 2}][{column}] to equal the central difference "
                            f"{numeric!r} at q=({q1:.2f}, {q2:.2f}); check the Jacobian's "
                            f"coriolis terms - a sign slip shows up only off the diagonal",
                    )
            self.assertAlmostEqual(
                a[0][2], 1.0, delta=1e-12,
                msg=f"expected A[0][2] = 1.0 at q=({q1:.2f}, {q2:.2f}), because the first "
                    f"position integrates q1dot directly; check the linearisation's A block",
            )
            self.assertAlmostEqual(
                a[1][3], 1.0, delta=1e-12,
                msg=f"expected A[1][3] = 1.0 at q=({q1:.2f}, {q2:.2f}), because the second "
                    f"position integrates q2dot directly; check the linearisation's A block",
            )

    def test_input_matrix_is_one_over_inertia(self):
        _, b = models.linearize(0.30, 0.80)
        self.assertAlmostEqual(
            b[2][0], 1.0 / plant.I1, delta=1e-15,
            msg=f"expected B[2][0] = 1/I1 = {1.0 / plant.I1!r}, since a torque on link 1 acts "
                f"only through its own inertia; check the plant's I1 and the B assembly",
        )
        self.assertAlmostEqual(
            b[3][1], 1.0 / plant.I2, delta=1e-15,
            msg=f"expected B[3][1] = 1/I2 = {1.0 / plant.I2!r}, since a torque on link 2 acts "
                f"only through its own inertia; check the plant's I2 and the B assembly",
        )
        self.assertEqual(
            b[0], [0.0, 0.0],
            "expected the first B row to be zero: this model has no direct velocity input, so "
            "a nonzero entry here means the input was wired to the wrong state",
        )
        self.assertEqual(
            b[1], [0.0, 0.0],
            "expected the second B row to be zero: the input is torque, which cannot move a "
            "position on its own; a nonzero entry means B was built off by one row",
        )


class DiscretisationTests(unittest.TestCase):
    def test_forward_euler_is_identity_plus_a_dt(self):
        a, b = models.linearize(0.30, 0.80)
        ad, bd = models.discretize(a, b, 1e-3, "forward-euler")
        for i in range(4):
            for j in range(4):
                expected = (1.0 if i == j else 0.0) + a[i][j] * 1e-3
                self.assertAlmostEqual(
                    ad[i][j], expected, delta=1e-15,
                    msg=f"expected Ad[{i}][{j}] = I + A*dt = {expected!r}; check the forward-Euler "
                        f"branch, whose only job is that one-term series",
                )
        for i in range(4):
            for j in range(2):
                self.assertAlmostEqual(
                    bd[i][j], b[i][j] * 1e-3, delta=1e-18,
                    msg=f"expected Bd[{i}][{j}] = B*dt = {b[i][j] * 1e-3!r}; check that the "
                        f"forward-Euler branch scales B by dt rather than copying it",
                )

    def test_semi_implicit_position_uses_the_new_velocity(self):
        a, b = models.linearize(0.30, 0.80)
        dt = 1e-3
        ad, bd = models.discretize(a, b, dt, "semi-implicit")
        # One linear step, and the plant's own one step, agree about an equilibrium.
        holding = plant.gravity_torque(0.30, 0.80)
        dx = [1e-6, 0.0, 0.0, 0.0]
        linear = [sum(ad[i][j] * dx[j] for j in range(4)) for i in range(4)]
        state = plant.step_arm((0.30 + 1e-6, 0.80, 0.0, 0.0), holding, dt=dt)
        self.assertAlmostEqual(
            linear[0], state[0] - 0.30, delta=1e-12,
            msg=f"expected the linear step's position delta ({linear[0]!r}) to match the "
                f"plant's one step ({state[0] - 0.30!r}); a mismatch means semi-implicit "
                f"position uses the old velocity, which is forward Euler",
        )
        self.assertAlmostEqual(
            linear[2], state[2], delta=1e-12,
            msg=f"expected the linear step's new velocity ({linear[2]!r}) to match the "
                f"plant's ({state[2]!r}) from rest; check the velocity row was updated before "
                f"the position row read it",
        )

    def test_zoh_matches_the_matrix_exponential(self):
        a = [[0.0, 1.0], [-4.0, -1.0]]
        b = [[0.0], [1.0]]
        dt = 0.01
        ad, bd = models.discretize(a, b, dt, "zoh")
        # For this 2x2 the exact exp(A dt) can be checked through its series, term by term.
        expected = [[1.0, 0.0], [0.0, 1.0]]
        term = [[1.0, 0.0], [0.0, 1.0]]
        for k in range(1, 20):
            term = [[(term[0][0] * a[0][0] + term[0][1] * a[1][0]) * dt / k,
                     (term[0][0] * a[0][1] + term[0][1] * a[1][1]) * dt / k],
                    [(term[1][0] * a[0][0] + term[1][1] * a[1][0]) * dt / k,
                     (term[1][0] * a[0][1] + term[1][1] * a[1][1]) * dt / k]]
            for i in range(2):
                for j in range(2):
                    expected[i][j] += term[i][j]
        for i in range(2):
            for j in range(2):
                self.assertAlmostEqual(
                    ad[i][j], expected[i][j], delta=1e-12,
                    msg=f"expected Ad[{i}][{j}] = {expected[i][j]!r} from the 20-term exp(A*dt) "
                        f"series; check the ZOH branch's series truncation and its dt/k scaling",
                )
        self.assertGreater(
            abs(bd[1][0]), 0.0,
            f"expected the ZOH B matrix to be nonzero at [1][0], since exp(A*dt) mixes that "
            f"input into the second state; got {bd[1][0]!r} - check the augmented-matrix solve",
        )

    def test_schemes_differ_and_the_wrong_one_is_unstable(self):
        # A spring-mass oscillator at a step too big for forward Euler: it grows, while the
        # semi-implicit map stays bounded. That is the whole reason the plant integrates the way
        # it does, and why the docstring names the scheme.
        a = [[0.0, 1.0], [-400.0, 0.0]]
        b = [[0.0], [0.0]]
        dt = 0.06
        fe, _ = models.discretize(a, b, dt, "forward-euler")
        si, _ = models.discretize(a, b, dt, "semi-implicit")
        x_fe = models.simulate_linear(fe, b, [1.0, 0.0], [0.0], 200)
        x_si = models.simulate_linear(si, b, [1.0, 0.0], [0.0], 200)
        self.assertGreater(
            abs(x_fe[0]), 10.0,
            f"expected forward Euler at dt=0.06 on a 20 rad/s oscillator to diverge past 10; got "
            f"{abs(x_fe[0]):.3f} - check that branch is I + A*dt and not the symplectic map",
        )
        self.assertLess(
            abs(x_si[0]), 2.0,
            f"expected semi-implicit Euler to stay bounded (|x| < 2) at the same dt; got "
            f"{abs(x_si[0]):.3f} - check the scheme updates velocity before position",
        )


class PlantAgreementTests(unittest.TestCase):
    def test_linear_model_tracks_the_plant_about_an_equilibrium(self):
        for q1, q2 in ((0.30, 0.80), (0.0, 0.0), (1.20, 0.40)):
            result = models.compare_to_plant(q1, q2)
            self.assertLess(
                result["max_state_error"], 1e-9,
                f"expected Level B to track the plant within 1e-9 at q=({q1:.2f}, {q2:.2f}), so "
                f"Level A is not a separate model; got {result['max_state_error']!r} - check the "
                f"equilibrium torque in compare_to_plant",
            )

    def test_step_arm_updates_velocity_before_position(self):
        # The reconciliation in one assertion: position moves by the NEW velocity, so this is
        # semi-implicit (symplectic) Euler, not forward Euler. The two differ by dt^2 * ddq.
        state = (0.20, 0.10, 0.05, -0.02)
        tau = (0.10, -0.05)
        dt = 0.01
        ddq = accelerations(state, tau)
        moved = plant.step_arm(state, tau, dt=dt)
        new_velocity = state[2] + ddq[0] * dt
        self.assertAlmostEqual(
            moved[0], state[0] + new_velocity * dt, delta=1e-12,
            msg=f"expected step_arm to move position with the NEW velocity "
                f"({new_velocity!r}), the symplectic-Euler contract; got {moved[0]!r} - check "
                f"the order of the two updates in step_arm",
        )
        forward_euler = state[0] + state[2] * dt
        self.assertGreater(
            abs(moved[0] - forward_euler), 0.0,
            f"expected the plant's step to differ from forward Euler at dt=0.01 (the two differ "
            f"by dt^2*ddq = {(dt ** 2 * ddq[0])!r}); an exact match means the scheme degraded "
            f"to forward Euler and this file no longer pins the order",
        )


class LevelTableTests(unittest.TestCase):
    REQUIRED = {"name", "status", "entry_point", "state", "input", "includes", "omits",
                "provenance", "use_for"}

    def test_every_level_documents_the_same_fields(self):
        self.assertEqual(
            sorted(models.LEVELS), ["A", "B", "C", "D"],
            f"expected exactly the four levels A-D, got {sorted(models.LEVELS)} - check that a "
            f"level was not renamed or dropped from the table",
        )
        for letter, info in models.LEVELS.items():
            self.assertEqual(
                set(info), self.REQUIRED,
                f"expected level {letter} to document exactly {sorted(self.REQUIRED)}; missing "
                f"{sorted(self.REQUIRED - set(info))}, extra {sorted(set(info) - self.REQUIRED)} "
                f"- the page's level table is generated from these fields",
            )
            self.assertTrue(
                info["includes"] and info["omits"],
                f"expected level {letter} to state both what it includes and what it omits; an "
                f"empty list would promise everything and hide the level's own limits",
            )

    def test_only_a_and_b_claim_implementation(self):
        for letter in ("A", "B"):
            self.assertEqual(
                models.LEVELS[letter]["status"], "implemented",
                f"expected level {letter} to be marked implemented, since its code runs in the "
                f"tests above; got {models.LEVELS[letter]['status']!r} - check the status string",
            )
        self.assertEqual(
            models.LEVELS["C"]["status"], "specified only",
            f"expected level C to be 'specified only', since its code is not in the tree; got "
            f"{models.LEVELS['C']['status']!r} - check the status string the page renders",
        )
        self.assertIn(
            "primitives", models.LEVELS["D"]["status"],
            f"expected level D's status to name primitives, which is all it claims; got "
            f"{models.LEVELS['D']['status']!r} - check the wording against the page's table",
        )

    def test_unknown_level_is_an_error(self):
        with self.assertRaises(KeyError):
            models.level_info("E")


if __name__ == "__main__":
    unittest.main(verbosity=2)
