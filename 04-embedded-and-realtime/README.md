# Track 04: Hard Real-Time Embedded Systems, Industrial Networks & FPGA Co-Design

> **Prerequisites:** [Track 01: Mixed-Signal & Power Electronics](../01-electronics-and-power/README.md), [Track 03: Sensors & Actuators](../03-sensors-and-actuators/README.md)  
> **Feeds Into:** [Track 05: Control & Estimation](../05-control-and-estimation/README.md), [Track 06: Robotics & Autonomy](../06-robotics-and-autonomy/README.md), [Track 07: Systems, HIL & Production](../07-systems-hil-and-production/README.md)  
> **Core Principle:** In a real-time control system, **a mathematically correct answer delivered late is a wrong answer.** Sampling jitter $\Delta t$ acts as phase noise that directly erodes phase margin ($\Delta\phi = -\omega_c \Delta t_{\max}$) and injects multiplicative derivative noise. Production firmware achieves sub-microsecond determinism by offloading timing-critical I/O to hardware timers, DMA controllers, or FPGA fabric—and enforcing strict zero-allocation, lock-free execution paths.

---

## 1. Module Overview & System Context

General-purpose software patterns—dynamic heap allocation (`malloc`/`new`), unbounded recursion, blocking I/O loops, priority-unaware mutexes, and unpinned OS threads—are fatal inside a high-rate control loop. On a modern dual-issue Cortex-M7 running at $480\text{ MHz}$ (`STM32H7`), a single L1 data-cache miss or unconfigured DMA buffer cache-coherency bug can silently feed stale ADC currents to an FOC loop, causing immediate current runaway.

This track covers the complete embedded compute hierarchy:
1. **Bare-Metal Microcontroller Architecture:** ARM Cortex-M4F/M7/M33 pipeline, FPU, TCM (Tightly Coupled Memory), NVIC interrupt tail-chaining, MPU, and hardware timer-to-ADC-to-DMA event chains.
2. **Real-Time Operating Systems (RTOS) & Deterministic Concurrency:** Rate Monotonic (RMA) and Earliest Deadline First (EDF) scheduling theory, Priority Inheritance / Priority Ceiling protocols, and Lock-Free Single-Producer Single-Consumer (SPSC) wait-free ring buffers.
3. **Deterministic Fieldbuses & Industrial Networks:** CAN-FD, DroneCAN/Cyphal, RS-485/BiSS-C, and EtherCAT with Distributed Clocks ($< 100\text{ ns}$ multi-axis sync).
4. **Safety-Critical C/C++20 Firmware Engineering:** Static allocation, fixed-point Q-format arithmetic, hardware watchdogs, brown-out recovery, and WCET measurement via DWT cycle counters.
5. **Heterogeneous SoC & FPGA Co-Design:** Offloading multi-channel $\Sigma\Delta$ sinc³ filters, quadrature decoders, and $100\text{ kHz}$ PWM/current loops to Verilog/SystemVerilog RTL.

---

## 2. Zero-Jitter Hardware-Triggered Control Execution Pipeline

```mermaid
sequenceDiagram
    autonumber
    participant TIM as Advanced Timer (TIM1)<br/>40 kHz Center-Aligned
    participant ADC as Dual/Triple SAR ADC<br/>(ADC1 + ADC2 + ADC3)
    participant DMA as DMA Controller + DMAMUX<br/>(Circular → DTCM RAM)
    participant SPI as SPI Master DMA<br/>(Encoder Read)
    participant ISR as Cortex-M7 Fast ISR<br/>(ITCM RAM, NVIC Prio 0)
    participant RTOS as RTOS Servo Task (1 kHz)<br/>(Lock-Free SPSC Queue)

    Note over TIM,RTOS: Hardware Autonomous Phase (Zero CPU Intervention, < 10 ns Jitter)
    TIM->>ADC: Counter reaches ARR (PWM Center): Hardware TRGO2 Pulse
    TIM->>SPI: Simultaneous Trigger: Start 16-bit Absolute Encoder Frame
    ADC->>ADC: Sample & Hold (150 ns) + 12-bit SAR Conversion (250 ns)
    ADC->>DMA: Conversion Complete Request
    SPI->>DMA: Encoder RX Byte Complete Request
    DMA->>ISR: Write I_abc & θ_raw to DTCM RAM → Assert DMA TC Interrupt

    Note over ISR: Hard Real-Time Execution Window (Total WCET < 3.2 μs / 25 μs Period)
    ISR->>ISR: DWT->CYCCNT Start Timestamp
    ISR->>ISR: Encoder LUT Compensation + PLL Velocity Update
    ISR->>ISR: Clarke/Park Transform + d-q PI + Decoupling + SVPWM
    ISR->>TIM: Write Shadow Registers (CCR1, CCR2, CCR3) before next Update Event
    ISR->>RTOS: Every 40th tick: Atomic SPSC Push (State Telemetry) / Pop (Torque Ref)
    ISR->>ISR: Record WCET = DWT->CYCCNT - Start; Pet Window Watchdog Flag
```

