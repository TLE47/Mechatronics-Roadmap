# Lesson P.4: The Language of Hardware — SI Units, Metric Prefixes, Binary Bits & Frequency (`Hz`)

## Goal
Convert engineering values with metric prefixes (`m`, `µ`, `k`, `M`) into base SI units before doing math, relate signal frequency (`Hz`) to cycle period (`s`), and calculate the integer range ($0$ to $2^N - 1$) of an $N$-bit digital register.

- **New ideas (max 2):**
  1. **SI base units, metric prefixes, and frequency vs. period ($f = 1/T$)**: Converting milliamps (`mA`), microseconds (`µs`), and kilohertz (`kHz`) into base units (`A`, `s`, `Hz`) and switching between cycles-per-second ($f$) and seconds-per-cycle ($T$).
  2. **Binary bits (`0`/`1`) and powers of 2 ($2^N$)**: Understanding why an $N$-bit microcontroller component (such as an 8-bit PWM timer or 10-bit ADC) has $2^N$ possible states ranging from $0$ to $2^N - 1$.
- **New syntax:** `2 ** N` (powers of 2 in Python), `_` visual digit separator in large numbers (e.g., `1_000_000` equals `1000000`).
- **Estimated time (untimed guesses):** Typical: 1.5–2.0 hours | Slow-learner: 2.5–3.5 hours

---

## Prerequisites
- [Lesson P.1: Variables, Data Types & Arithmetic Expressions](P.1-variables-types-and-arithmetic.md)
- [Lesson P.3: Reusable Functions (`def`/`return`), Self-Tests (`assert`) & `import`](P.3-functions-assert-and-import.md)

```mermaid
flowchart LR
    P3["P.3: Functions, Assert & Import"] --> P4["P.4: Units, Binary & Frequency"]
    P4 --> P5["P.5: Algebra, Trig & Radians"]
```

---

## Learn

