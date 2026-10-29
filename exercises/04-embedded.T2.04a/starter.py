"""Exercise 04-embedded.T2.04a - the learner's file.

The SPI frame time with and without chip-select overhead, the CPU a polled UART write burns, the
fraction of a tick that busy time eats, the ping-pong window and HT rate, and which half of a
circular DMA buffer an ISR may read. Fill the seven TODOs:

    EXERCISE_TARGET=exercises/04-embedded.T2.04a/starter.py \
        python3 -m unittest discover -s exercises/04-embedded.T2.04a -p 'test_*.py'
"""

DEFAULT_CS_US = 0.4


def spi_shift_us(n_bits, f_sclk_hz):
    """The time the clock alone takes for this many bits, in microseconds."""
    raise NotImplementedError("TODO 1: the clock time for this many bits, in microseconds")


def spi_frame_us(n_bits, f_sclk_hz, t_cs_us=DEFAULT_CS_US):
    """The whole frame, chip-select included, in microseconds."""
    raise NotImplementedError("TODO 2: the whole frame, chip-select included, in microseconds")


def uart_poll_us(n_bits, baud):
    """The CPU time a blocking polled write wastes, in microseconds."""
    raise NotImplementedError("TODO 3: the CPU time the blocking write costs, in microseconds")


def cpu_load_fraction(t_busy_us, t_loop_us):
    """Busy time as a fraction of the loop period."""
    raise NotImplementedError("TODO 4: the share of the loop period this busy time takes")


def ping_pong_window_us(n_half, f_adc_hz):
    """The time the CPU has to read one buffer slice, in microseconds."""
    raise NotImplementedError("TODO 5: how long the CPU has to read one buffer slice, in microseconds")


def ht_frequency_hz(f_sample_hz, n_half):
    """How often the buffer's mid-point interrupt fires."""
    raise NotImplementedError("TODO 6: how often the buffer's mid-point interrupt fires")


def buffer_slice_for_position(write_pos, n_half):
    """The readable buffer slice, or None mid-slice."""
    raise NotImplementedError(
        "TODO 7: the buffer slice the ISR may read at this position, or None while it is mid-slice"
    )


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
