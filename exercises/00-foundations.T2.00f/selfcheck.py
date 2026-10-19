"""Browser self-check for 00-foundations.T2.00f.

Appended verbatim to the workbench entry, after the learner's code. Stdlib-only, one PASS line.
"""


def _selfcheck():
    checks = 0

    assert nyquist_hz(4000.0) == 2000.0, "Nyquist is half the rate"
    assert nyquist_hz(1000.0) == 500.0, "Nyquist scales with the rate"
    checks += 1

    assert abs(alias_hz(3150.0, 4000.0) - 850.0) < 1e-12, "one fold with a mirror"
    assert abs(alias_hz(2700.0, 2000.0) - 700.0) < 1e-12, "a remainder below Nyquist is untouched"
    assert abs(alias_hz(9000.0, 4000.0) - 1000.0) < 1e-12, "a large tone folds back inside"
    checks += 1

    assert abs(alias_hz(100.0, 4000.0) - 100.0) < 1e-12, "below Nyquist passes through"
    assert abs(alias_hz(2000.0, 4000.0) - 2000.0) < 1e-12, "Nyquist itself is unchanged"
    assert abs(alias_hz(3000.0, 4000.0) - 1000.0) < 1e-12, "the mirror half folds down"
    assert abs(alias_hz(1000.0, 4000.0) - alias_hz(3000.0, 4000.0)) < 1e-12, "the seam is exact"
    checks += 1

    for bad in (0.0, -1.0):
        try:
            nyquist_hz(bad)
        except ValueError:
            pass
        else:
            raise AssertionError("a non-positive sample rate must be refused")
    checks += 1

    print("SELF-CHECK PASS: %d checks - Nyquist at two rates, folding and mirroring, the seam, "
          "and the refusal of a non-positive rate" % checks)


_selfcheck()
