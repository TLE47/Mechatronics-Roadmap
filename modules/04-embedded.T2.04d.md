---
id: 04-embedded.T2.04d
title: "micro-ROS on Microcontrollers: XRCE-DDS Client-Agent Transport, Static rclc_executor & MCU-to-ROS 2 Bridging"
track: "04"
tier: 2
prereqs:
  - 04-embedded.T2.04c
new_concepts:
  - microros_xrcedds_client_agent_bridge
  - rclc_static_lifecycle_and_executor
  - mcu_to_ros2_deterministic_transport
uses:
  - zephyr_static_threads_and_k_mutex
  - can_bitwise_arbitration_and_mit_packing
  - dma_zero_cpu_memory_transfer
est_hours: 4.0
hardware_required: false
safety_level: none
resources_verified: true
difficulty:
  math: 4
  coding: 3
  tools: 3
  hardware_risk: low
  simulation: full
verification: ci-native
---

## 1. Why it matters
This is the final bridge module in the Track 04 Tier 2 ladder before Step 2.5 (`04-embedded.T2.05`). Once your microcontroller runs FreeRTOS (`04-embedded.T2.04b`) or Zephyr RTOS (`04-embedded.T2.04c`), how does it exchange typed topics, services, and timestamps with a Linux companion computer running **ROS 2** (`Track 06`)? Standard ROS 2 DDS (`Fast DDS` / `Cyclone DDS`) requires megabytes of RAM, multicast UDP discovery sockets, and dynamic C++ heap allocations that do not fit on a microcontroller with $128\text{ KiB}$ of SRAM. **micro-ROS** solves this by running an ultra-lightweight **`XRCE-DDS` (eXtremely Resource Constrained Environments DDS) Client** on the MCU (over UART DMA, CAN-FD, or UDP) that bridges through a **`micro_ros_agent`** on the Linux host into the native ROS 2 graph, driven by a deterministic **`rclc_executor`** with zero dynamic heap allocation during real-time execution! Already know this? Take the Skip test or the Ladder Gate test in section 7 first.

## 2. Intuition first
Before bridging your microcontroller to **ROS 2** (which you will explore in full depth in Track 06 `06-robotics.T2.06a`), here is a self-contained 60-second primer on the four **ROS 2 Graph** terms used in this module:
- **Self-Contained ROS 2 Vocabulary Primer (No Track 06 Prerequisites Needed):**
  1. **Node (`rcl_node_t`):** An independent software participant in a robot system (e.g., `/wrist_actuator_node` on your MCU or `/motion_planner` on a Linux PC).
  2. **Topic (`Publisher` & `Subscription`):** A named data bus (like `/joint_states` or `/cmd_torque`) where **Publishers** broadcast strongly typed structs (`sensor_msgs/msg/JointState`) and **Subscribers** receive them via registered callbacks.
  3. **Service (`rcl_service_t`):** A synchronous request-reply RPC call (e.g., `/calibrate_zero_offset`) used for one-shot configuration rather than high-rate streaming.
  4. **Quality of Service (`QoS`) & `DDS` / `CDR`:** **DDS (Data Distribution Service)** is the middleware that serializes messages into compact **CDR (Common Data Representation)** byte arrays. Each topic specifies a **QoS** policy: **`Best-Effort`** sends UDP-like frames with zero retry stalls (ideal for $500\text{ Hz}$ real-time telemetry), whereas **`Reliable`** acknowledges and retransmits dropped packets (ideal for configuration commands).

Three architectural ideas explain how **micro-ROS** puts a microcontroller directly onto the ROS 2 graph without sacrificing hard-real-time determinism:
- **Why Standard DDS Cannot Run on an MCU & How `XRCE-DDS` Client-Agent Works:** In standard desktop ROS 2, every node discovers every other node directly ($O(N^2)$ peer-to-peer discovery packets and large socket buffers). Instead, **micro-ROS** uses a **Client-Agent proxy architecture** (`OMG DDS-XRCE` standard): your microcontroller runs a tiny $< 30\text{ KiB}$ `Micro XRCE-DDS Client` that talks over a point-to-point serial/CAN-FD/USB link to a **`micro_ros_agent`** process on the Linux companion computer. The Agent acts as the MCU's proxy in the standard ROS 2 DDS world—creating real ROS 2 publishers and subscribers on the MCU's behalf so `ros2 topic list` and `ros2 topic echo` see your microcontroller as a first-class ROS 2 node!
- **Static Memory Lifecycle (`rclc`) & Zero Heap in the Loop:** If a C callback calls `malloc()` inside a $500\text{ Hz}$ motor loop, heap fragmentation will eventually crash the MCU. In micro-ROS (`rclc`), all entities (`rclc_support_t`, `rcl_node_t`, `rcl_publisher_t`, `rcl_subscription_t`, `rcl_timer_t`, `rclc_executor_t`) and message buffers are allocated **once** during boot initialization (`CONFIGURE` phase). Once the control loop enters the `RUNNING` phase (`rclc_executor_spin_some()`), **zero bytes of heap allocation** are ever permitted!
- **Deterministic `rclc_executor` Ordering & `rmw_uros_sync_session` Clock Sync:** Unlike desktop ROS executors that may dispatch callbacks in non-deterministic order, the micro-ROS **`rclc_executor`** executes handles in the **exact sequential order** you registered them (`rclc_executor_add_timer`, `rclc_executor_add_subscription`), supporting explicit `ON_NEW_DATA` or `ALWAYS` trigger semantics so you can run a sense $\to$ plan $\to$ act pipeline deterministically inside a Zephyr or FreeRTOS thread, while `rmw_uros_sync_session()` synchronizes the MCU's nanosecond clock (`rmw_uros_epoch_nanos()`) to the ROS 2 host via an NTP-style round-trip offset calculation!

