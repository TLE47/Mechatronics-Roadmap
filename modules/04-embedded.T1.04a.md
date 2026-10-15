---
id: 04-embedded.T1.04a
title: "C/C++ Compilation, Fixed-Width Types, Pointers, Structs & Bitwise Register Masks"
track: "04"
tier: 1
prereqs:
  - 00-foundations.T1.00b
  - 01-electronics.T1.01a
new_concepts:
  - fixed_width_integers_and_twos_complement
  - bitwise_register_masks_and_shifts
  - c_structs_pointers_and_endianness
uses:
  - python_variables_and_types
  - for_while_loops_and_functions
  - ohms_law_and_joule_power
est_hours: 4.5
---

## 0. Skip Test
Pass without reading if you can answer both without looking anything up:
1. Write the C expression to set bit 5 and clear bit 2 of a 32-bit hardware register `REG` without altering any other bits.
   - **Check:** `REG = (REG | (1U << 5)) & ~(1U << 2);`
2. A 14-bit magnetic encoder returns high byte `0x1A` and low byte `0x3F`. Reconstruct the 14-bit unsigned integer `(high << 8) | low` in decimal.
   - **Check:** `(0x1A << 8) | 0x3F = 0x1A3F = 6719`.

## 1. Why This Matters
Python hides memory addresses and integer bit widths, but microcontrollers interact with hardware through memory-mapped 8-, 16-, and 32-bit registers and send telemetry as raw byte streams. Before writing the hardware timer ISR and packed binary telemetry frame in Step 1.5 (`04-embedded.T1.05`), you need to know fixed-width integers (`uint8_t`, `int16_t`, `uint32_t`), bitwise masks (`|`, `&`, `^`, `~`, `<<`, `>>`), pointers, and how structs pack into little-endian bytes.

## 2. Mental Model
1. **Fixed-Width Integers (`<stdint.h>`):**
   Never use plain `int` in firmware protocols because its size changes across architectures (16-bit on AVR vs. 32-bit on ARM). Always specify exact width and signedness:
   - `uint8_t`: $0 \dots 255$ ($1\text{ byte}$)
   - `int16_t`: $-32768 \dots +32767$ ($2\text{ bytes}$, two's complement)
   - `uint32_t`: $0 \dots 4,294,967,295$ ($4\text{ bytes}$)
2. **Bitwise Register Manipulation:**
   Hardware peripherals use individual bits inside control registers as switches:
   - **Set bit $n$ ON:** `reg |= (1U << n)`
   - **Clear bit $n$ OFF:** `reg &= ~(1U << n)`
   - **Toggle bit $n$:** `reg ^= (1U << n)`
   - **Test bit $n$:** `bool is_set = (reg & (1U << n)) != 0`
3. **Pointers, Packed Structs & Little-Endian Byte Order:**
   A pointer holds the memory address of a variable. On ARM Cortex-M and x86 (little-endian), a 16-bit value `0x1234` stores the least-significant byte `0x34` at the lower address and `0x12` at the next address.

## 3. Worked Example
1. **Register Bit Masking:** Suppose timer control register `TIM_CR1` starts at `0x0004` (binary `0000 0100`, bit 2 set). We want to enable the counter (set bit 0) and clear bit 2:
   - Set bit 0: `0x0004 | (1 << 0) = 0x0005` (`0000 0101`)
   - Clear bit 2: `0x0005 & ~(1 << 2) = 0x0001` (`0000 0001`)
2. **16-Bit Sensor Byte Unpacking:** A signed 16-bit gyroscope reading of $\omega = -500\text{ LSB}$ is transmitted in little-endian order as two bytes:
   - In 16-bit two's complement: $65536 - 500 = 65036 = \text{0xFE0C}$.
   - Little-endian wire bytes: `byte[0] = 0x0C` (low byte), `byte[1] = 0xFE` (high byte).

## 4. Code
```python
import struct

# 1. Bitwise register manipulation model (matching C uint32_t behavior)
tim_cr1 = 0x0004
tim_cr1 = (tim_cr1 | (1 << 0)) & ~(1 << 2) & 0xFFFFFFFF
assert tim_cr1 == 0x0001

# 2. 14-bit encoder reconstruction from two I2C bytes (AS5600 raw angle)
msb, lsb = 0x08, 0x00  # 0x0800 = 2048 counts (exactly half a revolution: 180 deg)
raw_counts = ((msb & 0x0F) << 8) | lsb
angle_deg = raw_counts * (360.0 / 4096.0)
assert raw_counts == 2048 and angle_deg == 180.0

# 3. Little-endian struct packing matching C __attribute__((packed))
gyro_lsb = -500
wire_bytes = struct.pack("<h", gyro_lsb)
assert list(wire_bytes) == [0x0C, 0xFE]
unpacked = struct.unpack("<h", wire_bytes)[0]
assert unpacked == -500
print(f"TIM_CR1=0x{tim_cr1:04X}, encoder={raw_counts} ({angle_deg:.1f} deg), wire={[hex(b) for b in wire_bytes]}")
```
Expected output:
```text
TIM_CR1=0x0001, encoder=2048 (180.0 deg), wire=['0xc', '0xfe']
```

## 5. Exercise
An 8-bit status register `STATUS` has value `0xA6` (`1010 0110` in binary). Mask out bits `[5:3]` (a 3-bit fault code field) and shift them down to bits `[2:0]` to read the integer fault code ($0\dots 7$).
- **Check:** `(0xA6 >> 3) & 0x07 = (0b00010100) & 0b111 = 4`.

## 6. Gate Test
1. Why is `uint8_t counter = 250; counter += 10;` equal to `4` instead of `260`? (Answer: Unsigned 8-bit integers wrap modulo $2^8 = 256$, and $260 \bmod 256 = 4$.)
2. What bug happens if you write `reg = (1 << 3);` instead of `reg |= (1 << 3);` on a hardware configuration register? (Answer: You overwrite all 31 other bits in the register with zeros instead of preserving their current settings.)

## 7. Resources
- **Lee & Seshia — *Introduction to Embedded Systems*:** Memory-mapped I/O, fixed-width C types, and register interfaces (`resources/textbooks-and-papers.md`) `[VERIFIED 2026-10-15]`.
- **Track 04 (`04-embedded-and-realtime/README.md`):** Directly prepares for Step 1.5 (`04-embedded.T1.05`) packed binary telemetry and hardware timers `[VERIFIED 2026-10-15]`.