---

## 3. Microcontroller Architecture & Memory Hierarchy Mastery

### 3.1 Cortex-M7 Memory Map: Why TCM Beats L1 Cache for Real-Time Control
High-clock-rate MCUs (`STM32H7`, `i.MX RT1060/1170`) bridge the gap between $480\text{–}1000\text{ MHz}$ CPUs and slower Flash/AXI SRAM using **L1 Instruction/Data Caches (I-Cache / D-Cache)** and **Tightly Coupled Memory (ITCM / DTCM)**:
* **L1 Cache Jitter:** Cache hits take $1\text{ cycle}$, but cache misses stall the CPU for $10\text{–}40\text{ cycles}$ while fetching a 32-byte cache line over the AXI bus. Worse, **DMA controllers bypass the CPU's L1 D-Cache** and read/write physical SRAM directly!
* **The Classic DMA Cache Coherency Bug:** If an ADC DMA writes into cached AXI SRAM, the CPU reads stale values sitting in its L1 D-Cache—and never sees the new motor currents!
* **Production Memory Placement Strategy via Linker Script (`.ld`):**
  1. **ITCM RAM ($0\text{-wait-state}$ Instruction Tightly Coupled Memory):** Place the $20\text{–}50\text{ kHz}$ `ADC_DMA_IRQHandler()`, Clarke/Park/SVPWM math, and fast trigonometric/LUT functions here using `__attribute__((section(".itcm.text"), noinline))`. Execution is **100% deterministic with zero cache misses**.
  2. **DTCM RAM ($0\text{-wait-state}$ Data Tightly Coupled Memory, Non-Cacheable by Design):** Place the RTOS stacks, control state structs, and DMA buffers (`STM32H7` DMA1/DMA2 via BDMA/MDMA or non-cached SRAM1/2 configured via MPU as `Normal, Non-Cacheable`).

### 3.2 NVIC Interrupt Priority Grouping & Zero-Latency ISRs
Configure ARM Cortex-M NVIC with `NVIC_SetPriorityGrouping(0)` (all 4 priority bits assigned to **preempt priority**, 0 sub-priority bits). Partition interrupt priorities into two strict tiers:

| Priority Level | Assigned Peripherals | RTOS API Allowed? | Max Execution Time (WCET) |
| :--- | :--- | :--- | :--- |
| **Tier 0: Zero-Latency Hard Real-Time (`Prio 0–1`)** | Over-current Fault (`TIM_BRK`), Fast FOC `ADC_DMA_TC` ISR | **NO!** Never Masked by `BASEPRI` (RTOS critical sections cannot delay Tier 0!) | $< 3.5\ \mu\text{s}$ |
| **Tier 1: RTOS-Aware Peripherals (`Prio 2–14`)** | CAN-FD RX/TX, EtherCAT SYNC0, IMU SPI DMA, UART Telemetry | Yes (`xTaskNotifyFromISR`, `xQueueSendFromISR`) | $< 15\ \mu\text{s}$ |
| **Tier 2: Kernel Tick & Context Switch (`Prio 15`, Lowest)** | `SysTick` and `PendSV` | Kernel Internal | $< 5\ \mu\text{s}$ |

> **Critical Insight:** Because Tier 0 interrupts sit *above* `configMAX_SYSCALL_INTERRUPT_PRIORITY` (`BASEPRI`), even if the RTOS kernel is inside a critical section (`taskENTER_CRITICAL()`), the $40\text{ kHz}$ FOC current loop preempts immediately with **12-cycle ($25\text{ ns}$ at $480\text{ MHz}$) hardware entry latency**! Communication between Tier 0 and Tier 1/RTOS tasks **must** use a lock-free SPSC queue or double-buffered sequence lock (`seqlock`), never an RTOS mutex or queue.