## 3. Formalization
1. **micro-ROS `XRCE-DDS` Wire Framing & Transport Bandwidth Budget:**
   - A micro-ROS message with serialized CDR payload of $B_{\text{cdr}}$ bytes is wrapped in an `XRCE-DDS` submessage + session header of $B_{\text{xrce}}$ bytes (typically $12\text{–}16\text{ bytes}$).
   - Over an `8N1` UART DMA link ($10\text{ bits/byte}$ at baud rate $R_{\text{baud}}$) or a CAN-FD bus ($8\text{ bits/byte}$ at data bit rate $R_{\text{can}}$), the wire transmission time per message and total link utilization across $M$ periodic streams at frequencies $f_m$ ($\text{Hz}$) are:

$$
t_{\text{wire,uart}} = \frac{10 (B_{\text{cdr}} + B_{\text{xrce}})}{R_{\text{baud}}}, \qquad t_{\text{wire,canfd}} = \frac{8 (B_{\text{cdr}} + B_{\text{xrce}})}{R_{\text{can}}}, \qquad U_{\text{link}} = \sum_{m=1}^{M} f_m \, t_{\text{wire},m} < 1.0
$$

2. **`rclc` Static Entity Initialization & Deterministic `rclc_executor` Budget:**
   - **Handle Count Invariant:** When initializing `rclc_executor_init(&exe, &support.context, H_total, &allocator)`, the static handle capacity $H_{\text{total}}$ must equal the exact sum of registered timers, subscriptions, services, and clients:

$$
H_{\text{total}} = N_{\text{timers}} + N_{\text{subs}} + N_{\text{srvs}} + N_{\text{clients}}
$$

   - **Per-Spin WCET Bound:** Inside a periodic RTOS thread of period $T_{\text{spin}}$ calling `rclc_executor_spin_some(&exe, timeout_ns)`, the worst-case execution time across transport I/O ($t_{\text{io}}$) and all $H_{\text{total}}$ callbacks ($C_h$) must satisfy:

$$
t_{\text{spin,wcet}} = t_{\text{io}} + \sum_{h=1}^{H_{\text{total}}} C_h \le T_{\text{spin}}
$$

3. **NTP-Style MCU-to-ROS 2 Clock Synchronization (`rmw_uros_sync_session`):**
   - The MCU sends a sync request at local timestamp $t_1$, the `micro_ros_agent` timestamps receipt at host time $t_2$ and transmits a reply at host time $t_3$, and the MCU receives the reply at local timestamp $t_4$. The symmetric round-trip delay $\delta_{\text{rtt}}$ and clock offset $\theta_{\text{offset}}$ (such that $t_{\text{ros2}} \approx t_{\text{mcu}} + \theta_{\text{offset}}$) are:

$$
\delta_{\text{rtt}} = (t_4 - t_1) - (t_3 - t_2), \qquad \theta_{\text{offset}} = \frac{(t_2 - t_1) + (t_3 - t_4)}{2}
$$


## 4. Worked example
**Predict first (before you run it):** Write down three numbers before running the audit. (1) What is the wire time of the $48 + 16 = 64\text{ B}$ joint-state frame over $5\text{ Mbps}$ CAN-FD at $500\text{ Hz}$, and what is $U_{\text{link}}$ for that publisher plus the $24 + 16 = 40\text{ B}$ command at $500\text{ Hz}$? (2) What is the spin WCET for $t_{\text{io}} = 35\ \mu\text{s}$ and four callbacks totalling $150\ \mu\text{s}$, as a percentage of the $2000\ \mu\text{s}$ thread? (3) What clock offset does the four-timestamp exchange report? Two tells: a utilisation of $10.4\%$ means the CAN-FD frame was charged $10$ bits per byte instead of $8$, and an offset of $-499000\ \mu\text{s}$ means $t_2 - t_1$ and $t_3 - t_4$ were subtracted in the wrong order.
Audit a micro-ROS actuator node running inside a $500\text{ Hz}$ ($T_{\text{spin}} = 2000\ \mu\text{s}$) Zephyr/FreeRTOS thread: (1) compute the `XRCE-DDS` wire time and link utilization for a $48\text{-byte}$ joint state payload ($+16\text{-byte}$ XRCE header) at $500\text{ Hz}$ and a $24\text{-byte}$ command subscription ($+16\text{-byte}$ XRCE header) at $500\text{ Hz}$ over $5\text{ Mbps}$ CAN-FD, (2) verify the static `rclc_executor` handle count and spin WCET budget, and (3) compute the NTP clock offset $\theta_{\text{offset}}$ and round-trip delay $\delta_{\text{rtt}}$ from a `rmw_uros_sync_session()` exchange.

