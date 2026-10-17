"""Browser self-check for 00-foundations.T1.00b.

Appended verbatim to the workbench entry, after the learner's code. Stdlib-only, constant time,
one PASS line.
"""


def _selfcheck():
    checks = 0

    window = timestamps(0.0, 0.1, 5)
    assert len(window) == 5, "five samples in, five timestamps out"
    assert abs(window[-1] - 0.4) < 1e-12, "the last index is n - 1, not n"
    assert abs(timestamps(0.0, 0.002, 501)[500] - 1.0) < 1e-12, "2 ms grid, sample 500"
    checks += 1

    trace = scaled_readings([0.0, 0.1, 0.2, 0.3, 0.4], {"slope": 3.0, "offset": 0.5})
    assert abs(trace[0] - 0.5) < 1e-12 and abs(trace[-1] - 1.7) < 1e-12, "the worked trace"
    assert abs(mean_of(trace) - 1.10) < 1e-12, "worked mean"
    assert abs(peak_to_peak(trace) - 1.20) < 1e-12, "worked span, max minus min"
    checks += 1

    err = errors([1.0, 2.0, 3.0, 4.0], [0.9, 2.1, 2.8, 4.2])
    assert abs(sum(err)) < 1e-12, "the signed errors cancel to zero"
    assert abs(rmse([1.0, 2.0, 3.0, 4.0], [0.9, 2.1, 2.8, 4.2]) - 0.1581139) < 1e-6, "sqrt(0.025)"
    checks += 1

    assert git_command("which lines changed") == "git diff", "the Skip test's answer"
    assert git_command("which files changed") == "git status"
    checks += 1

    print("SELF-CHECK PASS: %d checks - the zero-indexed timestamp grid, the dictionary-calibrated "
          "trace with its mean and peak-to-peak span, the zip()-paired error list with a squared "
          "RMS, and the Git command lookup" % checks)


_selfcheck()
