---
id: 04-embedded.T2.04b
title: "RTOS Tasks, Priority Inversion, Rate-Monotonic Deadlines, CAN Arbitration, Zephyr RTOS & micro-ROS"
track: "04"
tier: 2
prereqs:
  - 04-embedded.T2.04a
new_concepts:
  - rtos_preemptive_scheduling_and_cpu_utilization
  - unbounded_priority_inversion_and_inheritance
  - can_bitwise_arbitration_and_mit_packing
uses:
  - non_blocking_tick_scheduler
  - hardware_isr_and_volatile_contract
  - dma_zero_cpu_memory_transfer
est_hours: 5.0
hardware_required: false
safety_level: none
resources_verified: false
---

## 1. Why it matters
This is the final bridge module in the Track 04 Tier 2 ladder before Step 2.5 (`04-embedded.T2.05`). When your firmware grows to include a $1\text{ kHz}$ impedance controller, a $200\text{ Hz}$ CAN-FD bus manager, and a $50\text{ Hz}$ diagnostics task, a single bare-metal `loop()` becomes brittle: one slow calculation delays the fast control tick. A **Real-Time Operating System (RTOS)** (`FreeRTOS` or **`Zephyr RTOS`**) lets high-priority tasks preempt low-priority tasks deterministically, **Priority Inheritance Mutexes** (`xSemaphoreCreateMutex` / `K_MUTEX_DEFINE`) prevent catastrophic priority inversion (the bug that froze the Mars Pathfinder!), **CAN bitwise arbitration** lets multiple robot joints share a 2-wire differential bus without packet collisions, and **`micro-ROS`** (`XRCE-DDS` + `rclc_executor`) bridges your microcontroller tasks directly into the ROS 2 graph in Track 06 with zero dynamic heap allocation in the control loop. Already know this? Take the Skip test or the Ladder Gate test in section 7 first.

