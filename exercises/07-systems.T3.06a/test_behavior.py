"""Behaviour tests for 07-systems.T3.06a.

Each test names the mistake it catches:
  * a PubSub rate that charges the 14-byte header per variable instead of per frame;
  * a diagnostic coverage returned as a fraction - 0.95 where 95.0 was asked for;
  * a common-cause term multiplied by the number of channels, which is the very assumption
    Category 3 refuses to make;
  * a PLd check with an inclusive upper bound, so 1e-6 passes when the standard excludes it;
  * a discrepancy check with no filter, so normal 12 ms contact skew latches the drive;
  * an AAS map that accepts any string as a NodeId;
  * a reset interlock that restarts the drive the moment the fault clears.
"""

import math
import unittest

import harness

submission = harness.load_submission()

SHELL = {
    "idShort": "MechaArm6DOF_AAS",
    "assetInformation": {"assetKind": "Instance",
                         "globalAssetId": "urn:mechalab:asset:arm6dof:sn0042"},
    "submodels": [{
        "idShort": "TechnicalData",
        "semanticId": "0173-1#01-AFZ615#016",
        "submodelElements": [
            {"idShort": "MaxPayloadKg", "valueType": "xs:double", "value": 3.0,
             "opcUaNodeId": "ns=2;s=Arm.MaxPayloadKg"},
            {"idShort": "SupplyVoltageV", "valueType": "xs:double", "value": 48.0,
             "opcUaNodeId": "ns=2;i=1042"},
        ],
    }],
}


class OpcUaRateTests(unittest.TestCase):
    def test_the_skip_test_rate(self):
        # 8 doubles at 250 Hz with a 14-byte network-message header: 78 * 250 = 19500 B/s.
        self.assertEqual(
            submission.opc_ua_pubsub_rate_bps(8, 250), 19500,
            msg="expected 19500 B/s for 8 doubles at 250 Hz; 18000 likely dropped the 14-byte "
                "header - check the frame is header plus payload",
        )

    def test_the_header_is_paid_once_per_frame(self):
        one = submission.opc_ua_pubsub_rate_bps(1, 1000)
        many = submission.opc_ua_pubsub_rate_bps(8, 1000)
        self.assertEqual(
            one, 22000,
            msg="expected 22000 B/s for one 8-byte value at 1 kHz including one header; 8000 "
                "likely left the header out - check 14 + 8 bytes per frame",
        )
        self.assertEqual(
            many, 78000,
            msg="expected 78000 B/s for eight values at 1 kHz; a much larger number likely "
                "charged the 14-byte header to every variable - check the header is per frame",
        )
        self.assertEqual(
            many - one, 7 * 8000,
            msg="expected each extra variable to add only its 8 bytes per frame, 56000 B/s for "
                "seven; a bigger step likely counted a header per variable - check the slope",
        )

    def test_a_negative_rate_is_refused(self):
        with self.assertRaises(ValueError):
            submission.opc_ua_pubsub_rate_bps(4, -1)
        with self.assertRaises(ValueError):
            submission.opc_ua_pubsub_rate_bps(-1, 100)


class DiagnosticCoverageTests(unittest.TestCase):
    def test_the_skip_test_coverage(self):
        self.assertAlmostEqual(
            submission.diagnostic_coverage_pct(95.0, 5.0), 95.0, delta=1e-9,
            msg="expected 95 percent coverage from 95 detected and 5 undetected failures; 0.95 "
                "means the answer is a fraction - check the factor of 100",
        )

    def test_the_result_is_a_percentage(self):
        self.assertAlmostEqual(
            submission.diagnostic_coverage_pct(60.0, 40.0), 60.0, delta=1e-9,
            msg="expected 60 percent when 60 of 100 failures are detected; 0.6 likely skipped the "
                "hundred - check the result is reported in percent",
        )
        self.assertAlmostEqual(
            submission.diagnostic_coverage_pct(1.0, 1.0), 50.0, delta=1e-9,
            msg="expected an even split to give 50 percent; 0.5 or 200 likely used the wrong "
                "denominator - check lambda_dd over the total",
        )

    def test_an_empty_subsystem_is_refused(self):
        with self.assertRaises(ValueError):
            submission.diagnostic_coverage_pct(0.0, 0.0)


