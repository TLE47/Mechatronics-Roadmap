#!/usr/bin/env python3
"""Lab 01: Half-Bridge Switching Parasitics, Bessel AFE & SAR Charge-Bucket Driver.

Zero-external-dependency pure Python 3 reference simulation & unit test suite.
Exit-code family: typed (0 = all checks pass, 1 = test failure, 2 = usage error).
"""

from __future__ import annotations

import argparse
import cmath
import json
import math
import sys
import unittest


# =============================================================================
# 1. Half-Bridge Switching Loop Parasitic Overshoot & Snubber Model
# =============================================================================

class HalfBridgeSwitchingModel:
    """Models V_DS turn-off voltage spike & RLC ringing on a 48V 30A inverter stage."""

    def __init__(
        self,
        v_bus: float = 48.0,
        i_load: float = 30.0,
        t_fall_s: float = 20.0e-9,
        l_loop_h: float = 1.5e-9,
        c_oss_f: float = 450.0e-12,
        r_damp_ohm: float = 1.8,
        r_ds_on_25c: float = 2.8e-3,
        alpha_temp: float = 0.0045,
    ) -> None:
        self.v_bus = v_bus
        self.i_load = i_load
        self.t_fall_s = t_fall_s
        self.l_loop_h = l_loop_h
        self.c_oss_f = c_oss_f
        self.r_damp_ohm = r_damp_ohm
        self.r_ds_on_25c = r_ds_on_25c
        self.alpha_temp = alpha_temp

    def peak_turnoff_voltage(self) -> float:
        """Peak drain-source voltage V_bus + L_loop * (dI/dt) + underdamped envelope."""
        di_dt = self.i_load / self.t_fall_s
        v_inductive = self.l_loop_h * di_dt
        # Damping ratio of L_loop - C_oss - R_damp tank
        z0 = math.sqrt(self.l_loop_h / self.c_oss_f)
        zeta = 0.5 * self.r_damp_ohm / z0
        overshoot_factor = math.exp(-math.pi * zeta / math.sqrt(max(1e-6, 1.0 - zeta * zeta))) if zeta < 1.0 else 0.0
        return self.v_bus + v_inductive * (1.0 + 0.25 * overshoot_factor)

    def steady_state_thermal_rise(
        self,
        i_rms: float = 15.0,
        f_sw: float = 40.0e3,
        r_th_ja: float = 18.0,
        t_amb_c: float = 25.0,
    ) -> tuple[float, float]:
        """Fixed-point iteration for coupled R_DS(on)(T_j) thermal equilibrium."""
        t_j = t_amb_c
        for _ in range(30):
            r_ds = self.r_ds_on_25c * (1.0 + self.alpha_temp * (t_j - 25.0))
            p_cond = (i_rms**2) * r_ds
            p_sw = 0.5 * self.v_bus * (i_rms * math.sqrt(2.0)) * (2.0 * self.t_fall_s) * f_sw
            p_coss = 0.5 * self.c_oss_f * (self.v_bus**2) * f_sw
            p_total = p_cond + p_sw + p_coss
            t_j = t_amb_c + p_total * r_th_ja
        return t_j - t_amb_c, p_total


# =============================================================================
# 2. 2nd-Order Bessel Anti-Aliasing Filter & SAR ADC Charge Bucket
# =============================================================================

class BesselSecondOrderAFE:
    """2nd-order continuous-time Bessel filter: H(s) = 3 / ((s/w0)^2 + 3*(s/w0) + 3)."""

    def __init__(self, f_3db_hz: float = 120.0e3) -> None:
        # For 2nd-order Bessel, -3 dB frequency occurs at w / w0 = sqrt((sqrt(5)-1)/2) * sqrt(3) ≈ 1.361654
        self.f_3db_hz = f_3db_hz
        self.w0 = (2.0 * math.pi * f_3db_hz) / 1.3616541287

    def transfer(self, f_hz: float) -> complex:
        s_norm = 1j * (2.0 * math.pi * f_hz) / self.w0
        return 3.0 / (s_norm * s_norm + 3.0 * s_norm + 3.0)

    def phase_deg(self, f_hz: float) -> float:
        h = self.transfer(f_hz)
        return math.degrees(cmath.phase(h))

    def group_delay_s(self, f_hz: float) -> float:
        df = 1.0
        p1 = cmath.phase(self.transfer(max(1.0, f_hz - df)))
        p2 = cmath.phase(self.transfer(f_hz + df))
        return -(p2 - p1) / (2.0 * math.pi * (2.0 * df))


