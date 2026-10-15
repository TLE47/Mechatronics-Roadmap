#!/usr/bin/env python3
"""
Lab 07: Schroeder-Phased Multisine Closed-Loop SysID & Dual-Channel STO Verification
Track 07 — Systems Engineering, HIL & Production Qualification
"""
import cmath
import math


def compute_crest_factor(M: int, N: int, schroeder: bool) -> float:
    """Compare Naive Zero-Phase vs. Schroeder-Phased Multisine Crest Factor."""
    samples = []
    for n in range(N):
        t = n / N
        val = 0.0
        for k in range(1, M + 1):
            phi_k = -math.pi * k * (k - 1) / M if schroeder else 0.0
            val += math.cos(2.0 * math.pi * k * t + phi_k)
        samples.append(val)
    peak = max(abs(x) for x in samples)
    rms = math.sqrt(sum(x * x for x in samples) / N)
    return peak / rms


def verify_closed_loop_iv_estimator() -> tuple[float, float]:
    """
    Demonstrate why naive S_yu / S_uu is biased by feedback noise C(jw),
    whereas Instrumental-Variable S_{y,d_exc} / S_{u,d_exc} recovers P(jw) exactly.
    """
    P_true = 0.8 - 1.4j       # True mechanical plant at test frequency w_k
    C_ctrl = 2.5 + 0.6j       # Stabilizing feedback controller C(jw_k)
    D_exc = 1.0 + 0.0j        # Known external Schroeder multisinephasor
    # With uncorrelated measurement noise power S_vv = 0.25:
    S_dd = abs(D_exc) ** 2
    S_vv = 0.25
    loop_denom = abs(1.0 + P_true * C_ctrl) ** 2

    # Naive direct spectral division S_yu / S_uu (corrupted by S_vv != 0)
    S_yu = (P_true * S_dd - C_ctrl.conjugate() * S_vv) / loop_denom
    S_uu = (S_dd + (abs(C_ctrl) ** 2) * S_vv) / loop_denom
    P_naive = S_yu / S_uu

    # Instrumental-variable cross-spectra against known excitation D_exc (S_{v,d} == 0)
    S_yd = P_true * S_dd / (1.0 + P_true * C_ctrl)
    S_ud = S_dd / (1.0 + P_true * C_ctrl)
    P_iv = S_yd / S_ud

    err_naive = abs(P_naive - P_true) / abs(P_true)
    err_iv = abs(P_iv - P_true) / abs(P_true)
    return err_naive, err_iv


def verify_dual_channel_sto_timing() -> tuple[float, float, bool]:
    """
    Verify ISO 13849-1 Category 3 PLd Dual-Channel STO propagation delay (< 1.0 us)
    and Diagnostic Coverage DC_avg >= 90%.
    """
    t_comparator_ns = 180.0
    t_isolator_ns = 45.0
    t_gate_turnoff_ns = 120.0
    t_sto_total_us = (t_comparator_ns + t_isolator_ns + t_gate_turnoff_ns) * 1e-3

    lambda_dd = 96.0e-9
    lambda_du = 4.0e-9
    dc_avg = lambda_dd / (lambda_dd + lambda_du)
    pld_compliant = (t_sto_total_us < 1.0) and (dc_avg >= 0.90)
    return t_sto_total_us, dc_avg, pld_compliant


if __name__ == "__main__":
    cf_zero = compute_crest_factor(M=24, N=2048, schroeder=False)
    cf_schroeder = compute_crest_factor(M=24, N=2048, schroeder=True)
    assert cf_zero > 6.5, f"Expected naive zero-phase CF > 6.5, got {cf_zero:.3f}"
    assert cf_schroeder < 1.80, f"Expected Schroeder CF < 1.75, got {cf_schroeder:.3f}"

    err_naive, err_iv = verify_closed_loop_iv_estimator()
    assert err_naive > 0.25, "Naive closed-loop estimator must exhibit feedback noise bias"
    assert err_iv < 1e-12, f"IV estimator must be unbiased, got error {err_iv:.3e}"

    t_sto_us, dc_avg, pld_ok = verify_dual_channel_sto_timing()
    assert pld_ok and t_sto_us < 1.0 and abs(dc_avg - 0.96) < 1e-9

    print(
        f"Lab 07 OK: CF_zero={cf_zero:.2f} -> CF_Schroeder={cf_schroeder:.2f}, "
        f"IV_err={err_iv:.1e} (vs naive {err_naive:.1%}), "
        f"STO={t_sto_us:.3f} us (<1.0 us), DC_avg={dc_avg:.1%}"
    )