```python
import math

# 1. XRCE-DDS over 5 Mbps CAN-FD transport budget at 500 Hz:
R_can_bps = 5_000_000.0
f_pub, B_pub_cdr, B_xrce = 500.0, 48, 16
f_sub, B_sub_cdr = 500.0, 24

t_wire_pub_us = (8.0 * (B_pub_cdr + B_xrce) / R_can_bps) * 1e6   # 64 B -> 102.4 us
t_wire_sub_us = (8.0 * (B_sub_cdr + B_xrce) / R_can_bps) * 1e6   # 40 B -> 64.0 us
u_link = (f_pub * t_wire_pub_us + f_sub * t_wire_sub_us) / 1e6
assert math.isclose(t_wire_pub_us, 102.4, rel_tol=1e-9)
assert math.isclose(t_wire_sub_us, 64.0, rel_tol=1e-9)
assert math.isclose(u_link, 0.0832, rel_tol=1e-9)  # 8.32% bus utilization!

# 2. rclc_executor static handle count & WCET spin budget (T_spin = 2000 us):
n_timers, n_subs, n_srvs, n_clients = 1, 2, 1, 0
H_total = n_timers + n_subs + n_srvs + n_clients
assert H_total == 4
t_io_us = 35.0
cb_wcets_us = [45.0, 30.0, 25.0, 50.0]  # 1 timer, 2 subs, 1 service
t_spin_wcet_us = t_io_us + sum(cb_wcets_us)
assert math.isclose(t_spin_wcet_us, 185.0, rel_tol=1e-9)
assert t_spin_wcet_us <= 2000.0

# 3. rmw_uros_sync_session NTP clock offset calculation (in microseconds):
t1_mcu, t2_host, t3_host, t4_mcu = 1000.0, 500_120.0, 500_150.0, 1270.0
rtt_us = (t4_mcu - t1_mcu) - (t3_host - t2_host)
offset_us = ((t2_host - t1_mcu) + (t3_host - t4_mcu)) / 2.0
assert math.isclose(rtt_us, 240.0, rel_tol=1e-9)
assert math.isclose(offset_us, 499_000.0, rel_tol=1e-9)
print(f"u_link={u_link*100:.2f}%, H_total={H_total}, spin_WCET={t_spin_wcet_us:.1f} us, offset={offset_us:.1f} us")
```
Expected output:
```text
u_link=8.32%, H_total=4, spin_WCET=185.0 us, offset=499000.0 us
```

## 5. Exercise
Suppose a micro-ROS node communicates with `micro_ros_agent` over an `8N1` UART DMA link ($10\text{ bits/byte}$) at $R_{\text{baud}} = 921{,}600\text{ bps}$, publishing a serialized payload of $B_{\text{cdr}} = 32\text{ bytes}$ with an `XRCE-DDS` header of $B_{\text{xrce}} = 14\text{ bytes}$. Compute (a) the total wire frame size $B_{\text{total}} = B_{\text{cdr}} + B_{\text{xrce}}$ in bytes, (b) the UART wire transmission time $t_{\text{wire}} = \frac{10 \cdot B_{\text{total}}}{R_{\text{baud}}} \times 10^6$ in microseconds ($\mu\text{s}$), and (c) the clock offset $\theta_{\text{offset}} = \frac{(t_2 - t_1) + (t_3 - t_4)}{2}$ when $t_1 = 200\ \mu\text{s}, t_2 = 10{,}300\ \mu\text{s}, t_3 = 10{,}340\ \mu\text{s}, t_4 = 440\ \mu\text{s}$. Verify $B_{\text{total}} = 46\text{ B}$, $t_{\text{wire}} \approx 499.1319\ \mu\text{s}$ ($\pm 10^{-4}$), and $\theta_{\text{offset}} = 10{,}000.0\ \mu\text{s}$.
- **If your result differs:** Remember that `8N1` UART adds 1 start bit + 1 stop bit per byte ($10\text{ bits/byte}$ total, so $46\text{ B} = 460\text{ bits}$ at $921{,}600\text{ bps}$ takes $460 / 921{,}600 \approx 499.13\ \mu\text{s}$).

### Graded package - the plant's own telemetry link
[`exercises/04-embedded.T2.04d/`](../exercises/04-embedded.T2.04d/) turns this section into a test. `starter.py` holds seven holes: `wire_time_us` (header included, 10 bits per byte on 8N1 and 8 on CAN-FD), `link_utilization`, `handle_total`, `spin_wcet_us`, `ntp_rtt_us`, `ntp_offset_us` and `rtos_utilization`. Edit it, then run the tests the way CI does:

```bash
EXERCISE_TARGET=exercises/04-embedded.T2.04d/starter.py \
  python3 -m unittest discover -s exercises/04-embedded.T2.04d -p 'test_*.py'
```