---

## 4. Real-Time Scheduling & Lock-Free Concurrency

### 4.1 Real-Time Schedulability Analysis (RMA vs. EDF)
For $m$ independent periodic tasks $\tau_i = (C_i, T_i, D_i)$ with worst-case execution time $C_i$, period $T_i$, and deadline $D_i = T_i$, total processor utilization is $U = \sum_{i=1}^m \frac{C_i}{T_i}$:
* **Rate Monotonic Scheduling (RMS — Fixed Priority, shortest period = highest priority):**
  * **Liu & Layland Sufficient Bound:** $U \le m(2^{1/m} - 1) \xrightarrow{m\to\infty} \ln 2 \approx 0.693$.
  * **Hyperbolic Bound (Bini et al.):** $\prod_{i=1}^m \left(\frac{C_i}{T_i} + 1\right) \le 2$.
  * **Exact Response-Time Analysis (RTA — Necessary & Sufficient with Blocking $B_i$):** For each task $i$, iterate to fixed point:
    $$R_i^{(k+1)} = C_i + B_i + \sum_{j \in hp(i)} \left\lceil \frac{R_i^{(k)}}{T_j} \right\rceil C_j \le D_i$$
    where $hp(i)$ is the set of tasks with higher priority than $i$, and $B_i$ is the maximum blocking time due to lower-priority tasks holding a shared resource under **Priority Inheritance Protocol (PIP)** or **Priority Ceiling Protocol (PCP)**.

### 4.2 Wait-Free Single-Producer Single-Consumer (SPSC) Ring Buffer or Seqlock in C++20
To pass command setpoints from the $1\text{ kHz}$ RTOS Servo Task to the $40\text{ kHz}$ Tier-0 Fast ISR (and telemetry back) with **zero locks and $O(1)$ wait-free determinism**, use a **Sequence Lock (`SeqLock`)** or **Wait-Free Double Buffer**:

```cpp
#include <atomic>
#include <cstdint>
#include <type_traits>

template <typename T>
requires std::is_trivially_copyable_v<T>
class WaitFreeSeqLock {
public:
    // Called by Single Writer (e.g., 40 kHz ISR publishing motor state)
    void write(const T& val) noexcept {
        uint32_t seq = seq_.load(std::memory_order_relaxed);
        seq_.store(seq + 1U, std::memory_order_release); // Odd = write in progress
        std::atomic_thread_fence(std::memory_order_acq_rel);
        data_ = val;
        std::atomic_thread_fence(std::memory_order_acq_rel);
        seq_.store(seq + 2U, std::memory_order_release); // Even = consistent snapshot
    }

    // Called by Reader (e.g., 1 kHz RTOS task reading consistent motor state)
    T read() const noexcept {
        T copy;
        uint32_t seq0, seq1;
        do {
            seq0 = seq_.load(std::memory_order_acquire);
            std::atomic_thread_fence(std::memory_order_acq_rel);
            copy = data_;
            std::atomic_thread_fence(std::memory_order_acq_rel);
            seq1 = seq_.load(std::memory_order_acquire);
        } while ((seq0 != seq1) || ((seq0 & 1U) != 0U));
        return copy;
    }

private:
    alignas(32) std::atomic<uint32_t> seq_{0U};
    T data_{};
};
```

---

## 5. Deterministic Fieldbuses & Industrial Communication

