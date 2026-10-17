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
        self.assertEqual(submission.opc_ua_pubsub_rate_bps(8, 250), 19500)

    def test_the_header_is_paid_once_per_frame(self):
        one = submission.opc_ua_pubsub_rate_bps(1, 1000)
        many = submission.opc_ua_pubsub_rate_bps(8, 1000)
        self.assertEqual(one, 22000)
        self.assertEqual(many, 78000)
        self.assertEqual(many - one, 7 * 8000)

    def test_a_negative_rate_is_refused(self):
        with self.assertRaises(ValueError):
            submission.opc_ua_pubsub_rate_bps(4, -1)
        with self.assertRaises(ValueError):
            submission.opc_ua_pubsub_rate_bps(-1, 100)


class DiagnosticCoverageTests(unittest.TestCase):
    def test_the_skip_test_coverage(self):
        self.assertAlmostEqual(submission.diagnostic_coverage_pct(95.0, 5.0), 95.0, delta=1e-9)

    def test_the_result_is_a_percentage(self):
        self.assertAlmostEqual(submission.diagnostic_coverage_pct(60.0, 40.0), 60.0, delta=1e-9)
        self.assertAlmostEqual(submission.diagnostic_coverage_pct(1.0, 1.0), 50.0, delta=1e-9)

    def test_an_empty_subsystem_is_refused(self):
        with self.assertRaises(ValueError):
            submission.diagnostic_coverage_pct(0.0, 0.0)


class CommonCauseTests(unittest.TestCase):
    def test_the_skip_test_ccf(self):
        self.assertAlmostEqual(submission.pfh_common_cause(2.0e-7, 0.02), 4.0e-9, delta=1e-15)

    def test_the_ccf_is_not_doubled(self):
        # beta * lambda_du, never 2 * beta * lambda_du: common cause is common, it is not per channel.
        self.assertAlmostEqual(submission.pfh_common_cause(1.0e-7, 0.05), 5.0e-9, delta=1e-16)

    def test_a_bad_factor_is_refused(self):
        for beta in (1.5, -0.1):
            with self.assertRaises(ValueError):
                submission.pfh_common_cause(1.0e-7, beta)


class PLdTests(unittest.TestCase):
    def test_the_worked_pfh_meets_pld(self):
        self.assertTrue(submission.pld_ok(2.4e-7))
        self.assertTrue(submission.pld_ok(1e-7))

    def test_the_upper_bound_is_exclusive(self):
        self.assertFalse(submission.pld_ok(1e-6))
        self.assertFalse(submission.pld_ok(1.1e-6))
        self.assertTrue(submission.pld_ok(9.9e-7))
        self.assertFalse(submission.pld_ok(1e-8))


class StoEvaluatorTests(unittest.TestCase):
    def test_a_welded_second_channel_still_removes_torque(self):
        state = submission.sto_evaluate(True, False, 25.0)
        self.assertTrue(state["torque_removed"])
        self.assertTrue(state["discrepancy_fault"])
        self.assertFalse(state["can_enable"])

    def test_normal_contact_skew_is_not_a_fault(self):
        # The module's exercise: Channel B opens 12 ms late, inside the 20 ms filter.
        state = submission.sto_evaluate(True, False, 12.0)
        self.assertTrue(state["torque_removed"])
        self.assertFalse(state["discrepancy_fault"])
        self.assertFalse(state["can_enable"], "one channel is still out, so motion stays off")

    def test_both_channels_released_enables_the_drive(self):
        state = submission.sto_evaluate(False, False, 0.0)
        self.assertFalse(state["torque_removed"])
        self.assertTrue(state["can_enable"])

    def test_both_channels_safe_is_not_a_fault(self):
        state = submission.sto_evaluate(True, True, 30.0)
        self.assertTrue(state["torque_removed"])
        self.assertFalse(state["discrepancy_fault"])

    def test_a_negative_filter_is_refused(self):
        with self.assertRaises(ValueError):
            submission.sto_evaluate(True, False, 5.0, t_disc_max_ms=-1.0)


class AasTests(unittest.TestCase):
    def test_every_element_maps_to_a_node_id(self):
        self.assertEqual(submission.aas_opcua_nodes(SHELL),
                         ["ns=2;s=Arm.MaxPayloadKg", "ns=2;i=1042"])

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
        self.assertFalse(submission.reset_interlock(False, False, fault_latched=True, reset_pressed=True))

    def test_no_automatic_restart(self):
        self.assertFalse(submission.reset_interlock(False, False, fault_latched=False, reset_pressed=False))

    def test_a_deliberate_press_grants_restart(self):
        self.assertTrue(submission.reset_interlock(False, False, fault_latched=False, reset_pressed=True))

    def test_a_press_while_a_channel_is_still_out_is_refused(self):
        self.assertFalse(submission.reset_interlock(True, False, fault_latched=False, reset_pressed=True))
        self.assertFalse(submission.reset_interlock(True, True, fault_latched=False, reset_pressed=True))


if __name__ == "__main__":
    unittest.main()