The tests are behavioural: the $46\text{ B}$ frame must take $499.1319\ \mu\text{s}$ (an 8-bit-per-byte budget is 20% optimistic); the worked CAN-FD budget must be 8.32%; a three-stream link at 3 kHz must cross unity; the handle count must be exact; the spin WCET must count **every** callback; the four-timestamp exchange must give 240 and 499 000, and a symmetric link must recover a planted offset exactly while an asymmetric one is biased by half the difference; and the RTOS load must be a sum of ratios, not a mean. Four planted faults - `wire_no_header`, `uart_eight_bits`, `util_mean_freq`, `offset_one_way` - each fail the test named for them. The transfer suite is the **shared plant's 20-byte telemetry frame at 1 kHz**: utilisation must exceed one on 115.2 kbaud and stay below it at 500 kbaud, the submission's unity crossing must land on the same baud rate where `plant.simulate_uart_tx` stops dropping frames, the NTP offset over that link must be exact when symmetric and biased by half the congestion when not, and the audited 185 µs spin must fit the plant's 1 ms tick.


- **📚 What to Learn & Resources to Solve This Exercise:**
  - **Required Foundations Modules (`00-foundations`):** [`00-foundations.T1.00b`](00-foundations.T1.00b.md) (*Arrays & Linear Regression*) and [`00-foundations.T1.00c`](00-foundations.T1.00c.md) (*Baud Rate, Bits/Bytes & Nanosecond Clock Offsets*).
  - **Prerequisite Bridge Modules:** [`04-embedded.T1.04b`](04-embedded.T1.04b.md) (*Binary Framing*) and [`04-embedded.T2.04c`](04-embedded.T2.04c.md) (*Zephyr Static Threads*).
  - **Core Concepts to Review First:** XRCE-DDS wire framing overhead & baud-rate link utilization, static memory budgets (`sizeof(handle) * N <= arena`) with deterministic `rclc_executor` handle ordering, and NTP-style four-timestamp clock offset $\theta_{\text{offset}} = \frac{(t_2 - t_1) + (t_3 - t_4)}{2}$ in `## 3. Formalization` and `## 4. Worked example` above.
  - **Study Links & Resources:** [Official micro-ROS Documentation & Zephyr Tutorials (`micro.ros.org`)](https://micro.ros.org/docs/tutorials/core/first_application_rtos/zephyr/) and [eProsima Micro XRCE-DDS Docs (`micro-xrce-dds.docs.eprosima.com`)](https://micro-xrce-dds.docs.eprosima.com/).

### Starter code
```python
# --- Exercise scaffold: fill in each TODO, then compare against the numbers in the full solution below ---
import math

def wire_time_us(payload_bytes, xrce_bytes, bits_per_byte, bit_rate):
    """Wire time for one message, in microseconds, framing included."""
    # TODO 1: 10 bits/byte on 8N1 and 8 on CAN-FD, and the XRCE header rides along
    ...

def link_utilization(streams, bits_per_byte, bit_rate):
    """Sum of `frequency * wire_time` over `(frequency, payload, xrce)` streams, as a fraction."""
    # TODO 2: weight every stream by its frequency - a mean of the wire times is not a load
    ...

def handle_total(n_timers, n_subs, n_srvs, n_clients):
    """The exact static capacity `rclc_executor_init` needs."""
    # TODO 3: one handle per entity, no slack
    ...

def spin_wcet_us(t_io_us, callbacks_us):
    """Worst-case time for one `rclc_executor_spin_some`."""
    # TODO 4: transport I/O plus EVERY registered callback
    ...

def ntp_rtt_us(t1_mcu, t2_host, t3_host, t4_mcu):
    """Round-trip delay from the four timestamps."""
    # TODO 5: subtract the host's own processing time (t3 - t2) from the elapsed time
    ...

def ntp_offset_us(t1_mcu, t2_host, t3_host, t4_mcu):
    """Clock offset `t_ros2 - t_mcu` from the NTP midpoint."""
    # TODO 6: average the forward leg (t2 - t1) and the backward leg (t3 - t4)
    ...

def rtos_utilization(tasks):
    """`sum(C_i / T_i)` over `(execution_us, period_us)` tasks."""
    # TODO 7: execution over period, summed - never the mean across tasks
    ...

print("scaffold ready: 7 TODOs to fill, then compare against the numbers in the full solution")
```

**Expected numbers (the answer):** $B_{\text{total}} = 46\text{ B}$; $t_{\text{wire}} \approx 499.1319\ \mu\text{s}$; $\theta_{\text{offset}} = 10{,}000.0\ \mu\text{s}$.

### Hint ladder
1. **Count the bytes, then the bits.** $B_{\text{total}} = 32 + 14 = 46\text{ B}$; an `8N1` frame charges $10$ bits for each of them, so $460$ bits at $921{,}600\text{ bps}$ is $460/921{,}600\ \text{s} = 499.1319\ \mu\text{s}$ - using $8$ bits/byte gives $399.31\ \mu\text{s}$, exactly $20\%$ optimistic.
2. **The offset averages two legs.** Forward is $t_2 - t_1 = 10{,}300 - 200 = 10{,}100\ \mu\text{s}$; backward is $t_3 - t_4 = 10{,}340 - 440 = 9{,}900\ \mu\text{s}$; their mean is the offset, and the $200\ \mu\text{s}$ between them is the asymmetry that the midpoint cannot see.
3. **The round trip is what is left after the host's own work.** $\delta_{\text{rtt}} = (t_4 - t_1) - (t_3 - t_2) = 240 - 40 = 200\ \mu\text{s}$, so the link is symmetric at $100\ \mu\text{s}$ each way.
4. **Utilisation is a sum of ratios.** A stream's share is its frequency times its wire time, so $500\ \text{Hz}$ on a $499\ \mu\text{s}$ frame would already be $25\%$ of the link - keep it as a fraction of one, never as a mean of milliseconds.

### Full Solution
```python
import math

def wire_time_us(payload_bytes, xrce_bytes, bits_per_byte, bit_rate):
    return 1e6 * bits_per_byte * (payload_bytes + xrce_bytes) / bit_rate

def link_utilization(streams, bits_per_byte, bit_rate):
    return sum(f * wire_time_us(payload, xrce, bits_per_byte, bit_rate)
               for f, payload, xrce in streams) / 1e6

def handle_total(n_timers, n_subs, n_srvs, n_clients):
    return n_timers + n_subs + n_srvs + n_clients

def spin_wcet_us(t_io_us, callbacks_us):
    return t_io_us + sum(callbacks_us)

def ntp_rtt_us(t1_mcu, t2_host, t3_host, t4_mcu):
    return (t4_mcu - t1_mcu) - (t3_host - t2_host)

def ntp_offset_us(t1_mcu, t2_host, t3_host, t4_mcu):
    return ((t2_host - t1_mcu) + (t3_host - t4_mcu)) / 2.0

def rtos_utilization(tasks):
    return sum(execution / period for execution, period in tasks)

b_total = 32 + 14
t_wire = wire_time_us(32, 14, 10, 921_600)
offset = ntp_offset_us(200.0, 10_300.0, 10_340.0, 440.0)
rtt = ntp_rtt_us(200.0, 10_300.0, 10_340.0, 440.0)

assert b_total == 46
assert math.isclose(t_wire, 499.1319, abs_tol=1e-4)
assert math.isclose(offset, 10_000.0, rel_tol=1e-12)
assert math.isclose(rtt, 200.0, rel_tol=1e-12)
assert handle_total(1, 2, 1, 0) == 4
assert math.isclose(spin_wcet_us(35.0, [45.0, 30.0, 25.0, 50.0]), 185.0, rel_tol=1e-12)
assert math.isclose(link_utilization([(500.0, 48, 16), (500.0, 24, 16)], 8, 5_000_000.0), 0.0832, rel_tol=1e-9)
assert math.isclose(rtos_utilization([(100.0, 500.0), (300.0, 2000.0), (1000.0, 10000.0)]), 0.45, rel_tol=1e-12)

print(f"B_total={b_total} B | t_wire={t_wire:.4f} us | rtt={rtt:.1f} us | offset={offset:.1f} us")
```

Printed: `B_total=46 B | t_wire=499.1319 us | rtt=200.0 us | offset=10000.0 us`

### Break it on purpose
Inject the byte-width fault the exercise plants (`uart_eight_bits`), keeping the exercise's $46\text{ B}$ frame at $921{,}600\text{ bps}$:
- **Inject:** budget the `8N1` UART link as $8\text{ bits/byte}$ — the CAN-FD constant — instead of $10\text{ bits/byte}$.
- **Symptom:** the $46\text{ B}$ frame reads $399.31\ \mu\text{s}$ instead of $499.13\ \mu\text{s}$, exactly $20\%$ optimistic, so a $2\text{ kHz}$ stream that is $99.8\%$ of the link reports $79.9\%$: a link that drops frames looks healthy until the agent's receive buffer overruns.
- **Diagnose:** the error is confined to the UART path and is exactly the ratio $10/8 = 1.25$, while the CAN-FD budgets, which genuinely carry $8$ bits per byte, stay correct. A baud-rate typo would move both paths and would not land on $1.25$; a missing XRCE header would shorten the frame by $14\text{ B}$ instead of scaling it.
- **Fix:** charge $10$ bits per byte on 8N1 ($1$ start $+ 8$ data $+ 1$ stop), re-measure $499.1319\ \mu\text{s}$, and confirm the crossing against `plant.simulate_uart_tx`: $115.2\text{ kbaud}$ must still drop frames and $500\text{ kbaud}$ must drop none.

## 6. Simulation path
You can run a complete **micro-ROS Client + `micro_ros_agent`** loop on Linux using Zephyr's `native_sim` target or the host UDP transport **with zero physical microcontroller hardware**, or bridge a physical `STM32G4`/`ESP32` over USB-UART:

The graded package is also a workbench entry: **Modules -> `EX.04-embedded.T2.04d`**, where `selfcheck.py` is appended below the starter and **Verify** compares its `SELF-CHECK PASS:` line. `scripts/e2e_pages_bundle.mjs` drives it on the built bundle, so the browser path is tested, not assumed.
- **One-Time `micro_ros_agent` Setup (Ubuntu 24.04 / WSL2 — see [`resources/open-source-toolchains.md` §0.4b–4c](../resources/open-source-toolchains.md#0-core-supported-os-environment-terminal-bootstrap--python-venv-setup)):**
  `micro_ros_agent` is not installed by default in `ros-jazzy-desktop`; build it once in `~/microros_ws` with `colcon` (after installing ROS 2 Jazzy + `python3-colcon-common-extensions` per `resources/open-source-toolchains.md` §0.4b) **or** run the official Docker container directly:
  ```bash
  # One-Time Native Build of micro_ros_agent (Option 1):
  source /opt/ros/jazzy/setup.bash
  mkdir -p ~/microros_ws/src && cd ~/microros_ws
  git clone -b jazzy https://github.com/micro-ROS/micro_ros_setup.git src/micro_ros_setup
  sudo apt update && rosdep install --from-paths src --ignore-src -y
  colcon build && source install/local_setup.bash
  ros2 run micro_ros_setup create_agent_ws.sh
  ros2 run micro_ros_setup build_agent.sh
  source ~/microros_ws/install/local_setup.bash
  ```
```bash
# Path A — 100% Hardware-Free Host Simulation (UDP port 8888):
ros2 run micro_ros_agent micro_ros_agent udp4 --port 8888
# (Or zero-build Docker equivalent: docker run -it --rm --net=host microros/micro-ros-agent:jazzy udp4 --port 8888)
# In Terminal 2: run the Zephyr native_sim or host micro-ROS client binary
./build/zephyr/zephyr.exe

# Path B — Physical Microcontroller over USB-UART (/dev/ttyACM0 at 921600 bps):
ros2 run micro_ros_agent micro_ros_agent serial --dev /dev/ttyACM0 -b 921600
# In Terminal 2: verify live MCU topics on the ROS 2 graph
source /opt/ros/jazzy/setup.bash && ros2 topic list && ros2 topic echo /joint_states
```
Or inspect the MCU-to-host packet framing and real-time scheduling budgets in **Tab 8 (Attitude ESKF & SeqLock)** of the MechaLab Workbench (`npm run dev`).
```text
[MCU Task_Ctrl (1 kHz)] --(k_mutex / Queue)--> [MCU Task_uROS: rclc_executor (500 Hz)]
                                                        || (XRCE-DDS over CAN-FD / UART DMA / UDP)
[ROS 2 Graph (/joint_states, /cmd_torque)] <== [Linux Host: micro_ros_agent]
```
Pass/fail verification in simulation: `u_link == 0.0832`, `H_total == 4`, `t_spin_wcet_us == 185.0 us`, and `offset_us == 499000.0 us`.


```mermaid
flowchart LR
    A["04-embedded.T2.04d: microros_xrcedds_client_agent_bridge"] --> B["rclc_static_lifecycle_and_executor"]
    B --> C["mcu_to_ros2_deterministic_transport"]
    C --> D["Verified Simulation & Checkpoint Pass"]
```

## 7. Checkpoint
Pass criteria: score $\ge 80\%$ ($4/4$) on the Skip test or score $\ge 80\%$ ($7/8$) on the Ladder Gate test below to unlock Step 2.5 (`04-embedded.T2.05`).

### Skip test
1. `[Recall] [Concept: microros_xrcedds_client_agent_bridge]` Compute the wire transmission time $t_{\text{wire}} = \frac{8(B_{\text{cdr}} + B_{\text{xrce}})}{R_{\text{can}}} \times 10^6$ in microseconds ($\mu\text{s}$, tolerance $\pm 10^{-9}$) for a micro-ROS message with payload $B_{\text{cdr}} = 36\text{ B}$ and XRCE header $B_{\text{xrce}} = 14\text{ B}$ over a $R_{\text{can}} = 4.0\text{ Mbps}$ ($4 \times 10^6\text{ bps}$) CAN-FD bus.
2. `[Apply] [Concept: rclc_static_lifecycle_and_executor]` You initialize a micro-ROS `rclc_executor` for a node with $N_{\text{timers}} = 2$ periodic timers, $N_{\text{subs}} = 3$ topic subscriptions, and $N_{\text{srvs}} = 1$ calibration service ($N_{\text{clients}} = 0$). Compute the exact static handle count $H_{\text{total}}$ to pass to `rclc_executor_init()` (exact integer, tolerance $\pm 0$).
3. `[Transfer] [Concept: mcu_to_ros2_deterministic_transport]` During `rmw_uros_sync_session()`, the MCU sends a sync packet at local time $t_1 = 500.0\ \mu\text{s}$, the host Agent receives it at $t_2 = 200{,}600.0\ \mu\text{s}$ and replies at $t_3 = 200{,}640.0\ \mu\text{s}$, and the MCU receives the reply at $t_4 = 740.0\ \mu\text{s}$. Compute the clock offset $\theta_{\text{offset}} = \frac{(t_2 - t_1) + (t_3 - t_4)}{2}$ in microseconds ($\mu\text{s}$, tolerance $\pm 10^{-6}$).
4. `[Spaced review -> 04-embedded.T2.04c — Concept: zephyr_static_threads_and_k_mutex] [Concept: rclc_static_lifecycle_and_executor]` Why do production Zephyr/FreeRTOS actuators separate the $10\text{–}40\text{ kHz}$ inner motor control ISR/thread from the $100\text{–}500\text{ Hz}$ `micro-ROS` `rclc_executor` thread, and why is dynamic heap allocation (`malloc`) forbidden inside `rclc_executor_spin_some()`?
   - **A.** Because `malloc()` makes the motor spin faster.
   - **B.** Isolating the inner motor loop guarantees sub-microsecond control determinism even if serial/CAN transport frames are delayed, while pre-allocating all `rclc` entities statically prevents non-deterministic heap fragmentation and out-of-memory crashes during long missions.
   - **C.** Because `rclc_executor` can only run once per hour.
   - **D.** Because micro-ROS does not support publishers.

**Answer key:**
```python
import math

q1_twire_us = (8.0 * (36.0 + 14.0) / 4_000_000.0) * 1e6
q2_handles = 2 + 3 + 1 + 0
q3_offset_us = ((200_600.0 - 500.0) + (200_640.0 - 740.0)) / 2.0
q4_choice = "B"

assert math.isclose(q1_twire_us, 100.0, rel_tol=1e-9)
assert q2_handles == 6
assert math.isclose(q3_offset_us, 200_000.0, rel_tol=1e-9)
assert q4_choice == "B"
```
- **Pass mark:** $4/4$ ($80\%+$). If you missed Q1, study `## 3. Formalization` item 1; if you missed Q2 or Q4, study `## 3. Formalization` item 2; if you missed Q3, study `## 3. Formalization` item 3. On pass, proceed to `## 10. Next modules`.

### Gate test
Covers the complete Track 04 Tier 2 bridge ladder (`04-embedded.T2.04a` $\to$ `04-embedded.T2.04b` $\to$ `04-embedded.T2.04c` $\to$ `04-embedded.T2.04d`) before Step 2.5 (`04-embedded.T2.05`):
1. `[Concept: spi_full_duplex_clock_polarity_phase] [Concept: dma_zero_cpu_memory_transfer]` Compute the pure clock transfer time in microseconds ($\mu\text{s}$, tolerance $\pm 10^{-9}$) to shift `16` bits over SPI at $f_{\text{sclk}} = 8.0\text{ MHz}$ ($8 \times 10^6\text{ Hz}$).
2. `[Concept: double_buffered_ping_pong_half_complete_isr]` In a ping-pong circular DMA buffer of total size $2N = 20$ samples ($N = 10$ per half), when the **Transfer-Complete (`TC`)** interrupt fires (`HAL_ADC_ConvCpltCallback`) as DMA wraps from index `19 -> 0`, which half of the buffer has just finished filling and is safe for the CPU to read?
   - **A.** The second half (`Pong`, indices `10..19`) while DMA starts filling indices `0..9`.
   - **B.** The first half (`Ping`, indices `0..9`) while DMA starts overwriting indices `0..9`.
   - **C.** Neither half.
   - **D.** Index `20`.
3. `[Concept: rtos_preemptive_scheduling_and_cpu_utilization]` Compute the total CPU utilization $U = \sum C_i / T_i$ (tolerance $\pm 10^{-9}$) for three periodic RTOS tasks: $(C_1=100\ \mu\text{s}, T_1=500\ \mu\text{s})$, $(C_2=300\ \mu\text{s}, T_2=2000\ \mu\text{s})$, and $(C_3=1000\ \mu\text{s}, T_3=10000\ \mu\text{s})$.
4. `[Concept: unbounded_priority_inversion_and_inheritance]` Compute the worst-case response time $R_H = C_H + B_H$ in microseconds ($\mu\text{s}$, tolerance $\pm 10^{-9}$) of the highest-priority task ($C_H = 80\ \mu\text{s}$) when it blocks on a Priority-Inheritance mutex (`xSemaphoreCreateMutex` / `K_MUTEX_DEFINE`) held by a lower-priority task with remaining critical section $B_H = 25\ \mu\text{s}$.
5. `[Concept: can_bitwise_arbitration_and_mit_packing]` Encode $x = 0.0\text{ rad}$ into an unsigned 16-bit integer $u = \operatorname{round}\!\left(\frac{x - x_{\min}}{x_{\max} - x_{\min}} \cdot 65535\right)$ for symmetric range $[x_{\min}, x_{\max}] = [-12.5, +12.5]\text{ rad}$ (exact integer, tolerance $\pm 0$).
6. `[Concept: zephyr_devicetree_hardware_binding] [Concept: zephyr_west_and_kconfig_build]` How does **Zephyr RTOS** bind physical peripheral hardware (`spi1`, `fdcan1`, GPIO pins) to C device drivers compared to traditional bare-metal `#define` macros?
   - **A.** Hardware topology is declared in a **Devicetree (`*.dts` / `.overlay`)** and feature flags in **`Kconfig` (`prj.conf`)**, which compile into type-safe C macros (`DEVICE_DT_GET(DT_NODELABEL(...))`) verified at build time.
   - **B.** Zephyr parses HTML files over Wi-Fi at $40\text{ kHz}$.
   - **C.** Zephyr does not support SPI or CAN.
   - **D.** Every thread must call `malloc()` on every tick.
7. `[Concept: zephyr_static_threads_and_k_mutex]` In Zephyr RTOS, two preemptible threads are created with `K_THREAD_DEFINE`: `thread_A` has priority $1$ and `thread_B` has priority $4$. Which thread has higher scheduling urgency, and what primitive must they use to share a bus with priority inheritance?
   - **A.** `thread_A` (priority $1 < 4$) has higher urgency, and they must use `K_MUTEX_DEFINE` (`k_mutex`).
   - **B.** `thread_B` (priority $4 > 1$) has higher urgency, and they must use `k_sem`.
   - **C.** Both threads have identical priority.
   - **D.** Preemptible threads cannot use mutexes.
8. `[Concept: microros_xrcedds_client_agent_bridge] [Concept: rclc_static_lifecycle_and_executor] [Concept: mcu_to_ros2_deterministic_transport]` Compute the total `rclc_executor` worst-case spin time $t_{\text{spin}} = t_{\text{io}} + C_{\text{timer}} + C_{\text{sub}}$ in microseconds ($\mu\text{s}$, tolerance $\pm 10^{-9}$) when `XRCE-DDS` transport I/O takes $t_{\text{io}} = 40.0\ \mu\text{s}$, the publisher timer callback takes $C_{\text{timer}} = 55.0\ \mu\text{s}$, and the command subscription callback takes $C_{\text{sub}} = 35.0\ \mu\text{s}$.

**Gate answer key:**
```python
import math

g1_spi_us = (16.0 / 8e6) * 1e6
g2_choice = "A"
g3_util = (100.0 / 500.0) + (300.0 / 2000.0) + (1000.0 / 10000.0)
g4_rh = 80.0 + 25.0
g5_u16 = round((0.0 - (-12.5)) / 25.0 * 65535)
g6_choice = "A"
g7_choice = "A"
g8_spin_us = 40.0 + 55.0 + 35.0

assert math.isclose(g1_spi_us, 2.0, rel_tol=1e-9)
assert g2_choice == "A"
assert math.isclose(g3_util, 0.45, rel_tol=1e-9)
assert math.isclose(g4_rh, 105.0, rel_tol=1e-9)
assert g5_u16 == 32768
assert g6_choice == "A"
assert g7_choice == "A"
assert math.isclose(g8_spin_us, 130.0, rel_tol=1e-9)
```
- **Pass mark:** $7/8$ ($80\%+$). Remediation: Q1–Q2 $\to$ `04-embedded.T2.04a`; Q3–Q5 $\to$ `04-embedded.T2.04b`; Q6–Q7 $\to$ `04-embedded.T2.04c`; Q8 $\to$ `04-embedded.T2.04d`.

## 8. Common mistakes
| Symptom | Root cause | 2-minute fix |
| :--- | :--- | :--- |
| `rclc_executor_add_subscription` returns `RCL_RET_ERROR` at startup | Passed a smaller `number_of_handles` to `rclc_executor_init()` than the total number of timers + subscriptions + services added. | Set `number_of_handles` to the exact sum $N_{\text{timers}} + N_{\text{subs}} + N_{\text{srvs}} + N_{\text{clients}}$. |
| `micro-ROS` node connects to `micro_ros_agent` but `String` or `Float64MultiArray` messages arrive empty | Forgot to assign a static C buffer (`msg.data.data = static_buf; msg.data.capacity = sizeof(static_buf);`) to sequence/string fields before spinning. | Pre-allocate static arrays for all dynamic-length ROS 2 message sequences during initialization (`micro_ros_utilities_create_static_message_memory`). |
| `tf2` on the ROS 2 host rejects MCU sensor messages as being $40\text{ years}$ in the past | Stamped `header.stamp` with raw MCU boot ticks (`k_uptime_get()`) instead of synchronized epoch time. | Call `rmw_uros_sync_session(1000)` at startup (and periodically) and stamp headers using `rmw_uros_epoch_nanos()`. |

## 9. Resources
- **Open Robotics / eProsima — *Official micro-ROS Documentation (`micro.ros.org`, `rclc` Executor, Static Memory & Zephyr/FreeRTOS Transports)* (`resources/open-source-toolchains.md`):** Complete architecture of `Micro XRCE-DDS`, `rclc_executor`, and `rmw_uros_sync_session` `[VERIFIED 2026-10-15]`.
- **Track 04 (`04-embedded-and-realtime/README.md`):** Directly continues into Step 2.5 (`04-embedded.T2.05`) and connects to Track 06 (`06-robotics.T2.06a`) `[VERIFIED 2026-10-15]`.

## 10. Next modules
- Proceed to legacy **Step 2.5 (`04-embedded.T2.05`)** in [`04-embedded-and-realtime/README.md`](../04-embedded-and-realtime/README.md#tier-2-intermediate--applied).
