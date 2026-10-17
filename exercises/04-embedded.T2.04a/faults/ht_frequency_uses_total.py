"""Planted fault: the Half-Transfer rate is divided by the full 2N buffer.

Reports 1000 Hz for the skip test's 64 kHz / 32-sample case instead of 2000 Hz, so the ISR is
budgeted as if it fired once per full cycle.

Generated from `solution.py` with one edit; `exercise.json` names the test it must fail.
"""

DEFAULT_CS_US = 0.4


def _positive(value, name):
    if value <= 0.0:
        raise ValueError("%s must be positive, not %r" % (name, value))
    return value


def spi_shift_us(n_bits, f_sclk_hz):
    """t_shift = B_bits / f_sclk in microseconds: the clocks alone, no chip-select."""
    _positive(n_bits, "a frame's bit count")
    _positive(f_sclk_hz, "the SPI clock")
    return (n_bits / f_sclk_hz) * 1e6


def spi_frame_us(n_bits, f_sclk_hz, t_cs_us=DEFAULT_CS_US):
    """t_spi = B_bits / f_sclk + t_cs: chip-select setup and hold is part of the frame."""
    if t_cs_us < 0.0:
        raise ValueError("chip-select overhead cannot be negative")
    return spi_shift_us(n_bits, f_sclk_hz) + t_cs_us


def uart_poll_us(n_bits, baud):
    """The CPU time a blocking write wastes: every bit stalls the loop, DMA or not."""
    _positive(n_bits, "a packet's bit count")
    _positive(baud, "the baud rate")
    return (n_bits / baud) * 1e6


def cpu_load_fraction(t_busy_us, t_loop_us):
    """Busy CPU time as a fraction of the loop period; above 1.0 the loop cannot keep up."""
    if t_busy_us < 0.0:
        raise ValueError("busy time cannot be negative")
    _positive(t_loop_us, "the loop period")
    return t_busy_us / t_loop_us


def ping_pong_window_us(n_half, f_adc_hz):
    """How long the CPU has to read one half: N samples, each 1/f_adc apart."""
    _positive(n_half, "the half-buffer length")
    _positive(f_adc_hz, "the ADC sample rate")
    return (n_half / f_adc_hz) * 1e6


def ht_frequency_hz(f_sample_hz, n_half):
    """Half-Transfer interrupts arrive every N samples, so f_HT = f_sample / N."""
    _positive(f_sample_hz, "the ADC sample rate")
    _positive(n_half, "the half-buffer length")
    return f_sample_hz / (2.0 * n_half)


def buffer_slice_for_position(write_pos, n_half):
    """The half the ISR may read when the DMA has just written index `write_pos`."""
    _positive(n_half, "the half-buffer length")
    if isinstance(write_pos, bool) or not isinstance(write_pos, int):
        raise ValueError("the write position is an integer index, not %r" % (write_pos,))
    total = 2 * n_half
    if not 0 <= write_pos < total:
        raise ValueError("write position %d is outside a %d-sample buffer" % (write_pos, total))
    if write_pos == n_half - 1:
        return (0, n_half)
    if write_pos == total - 1:
        return (n_half, total)
    return None