| Bus / Protocol | Physical Layer | Payload & Bandwidth | Synchronization Jitter | Typical Mechatronics Role |
| :--- | :--- | :--- | :--- | :--- |
| **SPI / BiSS-C / EnDat 2.2** | 4-wire CMOS or RS-422 diff pair | $32\text{–}64\text{ bits}$ @ $10\text{–}50\text{ MHz}$ | $< 20\text{ ns}$ (Hardware timer triggered) | On-board / local joint encoder, ADC, and IMU acquisition |
| **CAN 2.0B** | ISO 11898-2 Differential ($120\ \Omega$) | $8\text{ bytes}$ @ $1\text{ Mbps}$ | $50\text{–}250\ \mu\text{s}$ (CSMA/CD arbitration) | Legacy automotive, slow mobile base I/O, up to $4\text{ axes}$ @ $500\text{ Hz}$ |
| **CAN-FD (with Cyphal/DroneCAN)** | ISO 11898-2 Differential | $64\text{ bytes}$ @ $1\text{ Mbps}$ arb / $5\text{–}8\text{ Mbps}$ data | $15\text{–}50\ \mu\text{s}$ | Quadruped/humanoid limb buses ($3\text{–}6\text{ QDD joints}$ per bus @ $1\text{–}2\text{ kHz}$) |
| **EtherCAT** | 100BASE-TX On-the-Fly Ethernet Frame Processing | Up to $1486\text{ bytes}$ @ $100\text{ Mbps}$ full-duplex | **$< 50\text{ ns}$ via Distributed Clocks (`DC SYNC0`)** | Industrial multi-axis CNC, surgical arms, whole-body humanoids ($30+\text{ axes}$ @ $4\text{ kHz}$) |
| **Time-Sensitive Networking (TSN)** | IEEE 802.1AS + 802.1Qbv Gigabit Ethernet | $1\text{ Gbps}+$ Switched Ethernet | $< 100\text{ ns}$ (Hardware PTP timestamping) | Next-gen autonomous vehicle & factory backbones uniting lidar/camera + real-time control |

---

## 6. Heterogeneous SoC & FPGA Co-Design

When control loop rates exceed $50\text{ kHz}$ (e.g., GaN inverters switching at $200\text{ kHz}$, voice-coil nanometric lithography stages, or 16-axis synchronized motor controllers), sequential CPU instruction execution hits a wall. Offloading the inner loop to an FPGA (`Xilinx Zynq-7000 / UltraScale+`, `Lattice ECP5`, or `Intel Cyclone V`) unlocks **true cycle-accurate hardware parallelism**:
* **Sinc³ Digital Decimation Filter for Isolated $\Sigma\Delta$ Current Modulators (`AMC1306`):**
  A $20\text{ MHz}$ 1-bit $\Sigma\Delta$ bitstream filtered in FPGA RTL with a 3rd-order Cascaded Integrator-Comb ($\text{CIC} / \text{sinc}^3$) filter:
  $$H(z) = \left(\frac{1 - z^{-OSR}}{1 - z^{-1}}\right)^3$$
  At oversampling ratio $OSR = 128$, this delivers a clean 16-bit current measurement every $6.4\ \mu\text{s}$ ($156.25\text{ kHz}$) with zero CPU load, alongside a dedicated parallel hardware window comparator (`OSR = 16`) that trips Safe Torque Off in **$< 800\text{ ns}$** on short-circuit fault!

---

## 7. Failure Modes, Pitfalls & Anti-Patterns

1. **Dynamic Heap Allocation (`malloc`, `std::vector::push_back`) in Real-Time Paths:** Heap fragmentation and non-deterministic allocator search times violate hard real-time bounds. Override global `operator new` to link-fail or trap in production builds after boot initialization, and use `std::array`, `etl::vector` (Embedded Template Library), or static memory pools.
2. **Floating-Point Denormals (Subnormals) Stalling FPU Pipeline:** When an IIR filter state decays toward zero ($|x| < 1.175\times 10^{-38}$ in `float32`), IEEE-754 subnormal handling can trigger software traps or microcode stalls. Always set the **Flush-to-Zero (`FZ`, bit 24) and Default NaN (`DN`, bit 25)** bits in the ARM Cortex-M Floating-Point Status and Control Register (`FPSCR`) at startup!
3. **Priority Inversion via Unprotected Shared Mutexes:** A low-priority telemetry logging task holding an I2C/SPI mutex preempted by a medium-priority communications task will starve a high-priority control task waiting on that mutex. Either eliminate shared mutexes via wait-free SPSC queues or strictly enforce `PTHREAD_PRIO_INHERIT` / FreeRTOS Priority Inheritance Mutexes.
4. **Petting the Watchdog Inside a Timer ISR:** Never refresh the Independent/Window Watchdog (`IWDG`/`WWDG`) inside a periodic hardware timer interrupt! If the main RTOS tasks deadlock while interrupts remain enabled, the ISR will happily keep petting the watchdog forever. Require every critical task to set a bit in an atomic health bitmask each cycle, and only pet the watchdog when all bits match within the expected window.

---

## 8. Curated Learning Resources