class CommonCauseTests(unittest.TestCase):
    def test_the_skip_test_ccf(self):
        self.assertAlmostEqual(
            submission.pfh_common_cause(2.0e-7, 0.02), 4.0e-9, delta=1e-15,
            msg="expected 4e-9 per hour for beta = 0.02 on 2e-7; 8e-9 likely doubled the term "
                "per channel - check common cause is beta * lambda_du",
        )

    def test_the_ccf_is_not_doubled(self):
        # beta * lambda_du, never 2 * beta * lambda_du: common cause is common, it is not per channel.
        self.assertAlmostEqual(
            submission.pfh_common_cause(1.0e-7, 0.05), 5.0e-9, delta=1e-16,
            msg="expected 5e-9, not 1e-8, for two channels at beta = 0.05; the larger value "
                "likely multiplied by the channel count - check the common term is counted once",
        )

    def test_a_bad_factor_is_refused(self):
        for beta in (1.5, -0.1):
            with self.assertRaises(ValueError):
                submission.pfh_common_cause(1.0e-7, beta)


class PLdTests(unittest.TestCase):
    def test_the_worked_pfh_meets_pld(self):
        self.assertTrue(
            submission.pld_ok(2.4e-7),
            msg="expected 2.4e-7 per hour to sit inside the PLd band; False likely used a "
                "tighter upper bound such as 1e-7 - check the band is [1e-7, 1e-6)",
        )
        self.assertTrue(
            submission.pld_ok(1e-7),
            msg="expected the inclusive lower bound 1e-7 to pass; False likely used a strict > "
                "at the bottom - check the range starts at 1e-7",
        )

    def test_the_upper_bound_is_exclusive(self):
        self.assertFalse(
            submission.pld_ok(1e-6),
            msg="expected exactly 1e-6 to fail, because the standard's band is open at the top; "
                "True likely used <= - check the upper comparison is strict",
        )
        self.assertFalse(
            submission.pld_ok(1.1e-6),
            msg="expected 1.1e-6 to fail as above the PLd band; True likely compared against "
                "the PLe ceiling - check the bound is 1e-6 per hour",
        )
        self.assertTrue(
            submission.pld_ok(9.9e-7),
            msg="expected 9.9e-7 to pass just below the ceiling; False likely rounded the "
                "threshold down - check the exclusive bound still admits this value",
        )
        self.assertFalse(
            submission.pld_ok(1e-8),
            msg="expected 1e-8 to fail as below the PLd band, since that is better than PLd; "
                "True likely only tested the upper bound - check both ends",
        )


