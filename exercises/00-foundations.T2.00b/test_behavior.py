"""Behaviour tests for 00-foundations.T2.00b.

Each test names the mistake it catches:
  * a cross product that is `b x a` in disguise (right sign on one example, wrong everywhere else);
  * an axial force computed on the raw lever instead of its unit direction - a longer lever then
    multiplies the force, which no physical wrench does;
  * a determinant with a plus where the minus belongs (every non-symmetric basis passes, once);
  * a basis solve that returns inf/nan instead of refusing a singular pair;
  * a moment hard-coded to the worked example.
"""

import math
import unittest

import harness

submission = harness.load_submission()


def close(test, got, want, delta=1e-9):
    test.assertAlmostEqual(
        got, want, delta=delta,
        msg="expected the computed value to match the worked number in this test at the stated "
            "delta; a mismatch means the formula, a sign or the component order differs - check "
            "the expression the assertion wraps",
    )


class DotTests(unittest.TestCase):
    def test_worked_projection(self):
        force = [0.0, -20.0, 15.0]
        lever = [0.30, 0.40, 0.00]
        close(self, submission.axial_force(force, lever), -16.0, 1e-9)

    def test_projection_does_not_scale_with_lever_length(self):
        force = [0.0, -20.0, 15.0]
        short = submission.axial_force(force, [0.30, 0.40, 0.00])
        long = submission.axial_force(force, [3.0, 4.0, 0.00])
        close(self, long, short, 1e-12)

    def test_perpendicular_force_has_no_axial_component(self):
        close(self, submission.axial_force([0.0, 0.0, 5.0], [1.0, 1.0, 0.0]), 0.0, 1e-12)

    def test_uses_every_component(self):
        a = [1.0, 2.0, 3.0]
        b = [4.0, -5.0, 6.0]
        close(self, submission.dot3(a, b), 4.0 - 10.0 + 18.0, 1e-12)
        close(self, submission.dot3(b, a), submission.dot3(a, b), 1e-12)


class CrossTests(unittest.TestCase):
    def test_worked_moment(self):
        moment = submission.moment([0.30, 0.40, 0.00], [0.0, -20.0, 15.0])
        for got, want in zip(moment, [6.0, -4.5, -6.0]):
            close(self, got, want)

    def test_is_antisymmetric(self):
        a = [0.2, -0.3, 0.7]
        b = [1.1, 0.4, -0.5]
        ab = submission.cross3(a, b)
        ba = submission.cross3(b, a)
        for x, y in zip(ab, ba):
            close(self, x, -y)

    def test_is_orthogonal_to_both_inputs(self):
        a = [0.2, -0.3, 0.7]
        b = [1.1, 0.4, -0.5]
        c = submission.cross3(a, b)
        close(self, submission.dot3(c, a), 0.0, 1e-12)
        close(self, submission.dot3(c, b), 0.0, 1e-12)

    def test_parallel_vectors_have_no_moment(self):
        c = submission.cross3([0.1, 0.2, 0.3], [0.2, 0.4, 0.6])
        for value in c:
            close(self, value, 0.0, 1e-12)


class BasisTests(unittest.TestCase):
    def test_determinant_and_singular_pair(self):
        close(self, submission.det2([3.0, 1.5], [2.0, 4.0]), 9.0, 1e-12)
        close(self, submission.det2([1.0, 2.0], [2.0, 4.0]), 0.0, 1e-12)
        close(self, submission.det2([0.0, 1.0], [1.0, 0.0]), -1.0, 1e-12)

    def test_coordinates_recover_a_known_combination(self):
        b1 = [2.0, 0.0]
        b2 = [1.0, 1.0]
        vector = [5.0, 3.0]                      # 1*b1 + 3*b2
        c1, c2 = submission.coordinates_in_basis(vector, b1, b2)
        close(self, c1, 1.0)
        close(self, c2, 3.0)

    def test_round_trip_for_a_tilted_basis(self):
        b1 = [1.2, -0.4]
        b2 = [0.3, 1.7]
        vector = [4.0, 2.5]
        rebuilt = submission.in_basis(vector, b1, b2)
        for got, want in zip(rebuilt, vector):
            close(self, got, want)

    def test_singular_basis_is_refused(self):
        with self.assertRaises(ValueError):
            submission.coordinates_in_basis([1.0, 1.0], [1.0, 2.0], [2.0, 4.0])


class MomentPoseTests(unittest.TestCase):
    def test_several_levers_not_one_hardcoded_answer(self):
        cases = [
            ([0.10, 0.00, 0.00], [0.0, -5.0, 0.0], [0.0, 0.0, -0.5]),
            ([0.00, 0.20, 0.00], [4.0, 0.0, 0.0], [0.0, 0.0, -0.8]),
            ([0.00, 0.00, 0.30], [0.0, 2.0, 0.0], [-0.6, 0.0, 0.0]),
        ]
        for lever, force, want in cases:
            got = submission.moment(lever, force)
            for a, b in zip(got, want):
                close(self, a, b, 1e-12)


if __name__ == "__main__":
    unittest.main()
