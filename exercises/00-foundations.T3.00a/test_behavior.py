"""Behaviour tests for 00-foundations.T3.00a.

Each test names the mistake it catches:
  * a hat map built with the transposed signs, which is `-w x v` - orthogonal, skew, and backwards;
  * `vee` that reads the three entries without checking the two conditions that make them a vee;
  * a Rodrigues formula that uses `sin(theta) K` instead of `(sin theta / theta) K`, so a rotation
    vector longer than one radian over-rotates and stops being orthogonal;
  * the `(1 - cos theta) / theta^2` coefficient computed directly at a nanoradian, where it is 0/0;
  * an energy rate that forgets the dissipation term, or a sign that says work was stored.
"""

import math
import unittest

import harness

submission = harness.load_submission()


def matvec(a, v):
    return [sum(a[i][j] * v[j] for j in range(3)) for i in range(3)]


def transpose(a):
    return [[a[j][i] for j in range(3)] for i in range(3)]


def det3(a):
    return (a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1])
            - a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0])
            + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]))


def close3(a, b, delta=1e-12):
    return all(abs(a[i][j] - b[i][j]) <= delta for i in range(3) for j in range(3))


def cross(w, v):
    return [w[1] * v[2] - w[2] * v[1], w[2] * v[0] - w[0] * v[2], w[0] * v[1] - w[1] * v[0]]


class HatTests(unittest.TestCase):
    def test_hat_matches_the_cross_product(self):
        for w, v in (([1.5, -2.0, 3.0], [0.4, 0.8, -0.5]),
                     ([0.0, 0.0, 1.0], [1.0, 0.0, 0.0]),
                     ([-3.0, 0.25, 0.0], [0.0, -1.0, 2.0])):
            mine = matvec(submission.hat(w), v)
            theirs = cross(w, v)
            for i in range(3):
                self.assertAlmostEqual(mine[i], theirs[i], delta=1e-12)

    def test_hat_is_skew(self):
        k = submission.hat([0.3, -1.2, 2.5])
        for i in range(3):
            self.assertEqual(k[i][i], 0.0)
            for j in range(3):
                self.assertAlmostEqual(k[i][j] + k[j][i], 0.0, delta=1e-15)

    def test_vee_inverts_hat(self):
        w = [0.7, -0.1, 4.0]
        back = submission.vee(submission.hat(w))
        for i in range(3):
            self.assertAlmostEqual(back[i], w[i], delta=1e-15)

    def test_vee_rejects_a_non_skew_matrix(self):
        with self.assertRaises(ValueError):
            submission.vee([[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]])
        with self.assertRaises(ValueError):
            submission.vee([[0.0, 1.0, 0.0], [1.0, 0.0, 0.0], [0.0, 0.0, 0.0]])


class MatrixTests(unittest.TestCase):
    def test_product_matches_a_hand_calculation(self):
        a = [[1.0, 2.0, 3.0], [4.0, 5.0, 6.0], [7.0, 8.0, 10.0]]
        b = [[1.0, 0.0, 0.0], [0.0, 2.0, 0.0], [0.0, 0.0, 3.0]]
        product = submission.mat3_mul(a, b)
        for i in range(3):
            for j in range(3):
                self.assertAlmostEqual(product[i][j], a[i][j] * b[j][j], delta=1e-12)

    def test_identity_is_neutral(self):
        eye = [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]
        k = submission.hat([1.0, 2.0, 3.0])
        self.assertTrue(close3(submission.mat3_mul(eye, k), k))
        self.assertTrue(close3(submission.mat3_mul(k, eye), k))

    def test_matrix_vector_matches_rows(self):
        a = [[1.0, -2.0, 0.5], [0.0, 3.0, -1.0], [2.0, 0.0, 4.0]]
        v = [1.0, -1.0, 2.0]
        out = submission.mat3_vec(a, v)
        for i in range(3):
            self.assertAlmostEqual(out[i], sum(a[i][j] * v[j] for j in range(3)), delta=1e-15)


