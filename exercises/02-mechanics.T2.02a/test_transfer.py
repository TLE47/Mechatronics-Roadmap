"""Transfer tests for 02-mechanics.T2.02a - a payload, graded on behaviour.

The module's Transfer task is a changed scenario, not the worked-example pose with new numbers:
put a mass at the tip of the capstone's own figure-8, feed its torque forward with J^T, and compare
the run against the same run without the feedforward. These tests check the *claim* (the compensated
run stays at the capstone's error and the uncompensated one does not) and then move the payload, so
a submission tuned to 0.20 kg does not pass.
"""

import unittest

import harness

submission = harness.load_submission()

BASELINE_RMS_MM = 0.9130
BASELINE_PEAK_MM = 2.4016


class PayloadRunTests(unittest.TestCase):
    def test_compensated_run_reproduces_the_capstone(self):
        run = submission.payload_run(0.20, True)
        self.assertLess(
            run["rms_mm"], BASELINE_RMS_MM + 0.001,
            msg="expected J^T feedforward to leave the capstone's 0.913 mm RMS error untouched, "
                "within a micron; a larger error means the compensation fights the controller - "
                "check the sign of the feedforward term",
        )
        self.assertLess(
            run["peak_mm"], BASELINE_PEAK_MM + 0.001,
            msg="expected the compensated run's worst excursion to stay at the capstone's 2.402 "
                "mm; a larger peak means the feedforward adds to the error instead of cancelling "
                "it at the hardest point of the figure-8",
        )

    def test_uncompensated_run_is_much_worse(self):
        on = submission.payload_run(0.20, True)
        off = submission.payload_run(0.20, False)
        self.assertGreater(
            off["rms_mm"], 2.5 * on["rms_mm"],
            msg="expected removing the feedforward to cost millimetres rather than microns, more "
                "than 2.5 times the compensated error; a smaller ratio means the payload torque "
                "never reached the run - check the mass is applied to the tip",
        )
        self.assertGreater(
            off["peak_mm"], 1.5 * on["peak_mm"],
            msg="expected the uncompensated peak to exceed 1.5 times the compensated one, so the "
                "degradation is visible in the worst excursion too; a smaller ratio means only "
                "the average moved - check the peak is measured on the same trace",
        )

    def test_a_heavier_payload_is_still_compensated(self):
        # The changed-input case: a 0.35 kg tip mass, with the compensation written for 0.20 kg
        # already in place, must still track. If the submission hard-coded 0.20 the claim breaks.
        on = submission.payload_run(0.35, True)
        off = submission.payload_run(0.35, False)
        self.assertLess(
            on["rms_mm"], BASELINE_RMS_MM + 0.25,
            msg="expected a 0.35 kg tip mass to stay near the capstone's error, within a quarter "
                "millimetre; a larger error means the compensation was tuned to the 0.20 kg case "
                "- check the mass reaches the torque term",
        )
        self.assertGreater(
            off["rms_mm"], 1.8 * on["rms_mm"],
            msg="expected the heavier uncompensated run to be at least 1.8 times worse, showing "
                "the feedforward still carries the load; a smaller ratio means both runs already "
                "failed and the comparison has no content",
        )


if __name__ == "__main__":
    unittest.main()
