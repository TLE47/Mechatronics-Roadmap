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
        "TODO 1: unsigned counts from zero to two-to-the-bits minus one; signed splits that range around zero")


def wrap_uint(value, bits):
    """What a `uintN_t` keeps when it is assigned `value`."""
    raise NotImplementedError(
        "TODO 2: mask to the width in bits - a byte is not the only width a register has")


def elapsed_unsigned(now, prev, bits):
    """`(uintN_t)(now - prev)` - the tick difference that survives a counter rollover."""
    raise NotImplementedError(
        "TODO 3: subtract first, then mask - subtracting without the mask gives a huge negative")


def apply_bits(reg, set_mask=0, clear_mask=0):
    """`(reg | set_mask) & ~clear_mask`."""
    raise NotImplementedError(
        "TODO 4: OR the set mask on, then AND the clear mask inverted - forgetting the "
        "inversion wipes every neighbouring bit")


def bit_is_set(reg, bit):
    """One flag read as 0 or 1."""
    raise NotImplementedError(
        "TODO 5: shift the bit down to the lowest position, then test that one bit only - not the raw value")


def pack_telemetry(tick, count, vel):
    """The MCU's 8-byte `<Hhf` frame: uint16 tick, int16 count, float velocity."""
    raise NotImplementedError(
        "TODO 6: pack the frame little-endian, the way the UART sends it - the byte order is part of the format")


def unpack_telemetry(raw):
    """The same frame read back as (tick, count, vel)."""
    raise NotImplementedError(
        "TODO 7: refuse a frame that is not exactly eight bytes, then read it back the same way it was packed")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
