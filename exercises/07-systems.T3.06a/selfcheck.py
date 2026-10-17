"""Browser self-check for 07-systems.T3.06a.

Appended verbatim to the workbench entry, after the learner's code. Stdlib-only, one PASS line.
"""


def _selfcheck():
    checks = 0

    assert opc_ua_pubsub_rate_bps(8, 250) == 19500, "eight doubles at 250 Hz"
    assert opc_ua_pubsub_rate_bps(2, 1000) == 30000, "the header is paid once"
    checks += 1

    assert abs(diagnostic_coverage_pct(95.0, 5.0) - 95.0) < 1e-9, "coverage is a percentage"
    assert abs(pfh_common_cause(2.0e-7, 0.02) - 4.0e-9) < 1e-15, "the CCF term is not doubled"
    assert pld_ok(2.4e-7) and not pld_ok(1e-6) and pld_ok(1e-7), "the PLd band"
    checks += 1

    welded = sto_evaluate(True, False, 25.0)
    assert welded["torque_removed"] and welded["discrepancy_fault"] and not welded["can_enable"]
    skew = sto_evaluate(True, False, 12.0)
    assert skew["torque_removed"] and not skew["discrepancy_fault"], "12 ms is bounce, not a fault"
    assert sto_evaluate(False, False, 0.0)["can_enable"]
    checks += 1

    shell = {"submodels": [{"submodelElements": [
        {"opcUaNodeId": "ns=2;s=Arm.MaxPayloadKg"}, {"opcUaNodeId": "ns=2;i=1042"}]}]}
    assert aas_opcua_nodes(shell) == ["ns=2;s=Arm.MaxPayloadKg", "ns=2;i=1042"]
    try:
        aas_opcua_nodes({"submodels": [{"submodelElements": [{"opcUaNodeId": "Arm.X"}]}]})
    except ValueError:
        pass
    else:
        raise AssertionError("a bare string is not a NodeId")
    checks += 1

    assert not reset_interlock(False, False, True, True), "a latched fault blocks restart"
    assert not reset_interlock(False, False, False, False), "no automatic restart"
    assert reset_interlock(False, False, False, True), "a deliberate press grants restart"
    checks += 1

    print("SELF-CHECK PASS: %d checks - the PubSub byte rate, the AAS NodeId map, the PLd band, "
          "the filtered dual-channel STO and the manual reset interlock" % checks)


_selfcheck()
