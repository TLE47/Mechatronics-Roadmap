---
id: 04-embedded.T1.04a
title: "From Python to C/Arduino: Fixed-Width Types, Bitwise Masks, Structs & Pointers"
track: "04"
tier: 1
prereqs:
  - 00-foundations.T1.00b
new_concepts:
  - c_fixed_width_integer_types_and_overflow
  - bitwise_masks_and_shifts
  - c_structs_and_pointers_pass_by_reference
uses:
  - python_variables_and_types
  - for_while_loops_and_functions
  - lists_dicts_and_numpy_arrays
est_hours: 3.5
hardware_required: false
safety_level: none
resources_verified: false
---

## 1. Why it matters
Python integers grow arbitrarily large and never overflow, but microcontroller C/C++ variables occupy a fixed number of bits (`uint8_t`, `int16_t`, `uint32_t`, `float`) in hardware registers. Before writing real-time timer interrupts and binary serial telemetry in Step 1.5 (`04-embedded.T1.05`), you must know how fixed-width integers wrap around, how bitwise masks (`|`, `&`, `~`, `<<`) flip single register bits without corrupting neighbors, and how `struct` pointers pass data with zero copy overhead. Already know this? Take the Skip test in section 7 first.

## 2. Intuition first
Imagine moving from an infinite notepad (Python) to an odometer with only four mechanical digit wheels (`uint16_t`, which holds `0` to `65535`). If your odometer is at `65535` and clicks forward by `1`, it doesn't add a fifth wheel—it wraps cleanly back to `0` (**integer wrap-around**). Next, think of a microcontroller hardware register as a wall of 8 light switches wired side-by-side in a single byte. If you want to flip switch #3 ON without touching switches #0–#2 or #4–#7, you use a **bitwise stencil (mask)** `1 << 3`. Finally, a C **`struct`** is a molded tray that holds several variables side-by-side in memory, and a **pointer** (`*`) stores the shelf address of that tray on a sticky note instead of photocopying the entire tray every time you call a function.

## 3. Formalization
1. **Fixed-Width Integer Types (`<stdint.h>`) and Modular Wrap-Around:** An $N$-bit unsigned integer `uintN_t` stores values in $[0, 2^N - 1]$, and a two's-complement signed integer `intN_t` stores $[-2^{N-1}, 2^{N-1} - 1]$:
   - `uint8_t`: $[0, 255]$ ($1\text{ byte}$); `int16_t`: $[-32768, 32767]$ ($2\text{ bytes}$); `uint32_t`: $[0, 4294967295]$ ($4\text{ bytes}$); `float`: IEEE-754 single precision ($4\text{ bytes}$).
   - Computing unsigned tick difference `(uint16_t)(now - prev)` modulo $2^{16} = 65536$: substituting `now = 4` and `prev = 65530` yields `(4 - 65530) & 0xFFFF = 10` ticks elapsed across rollover.
2. **Bitwise Register Manipulation:** For bit index $n \in \{0, \dots, 31\}$ in register $R$:
   - Set bit $n$ to `1`: $R \leftarrow R \mid (1 \ll n)$.
   - Clear bit $n$ to `0`: $R \leftarrow R \mathbin{\&} \sim(1 \ll n)$.
   - Test bit $n$: $\text{is\_set} = (R \gg n) \mathbin{\&} 1$.
   Substituting $R = \text{0x01}$ (`0b00000001`), setting bit $3$ ($1 \ll 3 = 8 = \text{0x08}$) gives $R = \text{0x09}$ (`0b00001001`).
3. **Structs and Pass-by-Pointer (`*` and `->`):** Grouping fields in `struct MotorState { int16_t count; float vel_rad_s; };` and passing `MotorState *s` passes a single memory address (`4` or `8` bytes) so `s->count += 1` mutates the caller's struct in-place.

## 4. Worked example
Simulate 16-bit encoder counter wrap-around, bitwise GPIO register set/clear operations, and packing an 8-byte C telemetry struct (`<Hhf`: `uint16_t`, `int16_t`, `float`) using Python's `struct` module.

```python
import struct

def uint16_elapsed(now: int, prev: int) -> int:
    return (now - prev) & 0xFFFF

assert uint16_elapsed(now=4, prev=65530) == 10

reg = 0b0000_0001
reg |= (1 << 3)                  # Set bit 3 -> 0b0000_1001 (9)
assert reg == 9
reg &= ~(1 << 0)                 # Clear bit 0 -> 0b0000_1000 (8)
assert reg == 8
assert ((reg >> 3) & 1) == 1

raw_bytes = struct.pack("<Hhf", 1000, -512, 3.25)
assert len(raw_bytes) == 8       # 2 + 2 + 4 bytes = 8 bytes
tick, count, vel = struct.unpack("<Hhf", raw_bytes)
assert tick == 1000 and count == -512 and abs(vel - 3.25) < 1e-6
print(f"Rollover delta={uint16_elapsed(4, 65530)}, reg=0x{reg:02X}, struct_size={len(raw_bytes)} bytes")
```
Expected output:
```text
Rollover delta=10, reg=0x08, struct_size=8 bytes
```

