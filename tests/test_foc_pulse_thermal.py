"""The 30 A burst gate in the Capstone I generator: steady state unchanged, burst checked against 110 C."""

import importlib.util
import sys
from dataclasses import replace
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "08-capstone-projects" / "eda-capstone1-foc-drive" / "generate_foc_pcb_and_bom.py"


def _load():
    spec = importlib.util.spec_from_file_location("generate_foc_pcb_and_bom", SRC)
    mod = importlib.util.module_from_spec(spec)
    # Dataclasses look their module up in sys.modules while the class body runs.
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


def test_steady_state_unchanged_and_one_second_burst_passes():
    gen = _load()
    op = gen.PowerStageOperatingPoint()
    assert gen.solve_power_stage_thermal(op)["steady_state_tj_c"] == 90.92
    pulse = gen.solve_pulse_thermal(op)
    assert pulse["pulse_tj_c"] == 100.81
    assert pulse["pulse_thermal_ok"] is True


def test_five_second_burst_breaches_the_gate():
    gen = _load()
    op = replace(gen.PowerStageOperatingPoint(), t_pulse_s=5.0)
    pulse = gen.solve_pulse_thermal(op)
    assert pulse["pulse_tj_c"] > 110.0
    assert pulse["pulse_thermal_ok"] is False


def test_burst_at_design_current_adds_no_rise():
    gen = _load()
    op = replace(gen.PowerStageOperatingPoint(), i_peak_a=15.0)
    pulse = gen.solve_pulse_thermal(op)
    assert pulse["pulse_power_step_w"] == 0.0
    assert pulse["pulse_tj_c"] == 90.92
