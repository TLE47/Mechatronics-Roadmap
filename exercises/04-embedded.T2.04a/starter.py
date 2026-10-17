"""Exercise 04-embedded.T2.04a - the learner's file.

The SPI frame time with and without chip-select overhead, the CPU a polled UART write burns, the
fraction of a tick that busy time eats, the ping-pong window and HT rate, and which half of a
circular DMA buffer an ISR may read. Fill the seven TODOs:

    EXERCISE_TARGET=exercises/04-embedded.T2.04a/starter.py \
        python3 -m unittest discover -s exercises/04-embedded.T2.04a -p 'test_*.py'
"""

DEFAULT_CS_US = 0.4


def spi_shift_us(n_bits, f_sclk_hz):
    """Clocks alone: B_bits / f_sclk, in microseconds."""
    raise NotImplementedError("TODO 1: bits over clocks, then scale seconds to microseconds")


def spi_frame_us(n_bits, f_sclk_hz, t_cs_us=DEFAULT_CS_US):
    """The whole frame: the shift time plus the chip-select overhead."""
    raise NotImplementedError("TODO 2: the 0.4 us of chip-select is part of the frame")


def uart_poll_us(n_bits, baud):
    """The CPU time a blocking polled write wastes, in microseconds."""
    raise NotImplementedError("TODO 3: every bit stalls the loop - no division by 8")


def cpu_load_fraction(t_busy_us, t_loop_us):
    """Busy time as a fraction of the loop period."""
    raise NotImplementedError("TODO 4: busy over period, so 322 us in a 50 us loop is 6.44x")


def ping_pong_window_us(n_half, f_adc_hz):
    """The time the CPU has to read one half of the buffer, in microseconds."""
    raise NotImplementedError("TODO 5: N samples, not the 2N total")


def ht_frequency_hz(f_sample_hz, n_half):
    """How often the Half-Transfer interrupt fires."""
    raise NotImplementedError("TODO 6: one interrupt per N samples, so f_sample / N")


def buffer_slice_for_position(write_pos, n_half):
    """Return (start, stop) of the readable half, or None mid-half."""
    raise NotImplementedError(
        "TODO 7: HT at write_pos == N-1 reads Ping [0, N); TC at 2N-1 reads Pong [N, 2N)"
    )


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
