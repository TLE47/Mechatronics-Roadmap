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
        self.assertLess(run["rms_mm"], BASELINE_RMS_MM + 0.001,
                        "J^T feedforward should leave the capstone run unchanged")
        self.assertLess(run["peak_mm"], BASELINE_PEAK_MM + 0.001)

    def test_uncompensated_run_is_much_worse(self):
        on = submission.payload_run(0.20, True)
        off = submission.payload_run(0.20, False)
        self.assertGreater(off["rms_mm"], 2.5 * on["rms_mm"],
                           "removing the feedforward should cost millimetres, not microns")
        self.assertGreater(off["peak_mm"], 1.5 * on["peak_mm"])

    def test_a_heavier_payload_is_still_compensated(self):
        # The changed-input case: a 0.35 kg tip mass, with the compensation written for 0.20 kg
        # already in place, must still track. If the submission hard-coded 0.20 the claim breaks.
        on = submission.payload_run(0.35, True)
        off = submission.payload_run(0.35, False)
        self.assertLess(on["rms_mm"], BASELINE_RMS_MM + 0.25)
        self.assertGreater(off["rms_mm"], 1.8 * on["rms_mm"])


if __name__ == "__main__":
    unittest.main()