## 5. Exercise
Start with register value `reg = 0x5A` (`0b01011010`). Write a Python expression that sets bit `6` (`1 << 6`) and clears bit `3` (`~(1 << 3)`), and verify the resulting integer is `0x72` (`114` in decimal, `0b01110010`).
- **If your result differs:** Check that bit indices are 0-based from the least-significant (rightmost) bit: bit `0` has weight $2^0 = 1$, bit `3` has weight $2^3 = 8$, and bit `6` has weight $2^6 = 64$.

## 6. Simulation path
Test the C equivalent directly in the browser on the [Wokwi ESP32/STM32 Simulator](https://wokwi.com/) (`resources/open-source-toolchains.md`) or run the Python bit-exact verification script above.

No hardware required for this module (`hardware_required: false`). In Step 1.5 (`04-embedded.T1.05`), the exact `struct.pack("<Hhf", ...)` layout matches the `__attribute__((packed))` C struct transmitted over the microcontroller's USB-UART bridge:
```text
[MCU C Struct: uint16_t + int16_t + float (8 B)] ---> (UART 115200 bps) ---> [Python struct.unpack("<Hhf")]
```
Pass/fail verification in simulation: `uint16_elapsed(4, 65530) == 10`, `reg == 0x08`, and `len(raw_bytes) == 8`.

## 7. Checkpoint
Pass criteria: run the worked example and exercise asserts with zero errors, or score $\ge 80\%$ ($4/4$) on the Skip test below.

### Skip test
1. `[Recall] [Concept: c_fixed_width_integer_types_and_overflow]` Compute the maximum positive integer $2^{16-1} - 1$ representable by a signed 16-bit integer `int16_t` (exact integer, tolerance $\pm 0$).
2. `[Apply] [Concept: c_fixed_width_integer_types_and_overflow]` Compute the unsigned 8-bit difference `(uint8_t)(now - prev)` (i.e. `(now - prev) & 0xFF`) when `now = 3` and `prev = 250` (exact integer, tolerance $\pm 0$).
3. `[Transfer] [Concept: bitwise_masks_and_shifts]` Starting from `reg = 0x0F` (`15`), compute the decimal value of `reg` after clearing bit `2` (`reg &= ~(1 << 2)`, exact integer, tolerance $\pm 0$).
4. `[Spaced review -> 00-foundations.T1.00b — Concept: python_variables_and_types] [Concept: c_structs_and_pointers_pass_by_reference]` Why does embedded C code write `REG &= ~(1U << 5)` instead of `REG = 0` when disabling peripheral bit 5?
   - **A.** Because `REG = 0` does not compile in C.
   - **B.** Because `REG &= ~(1U << 5)` clears **only** bit 5 while preserving the state of all other 31 configuration bits in that hardware register.
   - **C.** Because `~` multiplies by two.
   - **D.** Because `REG = 0` sets all bits to `1`.

**Answer key:**
```python
q1_int16_max = (1 << 15) - 1
q2_u8_delta = (3 - 250) & 0xFF
q3_reg_cleared = 0x0F & ~(1 << 2)
q4_choice = "B"

assert q1_int16_max == 32767
assert q2_u8_delta == 9
assert q3_reg_cleared == 11
assert q4_choice == "B"
```
- **Pass mark:** $4/4$ ($80\%+$). If you missed Q1 or Q2, study `## 3. Formalization` item 1; Q3 or Q4, study `## 3. Formalization` item 2. On pass, proceed to `## 10. Next modules`.

## 8. Common mistakes
| Symptom | Root cause | 2-minute fix |
| :--- | :--- | :--- |
| Wrote `reg &= (1 << 3)` to clear bit 3, wiping out all other bits | Forgot the bitwise NOT operator `~` before `(1 << 3)`. | Always write `reg &= ~(1U << n)` to clear bit `n`. |
| `sizeof(struct)` is 12 bytes on MCU instead of 8 bytes | Compiler inserted 2 bytes of alignment padding after `uint16_t`/`int16_t`. | Order 4-byte fields (`float`, `uint32_t`) first or mark wire packets `__attribute__((packed))`. |
| Signed `int16_t` encoder count jumps from `+32767` to `-32768` | Exceeded the signed 16-bit range during multi-turn rotation. | Accumulate multi-turn counts in a 32-bit `int32_t` or 64-bit `int64_t` variable using unsigned 16-bit tick deltas. |

## 9. Resources
- **Jens Gustedt — *Modern C* & Arduino Reference (`resources/textbooks-and-papers.md`):** Fixed-width integer types (`<stdint.h>`), pointers, and bitwise operators `[UNVERIFIED]`.
- **Wokwi Embedded Simulator (`wokwi.com`, `resources/open-source-toolchains.md`):** Browser-based Arduino/ESP32/STM32 simulator `[VERIFIED 2026-10-15]`.
## 10. Next modules
- Proceed to [`04-embedded.T1.04b`](04-embedded.T1.04b.md) (*Non-Blocking `millis()`/`micros()` State Machines, Hardware Interrupts (ISRs) & `volatile`*).
