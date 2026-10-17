"""Browser self-check for 01-electronics.T2.01a.

Appended verbatim to the workbench entry, after the learner's code. Stdlib-only, one PASS line.
"""


def _selfcheck():
    checks = 0

    assert abs(shunt_adc_voltage(0.0, 0.003) - 1.65) < 1e-12, "zero current sits at the reference"
    assert abs(shunt_adc_voltage(25.0, 0.003) - 3.15) < 1e-12, "+25 A"
    assert abs(shunt_adc_voltage(-25.0, 0.003) - 0.15) < 1e-12, "-25 A"
    assert abs(shunt_current_from_adc(0.15, 0.003) + 25.0) < 1e-9, "the inverse keeps the sign"
    checks += 1

    assert abs(max_measurable_current(1.65, 3.30, 50.0, 0.001) - 33.0) < 1e-9, "the exercise"
    assert abs(max_measurable_current(1.65, 3.30, 20.0, 0.005) - 16.5) < 1e-9, "the skip test"
    checks += 1

    assert abs(kelvin_gain_error_pct(0.003, 0.0006) - 40.0) < 1e-9, "both pads"
    assert abs(kelvin_gain_error_pct(0.002, 0.0006) - 60.0) < 1e-9
    checks += 1

    assert abs(cmrr_input_error_v(48.0, 93.0) - 1.074586147e-3) < 1e-12, "93 dB of 48 V"
    assert abs(cmrr_current_error_a(48.0, 93.0, 0.003) - 0.358195382) < 1e-9
    checks += 1

    assert adc_code(3.15) == 3909, "4095 counts, not 4096"
    assert adc_code(-1.5) == 0, "and a negative input clips to zero"
    checks += 1

    print("SELF-CHECK PASS: %d checks - the mid-rail shunt stage and its inverse, the current "
          "that clips, the 2-terminal Kelvin error, the CMRR residue in volts and amperes, and "
          "the 12-bit code" % checks)


_selfcheck()