class SARChargeBucketModel:
    """Models SAR ADC sample-and-hold charge injection kickback & settling error."""

    def __init__(
        self,
        n_bits: int = 12,
        c_sh_f: float = 10.0e-12,
        c_filt_f: float = 270.0e-12,
        r_filt_ohm: float = 22.0,
    ) -> None:
        self.n_bits = n_bits
        self.c_sh_f = c_sh_f
        self.c_filt_f = c_filt_f
        self.r_filt_ohm = r_filt_ohm

    def settling_error_lsb(self, t_acq_s: float = 250.0e-9) -> float:
        """Compute residual error in LSBs after acquisition window t_acq_s."""
        # Initial charge sharing step drop: delta_V / V_in = C_sh / (C_sh + C_filt)
        initial_droop = self.c_sh_f / (self.c_sh_f + self.c_filt_f)
        # Effective charging time constant through R_filt into C_sh || C_filt
        # plus op-amp refill of C_filt: bounded conservatively by tau = R_filt * C_sh
        # and outer bucket tau_bucket = R_filt * C_filt
        tau_fast = self.r_filt_ohm * (self.c_sh_f * self.c_filt_f) / (self.c_sh_f + self.c_filt_f)
        residual_fraction = initial_droop * math.exp(-t_acq_s / (3.5 * tau_fast))
        return residual_fraction * (2**self.n_bits)


# =============================================================================
# 3. Unit Test Suite (Verifies Track 01 Milestone Gate)
# =============================================================================

class TestLab01ElectronicsAndPower(unittest.TestCase):
    def test_half_bridge_overshoot_and_bad_layout_comparison(self) -> None:
        good_pcb = HalfBridgeSwitchingModel(l_loop_h=1.5e-9)
        bad_pcb = HalfBridgeSwitchingModel(l_loop_h=12.0e-9)

        v_peak_good = good_pcb.peak_turnoff_voltage()
        v_peak_bad = bad_pcb.peak_turnoff_voltage()

        # Acceptance gate: V_DS,peak < 58 V at 48 V bus, 30 A, 20 ns fall time
        self.assertLess(v_peak_good, 58.0)
        # Verify bad layout (12 nH) exceeds 65 V
        self.assertGreater(v_peak_bad, 65.0)

    def test_afe_bessel_phase_lag_and_flat_group_delay(self) -> None:
        afe = BesselSecondOrderAFE(f_3db_hz=120.0e3)
        phase_at_2p5khz = abs(afe.phase_deg(2500.0))
        self.assertLess(phase_at_2p5khz, 2.5)

        # Verify flat group delay across 100 Hz to 30 kHz (< 2% variation)
        gd_low = afe.group_delay_s(100.0)
        gd_mid = afe.group_delay_s(25000.0)
        self.assertLess(abs(gd_mid - gd_low) / gd_low, 0.02)

    def test_sar_charge_bucket_settling_and_thermal_soak(self) -> None:
        bucket = SARChargeBucketModel(n_bits=12, c_sh_f=10e-12, c_filt_f=270e-12, r_filt_ohm=22.0)
        err_lsb = bucket.settling_error_lsb(t_acq_s=250.0e-9)
        self.assertLess(err_lsb, 0.25)

        inverter = HalfBridgeSwitchingModel()
        delta_t, p_loss = inverter.steady_state_thermal_rise(i_rms=15.0, f_sw=40.0e3, r_th_ja=18.0)
        self.assertLess(delta_t, 40.0)
        self.assertGreater(p_loss, 0.5)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Lab 01 Reference Simulation & Unit Tests.\nExit-code family: typed."
    )
    parser.add_argument("--json", action="store_true", help="Output JSON summary")
    args = parser.parse_args(argv)

    suite = unittest.defaultTestLoader.loadTestsFromTestCase(TestLab01ElectronicsAndPower)
    stream = sys.stderr if args.json else sys.stdout
    runner = unittest.TextTestRunner(stream=stream, verbosity=2 if not args.json else 0)
    result = runner.run(suite)

    hb = HalfBridgeSwitchingModel()
    afe = BesselSecondOrderAFE()
    bucket = SARChargeBucketModel()
    dt_c, _ = hb.steady_state_thermal_rise()

    summary = {
        "lab": "01-electronics-and-power",
        "ok": result.wasSuccessful(),
        "tests_run": result.testsRun,
        "v_ds_peak_v": round(hb.peak_turnoff_voltage(), 2),
        "afe_phase_lag_2p5khz_deg": round(abs(afe.phase_deg(2500.0)), 3),
        "sar_error_lsb": round(bucket.settling_error_lsb(), 5),
        "thermal_rise_c": round(dt_c, 2),
    }
    if args.json:
        sys.stdout.write(json.dumps(summary) + "\n")
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    sys.exit(main())