class RotationTests(unittest.TestCase):
    def test_half_turn_about_z_sends_x_to_y(self):
        r = submission.exp_so3([0.0, 0.0, math.pi / 2.0])
        out = matvec(r, [1.0, 0.0, 0.0])
        self.assertAlmostEqual(out[0], 0.0, delta=1e-12)
        self.assertAlmostEqual(out[1], 1.0, delta=1e-12)
        self.assertAlmostEqual(out[2], 0.0, delta=1e-12)

    def test_it_is_a_planar_rotation_for_a_z_axis(self):
        theta = 0.7
        r = submission.exp_so3([0.0, 0.0, theta])
        self.assertAlmostEqual(r[0][0], math.cos(theta), delta=1e-12)
        self.assertAlmostEqual(r[0][1], -math.sin(theta), delta=1e-12)
        self.assertAlmostEqual(r[1][0], math.sin(theta), delta=1e-12)
        self.assertAlmostEqual(r[2][2], 1.0, delta=1e-12)

    def test_rotations_are_orthogonal_and_proper(self):
        for phi in ([0.0, 0.0, 0.3], [1.0, 2.0, 3.0], [-2.5, 0.5, 0.0], [0.0, 0.0, math.pi]):
            r = submission.exp_so3(phi)
            self.assertTrue(close3(submission.mat3_mul(transpose(r), r),
                                   [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]], 1e-12),
                            "R^T R must be I for %r" % (phi,))
            self.assertAlmostEqual(det3(r), 1.0, delta=1e-12)

    def test_zero_rotation_is_the_identity(self):
        r = submission.exp_so3([0.0, 0.0, 0.0])
        self.assertTrue(close3(r, [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]], 1e-15))

    def test_tiny_angle_is_still_a_rotation(self):
        phi = [1e-9, -1e-9, 1e-9]
        r = submission.exp_so3(phi)
        self.assertAlmostEqual(det3(r), 1.0, delta=1e-14)
        rtr = submission.mat3_mul(transpose(r), r)
        for i in range(3):
            for j in range(3):
                self.assertAlmostEqual(rtr[i][j], 1.0 if i == j else 0.0, delta=1e-14)
        # First order: R = I + [phi]_x + O(theta^2).
        k = submission.hat(phi)
        for i in range(3):
            for j in range(3):
                expected = (1.0 if i == j else 0.0) + k[i][j]
                self.assertAlmostEqual(r[i][j], expected, delta=1e-17)

    def test_transpose_is_the_inverse_rotation(self):
        phi = [0.4, -1.1, 2.0]
        forward = submission.exp_so3(phi)
        backward = submission.exp_so3([-value for value in phi])
        self.assertTrue(close3(transpose(forward), backward, 1e-12))

    def test_a_full_turn_is_the_identity(self):
        r = submission.exp_so3([0.0, 0.0, 2.0 * math.pi])
        self.assertTrue(close3(r, [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]], 1e-12))


class EnergyTests(unittest.TestCase):
    def test_skew_coupling_transfers_no_power(self):
        x = [0.5, -1.0, 2.0]
        k = submission.hat([1.0, 2.0, -0.5])
        moved = matvec(k, x)
        self.assertAlmostEqual(sum(a * b for a, b in zip(x, moved)), 0.0, delta=1e-15)

    def test_energy_rate_is_the_dot_product(self):
        self.assertAlmostEqual(
            submission.energy_rate([1.0, 2.0, 3.0], [4.0, 5.0, 6.0]), 32.0, delta=1e-12
        )

    def test_dissipation_always_removes_energy(self):
        self.assertAlmostEqual(
            submission.energy_rate([1.0, 2.0, 3.0], [4.0, 5.0, 6.0], 2.0), 30.0, delta=1e-12
        )
        self.assertAlmostEqual(submission.energy_rate([0.0, 0.0, 0.0], [1.0, 1.0, 1.0], 0.5),
                               -0.5, delta=1e-12)


if __name__ == "__main__":
    unittest.main()
