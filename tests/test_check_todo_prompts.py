#!/usr/bin/env python3
"""Tests for `scripts/check_todo_prompts.py`.

The gate exists because a TODO marker that writes the expression can be answered by retyping it —
the learner reported exactly that. These tests pin both halves of the line: the shapes that must be
caught (assignment, call, product, matrix row, code span, and a leak on a wrapped continuation line)
and the prose that must not be (units with a slash, numeric ranges, em dashes).

Run: `python3 tests/test_check_todo_prompts.py` (also wired into the CI verify step).
"""

import importlib.util
import os
import sys
import unittest

sys.dont_write_bytecode = True

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location(
    "check_todo_prompts", os.path.join(ROOT, "scripts", "check_todo_prompts.py")
)
ctp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ctp)


def findings(source):
    return ctp.problems_in(source, "sample.py")


class TodoPromptTests(unittest.TestCase):
    def test_a_goal_in_words_passes(self):
        source = "    # TODO 1: where the wheel is after this tick, from the old position and the distance\n"
        self.assertEqual(
            findings(source), [],
            msg="expected a marker that names the quantity to pass; a finding here means the "
                "gate's shapes flag plain prose and every lesson will be forced into vagueness",
        )

    def test_an_assignment_leaks(self):
        source = "    # TODO 1: Compute new_pos_m = start_pos_m + (wheel_speed * elapsed_sec)\n"
        self.assertTrue(
            findings(source),
            msg="expected an assignment inside a marker to be caught; this is the exact marker "
                "the learner reported, and a pass means `=` is not being read",
        )

    def test_an_arithmetic_recipe_in_words_leaks(self):
        source = "    # TODO 1: multiply the speed by the time step, then add the position\n"
        self.assertTrue(
            findings(source),
            msg="expected the operation in words to be caught; a learner can translate `multiply "
            "... then add` into code without reading the page, which is the copy-paste report",
        )

    def test_a_dotted_api_leaks(self):
        source = "    # TODO 2: the magnitude and the phase, from abs and cmath.phase\n"
        self.assertTrue(
            findings(source),
            msg="expected a dotted API name to be caught; `cmath.phase` is the answer typed out",
        )

    def test_a_builtin_name_leaks(self):
        source = "    # TODO 3: round the result to three decimal places\n"
        self.assertTrue(
            findings(source),
            msg="expected a bare builtin to be caught; a marker naming `round` is a marker the "
            "learner can type",
        )

    def test_a_constant_leaks(self):
        source = "    # TODO 4: a full turn is two pi radians, so convert revolutions per minute\n"
        self.assertTrue(
            findings(source),
            msg="expected `pi` to be caught; the constant is the conversion the exercise asks for",
        )

    def test_a_square_wave_is_prose_not_a_recipe(self):
        source = "    # TODO 6: the duty of a square wave at this setting\n"
        self.assertEqual(
            findings(source), [],
            msg="expected `square wave` to pass; only `squared` and `square root` are recipes",
        )

    def test_naming_the_quantity_passes(self):
        source = "    # TODO 7: where the wheel is after this tick, given its speed and the time elapsed\n"
        self.assertEqual(
            findings(source), [],
            msg="expected a marker that names the result to pass; that is the shape every "
            "rewrite should reach",
        )

    def test_a_bare_marker_leaks(self):
        source = "    # TODO: abs(z) and cmath.phase(z), with no quadrant fix-ups\n"
        self.assertTrue(
            findings(source),
            msg="expected a bare `TODO:` to be scanned; the compact page scaffolds use it, and "
            "leaving it out is how the worst copies stayed invisible",
        )

    def test_a_bare_marker_in_prose_passes(self):
        source = "    # TODO: the size and the angle of this complex number\n"
        self.assertEqual(
            findings(source), [],
            msg="expected a bare marker that names the result to pass",
        )

    def test_a_call_leaks(self):
        source = '    raise NotImplementedError("TODO 2: call math.degrees(angle) on the joint angle")\n'
        self.assertTrue(
            findings(source),
            msg="expected `math.sqrt` to be caught as a call; check the call pattern, which must "
                "require the parenthesis to touch the name so prose like `input (the first)` passes",
        )

    def test_the_raising_code_is_not_read_as_the_marker(self):
        source = '    raise NotImplementedError("TODO 3: the current through the trace, from its resistance")\n'
        self.assertEqual(
            findings(source), [],
            msg="expected the `NotImplementedError(` wrapper to be ignored; reading it as a call "
                "flags every starter in the repository",
        )

    def test_a_spaced_quotient_leaks(self):
        source = "    # TODO 4: one interrupt per N samples, so f_sample / N\n"
        self.assertTrue(
            findings(source),
            msg="expected a spaced `/` between names to be caught; the sample-rate marker in "
                "04-embedded.T2.04a shipped this way and was answerable by retyping",
        )

    def test_a_product_leaks(self):
        source = "    # TODO 5: scale it by 2*pi/60 to reach radians per second\n"
        self.assertTrue(
            findings(source),
            msg="expected `2*pi` to be caught as a product; a pass means powers of ten and "
                "unit constants can still be copied straight out of the marker",
        )

    def test_a_matrix_row_leaks(self):
        source = '    raise NotImplementedError("TODO 1: rows [0, -wz, wy], [wz, 0, -wx]")\n'
        self.assertTrue(
            findings(source),
            msg="expected a bracketed row with signed names to be caught; the skew-matrix starter "
                "handed the whole matrix over and was answered by retyping",
        )

    def test_a_code_span_leaks(self):
        source = "    # TODO 3: reset the mean, then inject `innovation` again\n"
        self.assertTrue(
            findings(source),
            msg="expected a backticked name to be caught; a code span in the marker is code the "
                "learner can paste",
        )

    def test_a_continuation_line_leaks(self):
        source = (
            "    # TODO 2: Update the angle\n"
            "    #         and theta_comp = alpha * (theta_comp + omega_meas * dt)\n"
        )
        self.assertTrue(
            findings(source),
            msg="expected a wrapped continuation line carrying the expression to be caught; the "
                "component-fusion page leaked the whole blend on its second line",
        )

    def test_a_plain_units_slash_passes(self):
        source = "    # TODO 1: convert the wheel speed from RPM to rad/s before using it\n"
        self.assertEqual(
            findings(source), [],
            msg="expected unit notation such as `rad/s` to pass; only a spaced slash is "
                "arithmetic, and flagging units would make the marker unreadable",
        )

    def test_a_numeric_range_passes(self):
        source = "    # TODO 2: duty is a fraction in [0, 1] — refuse a percentage such as 65\n"
        self.assertEqual(
            findings(source), [],
            msg="expected a numeric range to pass; `[0, 1]` is a bound the learner needs, not an "
                "expression to retype",
        )

    def test_a_raise_without_a_marker_leaks(self):
        source = '    raise NotImplementedError("cbf_command: upper = min(u_max, alpha * h_value), then clip")\n'
        self.assertTrue(
            findings(source),
            msg="expected a hole whose prompt is only the NotImplementedError message to be read; "
            "three advanced starters wrote their prompts this way and escaped a TODO-only scan",
        )

    def test_a_multiline_raise_leaks(self):
        source = (
            "    raise NotImplementedError(\n"
            '        "exp_so3: I + (sin t / t) K + ((1 - cos t) / t^2) K^2"\n'
            "    )\n"
        )
        self.assertTrue(
            findings(source),
            msg="expected a wrapped raise message to be read as one prompt, not skipped because "
            "the formula sits on the second line",
        )

    def test_a_raise_that_names_the_result_passes(self):
        source = '    raise NotImplementedError("the angle this encoder reports, even after a rollover")\n'
        self.assertEqual(
            findings(source), [],
            msg="expected a plain result sentence in a raise to pass",
        )

    def test_a_stage_label_marker_is_scanned(self):
        source = (
            "    # TODO 1 (Stage 2 - R2): The Law of Cosines gives the elbow's cosine from the\n"
            "    #         target's distance, then subtract the shoulder bearing for the joint\n"
        )
        self.assertTrue(
            findings(source),
            msg="expected a marker with a parenthesised stage label to be read; the capstone "
                "pages use `TODO 1 (Stage 2 - R2):`, and skipping the label left the worst "
                "recipes outside the gate",
        )

    def test_a_lettered_marker_is_scanned(self):
        source = "    # TODO 3b (Stage 3b - repair): Divide out the measured scale\n"
        self.assertTrue(
            findings(source),
            msg="expected a `3b` marker to be read; the capstone repair steps use lettered "
                "numbers, and the old pattern stopped at the digit",
        )

    def test_an_inverse_tangent_recipe_leaks(self):
        source = "    # TODO 1: the tilt with the two-argument inverse tangent, horizontal pair first\n"
        self.assertTrue(
            findings(source),
            msg="expected the named operation to be caught; `inverse tangent` is the call "
                "the learner needs to find, not retype",
        )

    def test_named_sine_coefficients_pass(self):
        source = "    # TODO 6: the cosine and sine coefficients of this harmonic\n"
        self.assertEqual(
            findings(source), [],
            msg="expected the noun phrase `cosine and sine coefficients` to pass; it names the "
                "quantity, while `take its cosine and sine` is the recipe that must fail",
        )

    def test_an_inverting_amplifier_is_prose(self):
        source = "    # TODO 2: the gain of this inverting amplifier at the corner\n"
        self.assertEqual(
            findings(source), [],
            msg="expected the circuit name `inverting amplifier` to pass; only the operation "
                "(`by inverting the signal`) is a recipe, or every op-amp lesson fails the gate",
        )

    def test_an_integrating_recipe_leaks(self):
        source = "    # TODO 2: advance the angle by integrating the measured rate over one step\n"
        self.assertTrue(
            findings(source),
            msg="expected the gerund `integrating` to be caught; the fusion page gave the "
                "whole update this way without an expression to trigger the old shapes",
        )

    def test_the_finding_points_at_the_marker(self):
        source = "def f():\n    # TODO 7: omega = v / r\n    return 0\n"
        self.assertEqual(
            [finding["line"] for finding in findings(source)], [2],
            msg="expected the finding to name the marker's own line; a wrong number sends the "
                "author to a line that is already fine",
        )


if __name__ == "__main__":
    unittest.main()