### Idea 1: SI Base Units, Metric Prefixes, and Frequency vs. Period ($f = 1 / T$)
- **Primary resource:** [SparkFun — Metric Prefixes and SI Units](https://learn.sparkfun.com/tutorials/metric-prefixes-and-si-units) `[HTTP 200 — Verified by scripts/check_links.py]`
  - **What to read:** Read exact headings **`Introduction`**, **`Metric Prefixes`**, and **`SI Units`**.
  - **What to skip:** Skip **`gut Check`** astronomical/planck examples at the bottom if you already understand the powers-of-10 table.
  - **Key takeaway:** Physics formulas only work when every input is converted to its **SI base unit** first—meters (`m`), kilograms (`kg`), seconds (`s`), volts (`V`), amperes (`A`), ohms (`Ω`), and **Hertz** (`Hz`, cycles per second). The **period** $T$ (duration of one repeating cycle in seconds) and **frequency** $f$ (how many cycles happen in 1 second) are exact reciprocals: $T = \frac{1}{f}$ and $f = \frac{1}{T}$.
  - **Alternative resource:** [MathsIsFun — Metric System of Measurement](https://www.mathsisfun.com/measure/metric-system.html) `[HTTP 200 — Verified by scripts/check_links.py]` — Read exact headings **`Metric System of Measurement`**, **`Larger or Smaller`**, and **`Common Big and Small Numbers`**.

### Idea 2: Binary Bits (`0`/`1`) and Powers of 2 ($2^N$)
- **Primary resource:** [SparkFun — Binary](https://learn.sparkfun.com/tutorials/binary) `[HTTP 200 — Verified by scripts/check_links.py]`
  - **What to read:** Read exact headings **`Introduction`**, **`Bits and Bytes`**, and **`Converting Binary to Decimal`**.
  - **What to skip:** Skip **`Bitwise Operators`** and **`Hexadecimal`** (not needed until embedded systems in Track 04).
  - **Key takeaway:** Inside a microcontroller, every wire is either off (`0`) or on (`1`), called a **bit** (binary digit), and 8 bits grouped together form one **byte**. Because each bit doubles the number of possible combinations, an $N$-bit register can represent $2^N$ distinct whole numbers starting at `0` and ending at $2^N - 1$ (so 8 bits = $2^8 = 256$ values from `0` to `255`, and 10 bits = $2^{10} = 1024$ values from `0` to `1023`).
  - **Alternative resource:** [MathsIsFun — Binary Number System](https://www.mathsisfun.com/binary-number-system.html) `[HTTP 200 — Verified by scripts/check_links.py]` — Read exact headings **`How do we Count using Binary?`**, **`Decimal vs Binary`**, and **`Doubling`**.

### Bridge Notes
Many beginner bugs happen when someone plugs milliamps (`mA`) or milliseconds (`ms`) straight into an equation that expects amperes (`A`) or seconds (`s`). Memorize the four **metric prefixes** used on every schematic and datasheet:
- **mega (`M`)** = $\times 10^6$ (`1,000,000`): $2\text{ M}\Omega = 2{,}000{,}000\ \Omega$.
- **kilo (`k`)** = $\times 10^3$ (`1,000`): $10\text{ k}\Omega = 10{,}000\ \Omega$; $1\text{ kHz} = 1{,}000\text{ Hz}$.
- **milli (`m`)** = $\div 1{,}000$ ($\times 10^{-3}$): $250\text{ mA} = 0.25\text{ A}$; $2\text{ ms} = 0.002\text{ s}$.
- **micro (`µ` or `u`)** = $\div 1{,}000{,}000$ ($\times 10^{-6}$): $500\ \mu\text{s} = 0.0005\text{ s}$.

A repeating signal is described by its **frequency** $f$ in **Hertz (`Hz`)** (cycles per second) or its **period** $T$ in seconds ($T = 1 / f$). A $500\text{ Hz}$ control loop runs 500 times per second, so its period between ticks is $T = 1 / 500 = 0.002\text{ s} = 2\text{ ms}$. Digital chips store numbers in **binary** using **bits** (`0` or `1`). An $N$-bit counter holds $2^N$ states from $0$ to $2^N - 1$, which is why the Arduino Uno's 8-bit PWM takes `0..255` and its 10-bit sensor input returns `0..1023`.

---

## Do it yourself

- **What is simulated and in which tool:** Runs 100% in Python (in [futurecoder.io](https://futurecoder.io/course/) `[verify in-app]` or locally via `python3`).
- **What is real-hardware only:** Nothing in this lesson requires hardware.

### Starter Code (runs as-is — fill in the TODOs)
Complete the three helper functions (`TODO 1`, `TODO 2`, `TODO 3`) so the script converts milliseconds, calculates loop period in microseconds, and computes the maximum integer of an $N$-bit register:

```python
def ms_to_seconds(time_ms):
    # TODO 1: Convert milliseconds (ms) to base seconds (s) by dividing by 1000.0
    return 0.0


def freq_hz_to_period_us(freq_hz):
    # TODO 2: Given frequency in Hz, calculate period T in seconds (1.0 / freq_hz),
    #         then convert seconds to microseconds (us) by multiplying by 1_000_000.0
    return 0.0


def max_nbit_uint(num_bits):
    # TODO 3: Return the largest integer an N-bit unsigned register can hold: (2 ** num_bits) - 1
    return 0


print(f"25 ms = {ms_to_seconds(25.0):.4f} s")
print(f"500 Hz loop period = {freq_hz_to_period_us(500.0):.1f} us")
print(f"8-bit max = {max_nbit_uint(8)} | 10-bit max = {max_nbit_uint(10)} | 12-bit max = {max_nbit_uint(12)}")
```

### Expected Output
When all three `TODO`s are completed, running the script prints:

```text
25 ms = 0.0250 s
500 Hz loop period = 2000.0 us
8-bit max = 255 | 10-bit max = 1023 | 12-bit max = 4095
```

### Hint Ladder

<details>
<summary><strong>Hint 1 (Concept nudge)</strong></summary>

1 second contains `1000.0` milliseconds (`ms`) and `1_000_000.0` microseconds (`us`). For `max_nbit_uint`, raise `2` to the power `num_bits` using `2 ** num_bits`, then subtract `1` because counting starts at `0`.
</details>

<details>
<summary><strong>Hint 2 (Formula / structure)</strong></summary>

- `ms_to_seconds`: `return time_ms / 1000.0`
- `freq_hz_to_period_us`: `return (1.0 / freq_hz) * 1_000_000.0`
- `max_nbit_uint`: `return (2 ** num_bits) - 1`
</details>

<details>
<summary><strong>Full Solution</strong></summary>

```python
def ms_to_seconds(time_ms):
    return time_ms / 1000.0


def freq_hz_to_period_us(freq_hz):
    return (1.0 / freq_hz) * 1_000_000.0


def max_nbit_uint(num_bits):
    return (2 ** num_bits) - 1


assert ms_to_seconds(25.0) == 0.025
assert freq_hz_to_period_us(500.0) == 2000.0
assert max_nbit_uint(8) == 255
assert max_nbit_uint(10) == 1023
assert max_nbit_uint(12) == 4095

print(f"25 ms = {ms_to_seconds(25.0):.4f} s")
print(f"500 Hz loop period = {freq_hz_to_period_us(500.0):.1f} us")
print(f"8-bit max = {max_nbit_uint(8)} | 10-bit max = {max_nbit_uint(10)} | 12-bit max = {max_nbit_uint(12)}")
```
</details>

---

## Common mistakes & troubleshooting
- **Multiplying instead of dividing for `m` or `µ`:** Remember that `milli` (`1/1,000`) and `micro` (`1/1,000,000`) are *smaller* than 1 base unit. Thus `500 mA` is `0.5 A` (smaller number), not `500,000 A`.
- **Off-by-one error on $N$-bit max value ($2^N$ vs. $2^N - 1$):** An 8-bit register has $2^8 = 256$ total combinations, but because `0` uses up the first slot, the highest number is **`255`** ($256 - 1$), not `256`.
- **Confusing `m` (meters) with `m` (milli-):** Alone at the end of a unit, `m` means **meters** (`5 m`). Placed *in front* of another unit, `m` means **milli-** (`5 ms` = 5 milliseconds, `5 mA` = 5 milliamps, `5 mm` = 5 millimeters).

---

## Check yourself

1. **Prefix conversion:** Convert `4.7 kΩ` to ohms (`Ω`), `350 mA` to amperes (`A`), and `400 µs` to seconds (`s`).
   <details>
   <summary><strong>Answer</strong></summary>

   - `4.7 kΩ` = $4.7 \times 1{,}000 = \mathbf{4{,}700\ \Omega}$
   - `350 mA` = $350 \div 1{,}000 = \mathbf{0.35\text{ A}}$
   - `400 µs` = $400 \div 1{,}000{,}000 = \mathbf{0.0004\text{ s}}$
   </details>

2. **Frequency and Period:** An Arduino Uno PWM pin switches at a frequency of `490 Hz` (490 cycles per second), while a motor drive switches at `20 kHz`. What is the period $T$ in milliseconds (`ms`) of each signal?
   <details>
   <summary><strong>Answer</strong></summary>

   - At `490 Hz`: $T = \frac{1}{490\text{ Hz}} \approx 0.002041\text{ s} \approx \mathbf{2.04\text{ ms}}$.
   - At `20 kHz` (`20,000 Hz`): $T = \frac{1}{20{,}000\text{ Hz}} = 0.00005\text{ s} = \mathbf{0.05\text{ ms}}$ (`50 µs`).
   </details>

3. **Binary to Decimal:** What decimal number does the 4-bit binary number `1010` represent? (Hint: the 4 place values from right to left are $1, 2, 4, 8$).
   <details>
   <summary><strong>Answer</strong></summary>

   **`10`**. Reading the place values ($8, 4, 2, 1$): $(1 \times 8) + (0 \times 4) + (1 \times 2) + (0 \times 1) = 8 + 2 = \mathbf{10}$.
   </details>

4. **Bit resolution:** Why does `analogRead()` on the Arduino Uno (which has a 10-bit ADC) return numbers from `0` to `1023` instead of `0` to `1000`?
   <details>
   <summary><strong>Answer</strong></summary>

   Because digital hardware counts in binary powers of 2: 10 bits provide $2^{10} = \mathbf{1024}$ steps, which—starting from `0`—span the exact integer range **`0` to `1023`** ($2^{10} - 1$).
   </details>

---

## Recap
- Convert all prefixed quantities (`M` $= 10^6$, `k` $= 10^3$, `m` $= 10^{-3}$, `µ` $= 10^{-6}$) into **SI base units** (`m`, `kg`, `s`, `V`, `A`, `Ω`, `Hz`) before applying formulas.
- **Frequency** ($f$, in `Hz`) and **period** ($T$, in `s`) are reciprocals: $T = 1/f$ and $f = 1/T$.
- An **$N$-bit** digital value has $2^N$ states ranging from $0$ to $2^N - 1$ (`0..255` for 8-bit, `0..1023` for 10-bit).

### You're ready to move on when...
- [ ] You can convert between `ms`, `µs`, `s`, and `Hz` without guessing whether to multiply or divide.
- [ ] You know why 8-bit means `0..255` and 10-bit means `0..1023`.
- [ ] Your **Do it yourself** script prints the exact expected values.
- **Next lesson:** [Lesson P.5: Rearranging Formulas, Right-Triangle Trig & Radians](P.5-algebra-and-trigonometry-for-robotics.md)