### Authoritative Textbooks & Standards
* **Yiu, J.** — *The Definitive Guide to ARM Cortex-M3 and Cortex-M4 Processors* (3rd ed., Newnes, 2013) & *System-on-Chip Design with Arm Cortex-M Processors* (2019).
* **Buttazzo, G. C.** — *Hard Real-Time Computing Systems: Predictable Scheduling Algorithms and Applications* (4th ed., Springer, 2024). The mathematical foundation of RMS, EDF, RTA, and resource-sharing protocols.
* **Kopetz, H.** — *Real-Time Systems: Design Principles for Distributed Embedded Applications* (2nd ed., Springer, 2011). Time-triggered architecture, clock synchronization, and fault-tolerant distributed control.
* **Williams, A.** — *C++ Concurrency in Action* (2nd ed., Manning, 2019). Memory models (`std::memory_order`), acquire-release semantics, and lock-free data structures.
* **MISRA C:2023 & AUTOSAR C++14 / BARR-C Coding Standards** — Industry safety coding rules for high-integrity embedded firmware.

### Open-Source Toolchains & Frameworks
* **Zephyr RTOS & FreeRTOS** — Production real-time kernels withMPU isolation, priority inheritance, and broad MCU support.
* **Embassy (`embassy-rs`) & RTIC (`rtic.rs`)** — Rust embedded frameworks; RTIC natively implements hardware-backed Stack Resource Policy (SRP) with compile-time deadlock-free and data-race-free guarantees!
* **Embedded Template Library (`ETLCPP`)** — Zero-heap deterministic C++ containers (`etl::vector`, `etl::queue`, `etl::fsm`).
* **SOEM (Simple Open EtherCAT Master) & IgH EtherCAT Master** — Open-source real-time EtherCAT masters for Linux `PREEMPT_RT`.
* **Verilator + Surfer / GTKWave + Yosys** — Open-source SystemVerilog simulation, waveform inspection, and synthesis.

---

## 9. Hands-On Lab & Milestone Gate

### Lab 04: Zero-Jitter Bare-Metal + RTOS Firmware & Multi-Node CAN-FD / EtherCAT Sync

1. **Objective:** Implement a dual-tier firmware architecture on an ARM Cortex-M7/M4 (`STM32G474` or `STM32H743`) combining a $40\text{ kHz}$ zero-latency Tier-0 FOC ISR with a $1\text{ kHz}$ RTOS Servo/CAN-FD task, and prove timing determinism under heavy bus load.
2. **Tasks:**
   * Configure `TIM1` center-aligned PWM at $40\text{ kHz}$ triggering `ADC1/ADC2` injected/regular conversions into DTCM RAM via DMA with zero CPU polling.
   * Link the Tier-0 ISR into `ITCM` RAM, enable `FPSCR.FZ`, and instrument cycle-accurate WCET histograms (`min`, `mean`, `p99.99`, `max`) using `DWT->CYCCNT`.
   * Connect the Tier-0 ISR to a $1\text{ kHz}$ FreeRTOS/Zephyr task via `WaitFreeSeqLock` and stream $1\text{ kHz}$ torque commands + state telemetry over a $5\text{ Mbps}$ CAN-FD bus loaded to $70\%$ bus utilization.
3. **Quantitative Acceptance Criteria:**

| Metric | Target Requirement | Verification Method |
| :--- | :--- | :--- |
| **ADC-Trigger-to-ISR-Entry Jitter** | Peak-to-peak jitter $< 50\text{ ns}$ ($< 25$ CPU cycles) over $10^7$ consecutive cycles | Logic analyzer / oscilloscope capture on PWM center vs. ISR entry GPIO |
| **Tier-0 FOC ISR Worst-Case Execution Time** | $\text{WCET}_{\max} < 4.0\ \mu\text{s}$ ($< 16\%$ of $25\ \mu\text{s}$ period), with $\text{WCET}_{\max} - \text{WCET}_{\min} < 250\text{ ns}$ | On-target `DWT->CYCCNT` watermark over 1-hour stress test under $70\%$ CAN-FD flood |
| **Zero Heap Allocation Verification** | `0 bytes` allocated from `.heap` section; `malloc`/`sbrk` symbols absent from ELF | `arm-none-eabi-nm` & linker `--wrap=malloc` build gate |
| **Lock-Free IPC Data Integrity** | Zero torn reads or dropped sequence invariants over $10^8$ transfers | 64-bit checksummed struct stress test across Tier-0 ISR and Tier-1 RTOS task |