## 2. Intuition first
Imagine an emergency room with one doctor (a single-core CPU):
- **Rate-Monotonic Preemption:** Under **Rate-Monotonic Scheduling (RMS)**, faster-repeating tasks get higher priority: a patient needing a 1-millisecond heartbeat check (`Task_Ctrl`, high priority) immediately interrupts a 100-millisecond paperwork task (`Task_Log`, low priority).
- **Unbounded Priority Inversion & Priority Inheritance:** Suppose `Task_Log` locks a shared medical chart (a mutex), gets interrupted by `Task_Ctrl` which also needs that chart and blocks waiting for `Task_Log`—and then a medium-priority task (`Task_Telem`, which doesn't even use the chart!) preempts `Task_Log` for $50\text{ ms}$, starving the high-priority `Task_Ctrl`! **Priority Inheritance** fixes this instantly: the moment `Task_Ctrl` waits on a mutex held by `Task_Log`, `Task_Log` temporarily inherits `Task_Ctrl`'s top priority so `Task_Telem` cannot cut in line.
- **CAN Bus Non-Destructive Arbitration:** On a **CAN bus**, every bit `0` is actively driven (**dominant**) while bit `1` is passive (**recessive**). If Joint 1 (`ID 0x01`) and Joint 2 (`ID 0x05`) transmit at the exact same microsecond, Joint 1's `0` bit overwrites Joint 2's `1` bit, so Joint 2 notices it lost arbitration and backs off automatically with zero corruption of Joint 1's frame.
- **Zephyr RTOS & micro-ROS Architecture:** In **Zephyr RTOS**, hardware pins and peripherals (`can0`, `spi1`) are declared once in a **Devicetree (`*.dts` / `.overlay`)** and bound at compile time (`DEVICE_DT_GET(DT_NODELABEL(fdcan1))`), while kernel features are configured via **Kconfig (`prj.conf`)** and threads/mutexes are allocated statically at compile time (`K_THREAD_DEFINE`, `K_MUTEX_DEFINE`). To talk to ROS 2 without running a heavyweight Linux DDS stack on a microcontroller, **micro-ROS** runs a lightweight **`XRCE-DDS` Client** on the MCU (over CAN-FD, UART DMA, or UDP) that exchanges compact binary frames with a **`micro_ros_agent`** on the companion computer, driven by a deterministic **`rclc_executor`** that polls timers and subscriptions in a fixed, programmer-defined order using pre-allocated static memory pools.

## 3. Formalization
1. **Rate-Monotonic CPU Utilization & Preemptive Scheduling:** For $n$ periodic tasks with worst-case execution times $C_i$ ($\text{s}$) and periods $T_i$ ($\text{s}$), total CPU utilization is:
   $$U = \sum_{i=1}^{n} \frac{C_i}{T_i}$$
   Necessary condition for schedulability on one core: $U \le 1.0$ (and the Liu-Layland sufficient bound $U \le n(2^{1/n} - 1)$, which evaluates to $\approx 0.7798$ for $n=3$; exact schedulability is verified via Response-Time Analysis $R_i = C_i + \sum_{j \in hp(i)} \lceil R_i / T_j \rceil C_j \le D_i$ in Step 2.5).
2. **Priority Inversion vs. Priority Inheritance Mutex (`xSemaphoreCreateMutex` / Zephyr `k_mutex`):** If low-priority task $L$ holds a shared lock for critical section duration $B_i$, a naive binary semaphore (`xSemaphoreCreateBinary` / `k_sem`) allows any medium-priority task $M$ ($P_L < P_M < P_H$) to preempt $L$, inflating $H$'s blocking delay by $\sum C_M$:
   $$R_{H,\text{inverted}} = C_H + B_i + \sum_{M} C_M, \qquad R_{H,\text{inherited}} = C_H + B_i$$
   Both `FreeRTOS` mutexes (`xSemaphoreCreateMutex`) and **Zephyr RTOS** mutexes (`K_MUTEX_DEFINE(my_mtx); k_mutex_lock(&my_mtx, K_FOREVER);`) implement **Priority Inheritance** automatically.
3. **CAN Non-Destructive Bitwise Arbitration & Fixed-Point MIT Mode Packing:**
   - **Arbitration:** CAN transmits the 11-bit Identifier MSB-first. Because `0` is dominant and `1` is recessive, the frame with the **lowest numeric CAN ID** always wins arbitration with zero bit delay.
   - **MIT Cheetah Fixed-Point Mapping:** Mapping float $x \in [x_{\min}, x_{\max}]$ into an $N$-bit unsigned integer $u \in [0, 2^N - 1]$ for compact CAN frames:
     $$u = \operatorname{round}\!\left(\frac{x - x_{\min}}{x_{\max} - x_{\min}} (2^N - 1)\right), \quad \hat{x} = x_{\min} + \frac{u}{2^N - 1}(x_{\max} - x_{\min})$$
4. **Zephyr RTOS Static Kernel Primitives & micro-ROS (`XRCE-DDS` + `rclc_executor`) Timing Budget:**
   - **Zephyr Compile-Time Allocation:** Instead of calling `malloc()` at runtime, Zephyr defines threads, mutexes, and message queues in static RAM via macros:
     ```c
     // prj.conf: CONFIG_CAN=y, CONFIG_SPI=y, CONFIG_ZTEST=y
     const struct device *can_dev = DEVICE_DT_GET(DT_NODELABEL(fdcan1));
     K_MUTEX_DEFINE(state_mutex);
     K_MSGQ_DEFINE(can_rx_q, sizeof(struct can_frame), 16, 4);
     K_THREAD_DEFINE(ctrl_tid, 2048, ctrl_entry, NULL, NULL, NULL, 1, 0, 0); // prio 1 (cooperative/preemptive)
     ```
   - **micro-ROS `XRCE-DDS` Wire Overhead & `rclc_executor` Budget:** A micro-ROS client publishing a payload of $B_{\text{payload}}$ bytes adds an `XRCE-DDS` framing + transport header of $B_{\text{hdr}}$ bytes (typically $12\text{–}16\text{ bytes}$ over serial/CAN-FD), requiring wire transmission time $t_{\text{wire}} = \frac{8 (B_{\text{payload}} + B_{\text{hdr}})}{R_{\text{bps}}}$ (or $10/R_{\text{baud}}$ for 8N1 UART). Inside each `rclc_executor_spin_some(&executor, timeout_ns)` tick of period $T_{\text{spin}}$, the total worst-case execution time across $K$ registered handles (timers + subscriptions) must satisfy:
     $$t_{\text{exec,total}} = t_{\text{dds\_io}} + \sum_{k=1}^{K} C_{\text{cb},k} \le T_{\text{spin}}$$
     with **zero dynamic heap allocations (`malloc`/`free`)** permitted after `rclc_support_init()` completes.

## 4. Worked example
Compute total CPU utilization $U$ for a 3-task RTOS/Zephyr actuator node, compare worst-case high-priority response time with and without Priority Inheritance during mutex contention, verify CAN bus arbitration + 16-bit MIT fixed-point quantization, and audit a micro-ROS `rclc_executor` spin-time and static-memory budget.

```python
import math

tasks = [
    ("Ctrl_1kHz",      120.0, 1000.0),   # C_1 = 120 us, T_1 = 1000 us
    ("uROS_CAN_500Hz", 250.0, 2000.0),   # C_2 = 250 us, T_2 = 2000 us
    ("Diag_100Hz",     800.0, 10000.0),  # C_3 = 800 us, T_3 = 10000 us
]
U_total = sum(c / t for _, c, t in tasks)
assert math.isclose(U_total, 0.12 + 0.125 + 0.08, rel_tol=1e-9)
assert U_total < 0.77976  # Below 3-task Liu-Layland bound!

# Priority Inversion vs Priority Inheritance (FreeRTOS Mutex / Zephyr K_MUTEX_DEFINE):
# Task_H (C_H=100us) blocked by Task_L critical section (B=40us), while Task_M (C_M=600us) is ready:
resp_no_inheritance_us = 100.0 + 40.0 + 600.0   # Task_M preempts Task_L -> 740 us!
resp_with_inheritance_us = 100.0 + 40.0         # Task_L inherits P_H, blocks Task_M -> 140 us!
assert resp_no_inheritance_us == 740.0 and resp_with_inheritance_us == 140.0

# CAN bitwise arbitration: lowest ID wins
bus_ids = [0x105, 0x012, 0x04A]
winner_id = min(bus_ids)
assert winner_id == 0x012

# 16-bit MIT position quantization over [-12.5, +12.5] rad
p_min, p_max, bits = -12.5, 12.5, 16
u_code = round((0.0 - p_min) / (p_max - p_min) * ((1 << bits) - 1))
p_rec = p_min + (u_code / ((1 << bits) - 1)) * (p_max - p_min)
assert abs(p_rec - 0.0) < 0.0005

# micro-ROS rclc_executor spin budget at 500 Hz (T_spin = 2000 us) over 5 Mbps CAN-FD:
xrce_payload_bytes, xrce_hdr_bytes = 48, 16
t_wire_us = (8.0 * (xrce_payload_bytes + xrce_hdr_bytes) / 5_000_000.0) * 1e6
cb_timer_us, cb_sub_us = 65.0, 45.0
t_uros_spin_us = t_wire_us + cb_timer_us + cb_sub_us
assert math.isclose(t_wire_us, 102.4, rel_tol=1e-9)
assert math.isclose(t_uros_spin_us, 212.4, rel_tol=1e-9)
assert t_uros_spin_us < 250.0  # Fits inside uROS_CAN_500Hz WCET budget (250 us)!
print(f"U={U_total:.3f}, R_inv={resp_no_inheritance_us:.0f} us vs R_inh={resp_with_inheritance_us:.0f} us, CAN_win=0x{winner_id:03X}, uROS_spin={t_uros_spin_us:.1f} us")
```
Expected output:
```text
U=0.325, R_inv=740 us vs R_inh=140 us, CAN_win=0x012, uROS_spin=212.4 us
```

## 5. Exercise
Suppose a 12-bit (`0..4095`) MIT-mode torque command encodes $\tau \in [-18.0\text{ N}\cdot\text{m}, +18.0\text{ N}\cdot\text{m}]$. Compute (a) the integer code $u$ for $\tau = +9.0\text{ N}\cdot\text{m}$ ($\frac{9.0 - (-18.0)}{36.0} \times 4095$) rounded to the nearest integer, (b) the quantization step size $\Delta\tau = \frac{36.0}{4095}$ in $\text{N}\cdot\text{m}$, and (c) the worst-case execution time $t_{\text{exec,total}} = t_{\text{dds\_io}} + C_{\text{timer}} + C_{\text{sub}}$ of a micro-ROS `rclc_executor` when $t_{\text{dds\_io}} = 80.0\ \mu\text{s}$, $C_{\text{timer}} = 55.0\ \mu\text{s}$, and $C_{\text{sub}} = 35.0\ \mu\text{s}$. Verify $u = 3071$, $\Delta\tau \approx 0.0087912\text{ N}\cdot\text{m}$ ($\pm 10^{-6}$), and $t_{\text{exec,total}} = 170.0\ \mu\text{s}$.
- **If your result differs:** Check that the full span is $18.0 - (-18.0) = 36.0\text{ N}\cdot\text{m}$, so $+9.0\text{ N}\cdot\text{m}$ sits at $75\%$ of full scale ($0.75 \times 4095 = 3071.25 \to 3071$).

## 6. Simulation path
Open **Tab 8 (Real-Time Concurrency, Scheduling & CAN Framing)** in the MechaLab Workbench (`npm run dev`) to inspect preemptive task timelines and shared-data synchronization, or build a Zephyr RTOS + micro-ROS node on Linux using Zephyr's `native_sim` POSIX board target (`west build -b native_sim`).

No hardware required for this module (`hardware_required: false`). In Step 2.5 (`04-embedded.T2.05`), your `STM32G4` or `ESP32` runs `FreeRTOS` or `Zephyr RTOS` with `vTaskDelayUntil()` / `k_timer` for drift-free periodic execution, `FDCAN` hardware filters for $1\text{ kHz}$ actuator frames, and a `micro-ROS` `rclc_executor` bridging telemetry to the ROS 2 host:
```text
[ROS 2 Host: micro_ros_agent] <==(XRCE-DDS over CAN-FD / UART DMA)==> [Zephyr/FreeRTOS MCU: rclc_executor (500 Hz) + Task_Ctrl (1 kHz)]
```
Pass/fail verification in simulation: `U_total == 0.325`, `resp_with_inheritance_us == 140.0 us`, `winner_id == 0x012`, and `t_uros_spin_us == 212.4 us`.

## 7. Checkpoint
Pass criteria: score $\ge 80\%$ ($4/4$) on the Skip test or score $\ge 80\%$ ($7/8$) on the Ladder Gate test below to unlock Step 2.5 (`04-embedded.T2.05`).

### Skip test
1. `[Recall] [Concept: rtos_preemptive_scheduling_and_cpu_utilization]` Compute the total CPU utilization $U = \frac{C_1}{T_1} + \frac{C_2}{T_2}$ (tolerance $\pm 10^{-9}$) for two Zephyr/FreeRTOS tasks: Task 1 ($C_1 = 200\ \mu\text{s}, T_1 = 1000\ \mu\text{s}$) and Task 2 ($C_2 = 500\ \mu\text{s}, T_2 = 2500\ \mu\text{s}$).
2. `[Apply] [Concept: unbounded_priority_inversion_and_inheritance]` A high-priority control task ($C_H = 100\ \mu\text{s}$) blocks on a mutex (`xSemaphoreCreateMutex()` / `K_MUTEX_DEFINE`) held by a low-priority task ($B = 40\ \mu\text{s}$ remaining critical section) while a medium-priority task ($C_M = 600\ \mu\text{s}$) is ready. Compute the worst-case response time $R_H = C_H + B$ in microseconds ($\mu\text{s}$, tolerance $\pm 10^{-6}$) when **Priority Inheritance** is enabled.
3. `[Transfer] [Concept: can_bitwise_arbitration_and_mit_packing]` Encode a target velocity of $x = +15.0\text{ rad/s}$ over symmetric range $[x_{\min}, x_{\max}] = [-30.0, +30.0]\text{ rad/s}$ into a 12-bit unsigned integer $u = \operatorname{round}\!\left(\frac{x - x_{\min}}{x_{\max} - x_{\min}} \cdot 4095\right)$ (tolerance $\pm 10^{-9}$).
4. `[Spaced review -> 04-embedded.T2.04a — Concept: non_blocking_tick_scheduler] [Concept: can_bitwise_arbitration_and_mit_packing]` Why must a high-speed ($1\text{ Mbps}$ / $5\text{ Mbps}$ CAN-FD) twisted-pair differential bus have a $120\ \Omega$ termination resistor at **each physical end** of the trunk cable (giving $60\ \Omega$ DC resistance between `CAN_H` and `CAN_L` when powered off), and why does `micro-ROS` forbid `malloc()` inside the real-time `rclc_executor` spin loop?
   - **A.** To warm up the cable in winter and use more heap RAM.
   - **B.** The two $120\ \Omega$ end resistors match the cable's characteristic impedance to prevent edge reflections; and `micro-ROS` pre-allocates all XRCE-DDS entities statically during init because heap allocation (`malloc`) has non-deterministic execution time and causes memory fragmentation.
   - **C.** To short `CAN_H` to $+48\text{ V}$.
   - **D.** To double the CAN ID range.

**Answer key:**
```python
import math

q1_u = (200.0 / 1000.0) + (500.0 / 2500.0)
q2_rh_us = 100.0 + 40.0
q3_u12 = round((15.0 - (-30.0)) / 60.0 * 4095)
q4_choice = "B"
assert math.isclose(q1_u, 0.40, rel_tol=1e-9)
assert math.isclose(q2_rh_us, 140.0, rel_tol=1e-9)
assert math.isclose(q3_u12, 3071.0, rel_tol=1e-9)
assert q4_choice == "B"
```
- **Pass mark:** $4/4$ ($80\%+$). If you missed Q1, study `## 3. Formalization` item 1; if you missed Q2, study `## 3. Formalization` item 2; if you missed Q3 or Q4, study `## 3. Formalization` items 3–4. On pass, proceed to `## 10. Next modules`.


### Gate test
Covers the complete Track 04 Tier 2 bridge ladder (`04-embedded.T2.04a` $\to$ `04-embedded.T2.04b`) before Step 2.5 (`04-embedded.T2.05`):
1. `[Concept: spi_full_duplex_clock_polarity_phase]` Compute the clock transfer time in microseconds ($\mu\text{s}$, tolerance $\pm 10^{-9}$) to shift `16` bits over SPI at $f_{\text{sclk}} = 8.0\text{ MHz}$ ($8 \times 10^6\text{ Hz}$).
2. `[Concept: dma_zero_cpu_memory_transfer]` Why does DMA peripheral-to-memory transfer free up almost $100\%$ of the CPU time spent in polling I/O?
   - **A.** Because a dedicated hardware DMA controller moves each byte between the peripheral register and RAM in the background, interrupting the CPU only once when the half/full block completes.
   - **B.** Because DMA deletes half the sensor bytes.
   - **C.** Because DMA increases the wire gauge.
   - **D.** Because DMA disables the system clock.
3. `[Concept: double_buffered_ping_pong_half_complete_isr]` In a ping-pong DMA buffer of total size $2N = 20$ samples ($N = 10$ per half), when the **Transfer-Complete (`TC`)** interrupt fires at index `19 -> 0`, which half of the buffer has completed filling and is safe for the CPU to read?
   - **A.** The second half (`Pong`, indices `10..19`) while DMA starts overwriting indices `0..9`.
   - **B.** The first half (`Ping`, indices `0..9`) while DMA starts overwriting indices `0..9`.
   - **C.** Neither half.
   - **D.** Index `20`.
4. `[Concept: rtos_preemptive_scheduling_and_cpu_utilization]` Under Rate-Monotonic Scheduling (RMS) in FreeRTOS or Zephyr RTOS, how are fixed priorities assigned to periodic tasks?
   - **A.** Shorter period (higher frequency) $\implies$ higher priority.
   - **B.** Longer period (lower frequency) $\implies$ higher priority.
   - **C.** Alphabetical order by task name.
   - **D.** Random priority on every tick.
5. `[Concept: rtos_preemptive_scheduling_and_cpu_utilization]` Compute the total CPU utilization $U = \sum C_i / T_i$ (tolerance $\pm 10^{-9}$) for three tasks: $(C_1=100\ \mu\text{s}, T_1=500\ \mu\text{s})$, $(C_2=300\ \mu\text{s}, T_2=2000\ \mu\text{s})$, and $(C_3=1000\ \mu\text{s}, T_3=10000\ \mu\text{s})$.
6. `[Concept: unbounded_priority_inversion_and_inheritance]` Compute the worst-case response time $R_H = C_H + B_H$ in microseconds ($\mu\text{s}$, tolerance $\pm 10^{-9}$) of the highest-priority task ($C_H = 80\ \mu\text{s}$) when it is blocked by a Priority-Inheritance mutex (`K_MUTEX_DEFINE` / `xSemaphoreCreateMutex`) held by a lower-priority task with critical-section duration $B_H = 25\ \mu\text{s}$.
7. `[Concept: can_bitwise_arbitration_and_mit_packing]` On a properly terminated CAN bus with two $120\ \Omega$ end resistors in parallel between `CAN_H` and `CAN_L`, what resistance in ohms ($\Omega$, tolerance $\pm 10^{-9}$) should your multimeter read between `CAN_H` and `CAN_L` with power OFF?
8. `[Concept: can_bitwise_arbitration_and_mit_packing]` Encode $x = 0.0\text{ rad}$ into an unsigned 16-bit integer $u = \operatorname{round}\!\left(\frac{x - x_{\min}}{x_{\max} - x_{\min}} \cdot 65535\right)$ for symmetric range $[x_{\min}, x_{\max}] = [-12.5, +12.5]\text{ rad}$ (tolerance $\pm 10^{-9}$).

**Gate answer key:**
```python
import math

g1_spi_us = (16.0 / 8e6) * 1e6
g2_choice = "A"
g3_choice = "A"
g4_choice = "A"
g5_util = (100.0 / 500.0) + (300.0 / 2000.0) + (1000.0 / 10000.0)
g6_rh = 80.0 + 25.0
g7_can_ohm = (120.0 * 120.0) / (120.0 + 120.0)
g8_u16 = round((0.0 - (-12.5)) / 25.0 * 65535)

assert math.isclose(g1_spi_us, 2.0, rel_tol=1e-9)
assert g2_choice == "A"
assert g3_choice == "A"
assert g4_choice == "A"
assert math.isclose(g5_util, 0.45, rel_tol=1e-9)
assert math.isclose(g6_rh, 105.0, rel_tol=1e-9)
assert math.isclose(g7_can_ohm, 60.0, rel_tol=1e-9)
assert g8_u16 == 32768
```
- **Pass mark:** $7/8$ ($80\%+$). Remediation: Q1–Q3 $\to$ `04-embedded.T2.04a`; Q4–Q8 $\to$ `04-embedded.T2.04b`.

## 8. Common mistakes
| Symptom | Root cause | 2-minute fix |
| :--- | :--- | :--- |
| Periodic RTOS task drifts slowly in time (`1000 us` becomes `1040 us`) | Used relative `vTaskDelay(1)` / `k_sleep(K_MSEC(1))` (which sleeps 1 tick *after* the task finishes) instead of absolute deadline scheduling. | Always use `vTaskDelayUntil()` (FreeRTOS) or a periodic `k_timer` / hardware timer semaphore (Zephyr) for periodic control tasks. |
| CAN bus works with 2 boards on the desk, then drops frames when a 3rd board is plugged in | Left the $120\ \Omega$ termination jumper enabled on **every** board ($120/3 = 40\ \Omega$ overload) or forgot termination altogether ($\infty\ \Omega$). | Enable $120\ \Omega$ termination **only** on the two physical end nodes of the daisy chain and verify $60\ \Omega$ between `CAN_H` and `CAN_L` with power off. |
| `micro-ROS` node connects to `micro_ros_agent` but drops subscription callbacks or crashes after 10 minutes | Called dynamic memory allocation (`malloc` / `std::vector`) inside a callback or registered more handles than the static `rclc_executor_init(&exe, &support.context, NUM_HANDLES, &allocator)` count. | Set `NUM_HANDLES` equal to the exact sum of timers + subscriptions + services, pre-allocate fixed message buffers before spinning, and never allocate on the heap at runtime. |
| System deadlocks when two tasks acquire Mutex A and Mutex B in opposite orders | Classic AB-BA lock-ordering deadlock (`Task 1` locks A then waits for B; `Task 2` locks B then waits for A). | Acquire mutexes in a strict global order across all tasks, or keep critical sections single-lock and under $10\ \mu\text{s}$. |

## 9. Resources
- **Richard Barry — *Mastering the FreeRTOS Real Time Kernel*, Zephyr Project Docs (`docs.zephyrproject.org`), & micro-ROS (`micro.ros.org`, `resources/open-source-toolchains.md`):** Preemptive scheduling, Zephyr Devicetree/Kconfig/`k_mutex`, and `micro-ROS` XRCE-DDS `rclc_executor` nodes `[UNVERIFIED]`.
- **Track 04 (`04-embedded-and-realtime/README.md`):** Directly continues into Step 2.5 (`04-embedded.T2.05`) `[VERIFIED 2026-10-15]`.

## 10. Next modules
- Proceed to legacy **Step 2.5 (`04-embedded.T2.05`)** in [`04-embedded-and-realtime/README.md`](../04-embedded-and-realtime/README.md#tier-2-intermediate--applied).
