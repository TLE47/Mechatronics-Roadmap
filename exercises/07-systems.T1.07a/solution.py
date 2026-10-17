"""Exercise 07-systems.T1.07a - reference solution.

A deterministic PLC scan, the normally-closed series chain that holds the contactor in, the state
machine that latches a trip, and the sine-sweep measurement that turns a joint's response into a
gain in decibels and a phase lag in degrees.
"""

import math

import mechalab_plant as plant  # noqa: F401  (kept so the submission imports what the module uses)


def scan_frequency_hz(t_read_ms, t_exec_ms, t_write_ms):
    """The scan rate a Read -> Execute -> Write budget allows, in Hz."""
    total_ms = t_read_ms + t_exec_ms + t_write_ms
    if total_ms <= 0.0:
        raise ValueError("a scan needs a positive period")
    if min(t_read_ms, t_exec_ms, t_write_ms) < 0.0:
        raise ValueError("no phase of a scan can take negative time")
    return 1000.0 / total_ms


def safety_chain_ok(*contacts):
    """True only when every series NC contact is closed (1) - one open contact drops the enable."""
    if not contacts:
        raise ValueError("a safety chain needs at least one contact")
    for contact in contacts:
        if contact not in (0, 1, True, False):
            raise ValueError("a contact is healthy (1/True) or open (0/False)")
    return all(bool(contact) for contact in contacts)


def plc_scan_step(state, estop1_nc, estop2_nc, door_nc, start_btn_no, reset_btn_no):
    """One cyclic scan: (next state, power enable). A trip latches until an explicit reset."""
    chain = safety_chain_ok(estop1_nc, estop2_nc, door_nc)
    if not chain:
        return "ESTOP_LATCHED", False
    if state == "ESTOP_LATCHED":
        if reset_btn_no and not start_btn_no:
            return "IDLE", False
        return "ESTOP_LATCHED", False
    if state == "IDLE":
        return ("RUNNING", True) if start_btn_no else ("IDLE", False)
    if state == "RUNNING":
        return "RUNNING", True
    raise ValueError("unknown state %r" % (state,))


def gain_db(amplitude_out, amplitude_in):
    """Empirical magnitude: 20 log10(B / A)."""
    if amplitude_in <= 0.0:
        raise ValueError("the input amplitude must be positive")
    if amplitude_out < 0.0:
        raise ValueError("an amplitude cannot be negative")
    if amplitude_out == 0.0:
        return float("-inf")
    return 20.0 * math.log10(amplitude_out / amplitude_in)


def phase_lag_deg(f_hz, delay_s):
    """Phase lag for a peak delayed by `delay_s`: -360 * f * dt."""
    if f_hz < 0.0:
        raise ValueError("frequency cannot be negative")
    if delay_s < 0.0:
        raise ValueError("a lag cannot be negative")
    return -360.0 * f_hz * delay_s


def sine_amplitude(samples, f_hz, dt_s):
    """Lock-in amplitude: 2 * |mean(y e^{-j w t})|, which rejects every other frequency."""
    if not samples:
        raise ValueError("a measurement needs samples")
    if f_hz <= 0.0 or dt_s <= 0.0:
        raise ValueError("frequency and sample interval must be positive")
    omega = 2.0 * math.pi * f_hz
    n = len(samples)
    re = sum(y * math.cos(omega * k * dt_s) for k, y in enumerate(samples)) / n
    im = sum(y * math.sin(omega * k * dt_s) for k, y in enumerate(samples)) / n
    return 2.0 * math.hypot(re, im)


def db_to_ratio(db):
    """Invert the decibel scale: B/A = 10^(dB / 20)."""
    return 10.0 ** (db / 20.0)


# No `__main__` block on purpose: the browser grades this file's stdout against the appended
# self-check's single PASS line, and a second print here would be a mismatch for a correct answer.
