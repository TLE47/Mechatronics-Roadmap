"""Exercise 04-embedded.T1.04a - the learner's file.

Seven functions that move one encoder frame across the Python/C boundary: the range a fixed-width
integer holds, the wrap a `uintN_t` applies, the rollover-safe tick difference, a register edit
that touches only the bits you name, one flag read, and the `<Hhf` frame packed and unpacked.

    EXERCISE_TARGET=exercises/04-embedded.T1.04a/starter.py \
        python3 -m unittest discover -s exercises/04-embedded.T1.04a -p 'test_*.py'
"""


def int_range(bits, signed=False):
    """The (low, high) a fixed-width C integer holds - `int16_t` is (-32768, 32767)."""
    raise NotImplementedError(
        "TODO 1: the lowest and highest value this many bits hold, signed or unsigned")


def wrap_uint(value, bits):
    """What a `uintN_t` keeps when it is assigned `value`."""
    raise NotImplementedError(
        "TODO 2: the value this width keeps")


def elapsed_unsigned(now, prev, bits):
    """The tick difference that survives a counter rollover."""
    raise NotImplementedError(
        "TODO 3: the ticks since the previous reading, even across a rollover")


def apply_bits(reg, set_mask=0, clear_mask=0):
    """The register with the named bits set and the named bits cleared."""
    raise NotImplementedError(
        "TODO 4: the register with those bits set and those bits cleared")


def bit_is_set(reg, bit):
    """One flag read as 0 or 1."""
    raise NotImplementedError(
        "TODO 5: whether that one bit is set")


def pack_telemetry(tick, count, vel):
    """The MCU's 8-byte `<Hhf` frame: uint16 tick, int16 count, float velocity."""
    raise NotImplementedError(
        "TODO 6: the little-endian frame the UART sends")


def unpack_telemetry(raw):
    """The same frame read back as (tick, count, vel)."""
    raise NotImplementedError(
        "TODO 7: the three fields back, from exactly eight bytes")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
