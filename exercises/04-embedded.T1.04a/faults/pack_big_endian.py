"""Planted fault: the frame packed big-endian, so the little-endian UART reads it wrongly."""

import math
import struct

MAX_BITS = 64


def _check_bits(bits):
    if not isinstance(bits, int) or isinstance(bits, bool):
        raise ValueError("a width is a whole number of bits, not %r" % (bits,))
    if bits < 1 or bits > MAX_BITS:
        raise ValueError("a C integer is 1..%d bits wide, not %d" % (MAX_BITS, bits))
    return bits


def int_range(bits, signed=False):
    """The (low, high) a fixed-width C integer holds - `int16_t` is (-32768, 32767)."""
    _check_bits(bits)
    if signed:
        return -(2 ** (bits - 1)), 2 ** (bits - 1) - 1
    return 0, 2 ** bits - 1


def wrap_uint(value, bits):
    """What a `uintN_t` keeps when it is assigned `value`: the value modulo 2**bits."""
    _check_bits(bits)
    if not isinstance(value, int) or isinstance(value, bool):
        raise ValueError("an integer register cannot be assigned %r" % (value,))
    return value & (2 ** bits - 1)


def elapsed_unsigned(now, prev, bits):
    """`(uintN_t)(now - prev)` - the tick difference that survives a counter rollover."""
    _check_bits(bits)
    mask = 2 ** bits - 1
    return (wrap_uint(now, bits) - wrap_uint(prev, bits)) & mask


def apply_bits(reg, set_mask=0, clear_mask=0):
    """`(reg | set_mask) & ~clear_mask` - the neighbours untouched, clearing winning over setting."""
    for name, value in (("reg", reg), ("set_mask", set_mask), ("clear_mask", clear_mask)):
        if not isinstance(value, int) or isinstance(value, bool) or value < 0:
            raise ValueError("%s must be a non-negative integer, not %r" % (name, value))
    return (reg | set_mask) & ~clear_mask


def bit_is_set(reg, bit):
    """`(reg >> bit) & 1` - one flag read as 0 or 1, with the rest of the word ignored."""
    if not isinstance(reg, int) or isinstance(reg, bool) or reg < 0:
        raise ValueError("a register is a non-negative integer, not %r" % (reg,))
    if not isinstance(bit, int) or isinstance(bit, bool) or bit < 0 or bit > 31:
        raise ValueError("a 32-bit register has bit indices 0..31, not %r" % (bit,))
    return (reg >> bit) & 1


def pack_telemetry(tick, count, vel):
    """The MCU's 8-byte frame - here with `>` where the UART's little-endian `<` belongs."""
    if not isinstance(tick, int) or isinstance(tick, bool) or not 0 <= tick <= 0xFFFF:
        raise ValueError("tick is a uint16, 0..65535, not %r" % (tick,))
    if not isinstance(count, int) or isinstance(count, bool) or not -32768 <= count <= 32767:
        raise ValueError("count is an int16, -32768..32767, not %r" % (count,))
    if not isinstance(vel, (int, float)) or isinstance(vel, bool) or not math.isfinite(vel):
        raise ValueError("velocity must be a finite float, not %r" % (vel,))
    return struct.pack(">Hhf", tick, count, float(vel))


def unpack_telemetry(raw):
    """The same frame read back as (tick, count, vel)."""
    if not isinstance(raw, (bytes, bytearray)) or len(raw) != 8:
        raise ValueError("a telemetry frame is exactly 8 bytes, not %r" % (raw,))
    return struct.unpack("<Hhf", bytes(raw))