class StoEvaluatorTests(unittest.TestCase):
    def test_a_welded_second_channel_still_removes_torque(self):
        state = submission.sto_evaluate(True, False, 25.0)
        self.assertTrue(
            state["torque_removed"],
            msg="expected one safe channel to remove torque; False likely required both "
                "channels, which is Category 4 wiring - check torque_removed is an OR",
        )
        self.assertTrue(
            state["discrepancy_fault"],
            msg="expected a 25 ms disagreement past the 20 ms filter to latch; False likely "
                "compared against the wrong window - check discrepancy_ms > t_disc_max_ms",
        )
        self.assertFalse(
            state["can_enable"],
            msg="expected the drive to stay disabled after a discrepancy fault; True likely "
                "looked only at the channels - check can_enable excludes the fault",
        )

    def test_normal_contact_skew_is_not_a_fault(self):
        # The module's exercise: Channel B opens 12 ms late, inside the 20 ms filter.
        state = submission.sto_evaluate(True, False, 12.0)
        self.assertTrue(
            state["torque_removed"],
            msg="expected torque to be removed as soon as Channel A opens; False likely waited "
                "for agreement - check torque removal does not depend on the filter",
        )
        self.assertFalse(
            state["discrepancy_fault"],
            msg="expected 12 ms of contact skew inside the 20 ms filter not to latch; True "
                "likely compared without the filter - check the window",
        )
        self.assertFalse(
            state["can_enable"],
            msg="expected one channel still out to keep motion off even without a fault; True "
                "likely enabled on a cleared discrepancy - check can_enable needs both released",
        )

    def test_both_channels_released_enables_the_drive(self):
        state = submission.sto_evaluate(False, False, 0.0)
        self.assertFalse(
            state["torque_removed"],
            msg="expected both channels released to leave torque available; True likely inverted "
                "the safe-channel flags - check ch_a_safe or ch_b_safe",
        )
        self.assertTrue(
            state["can_enable"],
            msg="expected both channels released to enable the drive; False likely kept a "
                "latched fault from an earlier call - check the state is built fresh",
        )

    def test_both_channels_safe_is_not_a_fault(self):
        state = submission.sto_evaluate(True, True, 30.0)
        self.assertTrue(
            state["torque_removed"],
            msg="expected both channels safe to remove torque; False likely required a "
                "disagreement as well - check removal is independent of the fault",
        )
        self.assertFalse(
            state["discrepancy_fault"],
            msg="expected agreeing channels never to raise a discrepancy, even after 30 ms; "
                "True likely tested the elapsed time alone - check the channels differ first",
        )

    def test_a_negative_filter_is_refused(self):
        with self.assertRaises(ValueError):
            submission.sto_evaluate(True, False, 5.0, t_disc_max_ms=-1.0)


class AasTests(unittest.TestCase):
    def test_every_element_maps_to_a_node_id(self):
        self.assertEqual(
            submission.aas_opcua_nodes(SHELL),
            ["ns=2;s=Arm.MaxPayloadKg", "ns=2;i=1042"],
            msg="expected both NodeIds in submodel order; a shorter list likely dropped the "
                "numeric-id element - check every element is mapped, not just string ids",
        )

    def test_a_bare_string_is_not_a_node_id(self):
        broken = {"submodels": [{"submodelElements": [{"idShort": "X", "opcUaNodeId": "Arm.X"}]}]}
        with self.assertRaises(ValueError):
            submission.aas_opcua_nodes(broken)
        wrong_ns = {"submodels": [{"submodelElements": [{"opcUaNodeId": "ns=;s=Arm.X"}]}]}
        with self.assertRaises(ValueError):
            submission.aas_opcua_nodes(wrong_ns)

    def test_a_shell_without_submodels_is_refused(self):
        with self.assertRaises(ValueError):
            submission.aas_opcua_nodes({"idShort": "empty"})


class ResetTests(unittest.TestCase):
    def test_a_latched_fault_blocks_restart(self):
        self.assertFalse(
            submission.reset_interlock(False, False, fault_latched=True, reset_pressed=True),
            msg="expected a latched fault to block restart even with a press; True likely "
                "returned before reading the latch - check the fault is consulted",
        )

    def test_no_automatic_restart(self):
        self.assertFalse(
            submission.reset_interlock(False, False, fault_latched=False, reset_pressed=False),
            msg="expected the drive never to restart on its own, with no press; True likely "
                "returned can_enable - check a deliberate press is required",
        )

    def test_a_deliberate_press_grants_restart(self):
        self.assertTrue(
            submission.reset_interlock(False, False, fault_latched=False, reset_pressed=True),
            msg="expected a clear fault plus a deliberate press to allow restart; False likely "
                "required an extra reset edge - check the interlock's two conditions",
        )

    def test_a_press_while_a_channel_is_still_out_is_refused(self):
        self.assertFalse(
            submission.reset_interlock(True, False, fault_latched=False, reset_pressed=True),
            msg="expected a press with one channel still safe to be refused; True likely "
                "ignored the channel flags - check both must be released",
        )
        self.assertFalse(
            submission.reset_interlock(True, True, fault_latched=False, reset_pressed=True),
            msg="expected a press with both channels safe to be refused; True likely treated "
                "agreement as enough - check neither channel may be safe",
        )


if __name__ == "__main__":
    unittest.main()
