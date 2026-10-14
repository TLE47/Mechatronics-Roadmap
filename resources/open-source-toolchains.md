# Production Open-Source Toolchain Matrix (Tier 1 → Tier 3)

> **Curated for:** [MechaLab Multi-Pass Tiered Roadmap](../README.md)  
> You do not need to install 20 industrial solvers on Day 1! Adopt toolchains progressively as you advance through the three linear passes:
> * **🟢 Level 0 & Pass 1 (Tier 1 — Beginner Pass):** `PlatformIO` / `Arduino IDE`, `SimpleFOC`, `Python` (`NumPy`/`Matplotlib`), `PulseView` (`sigrok`), and `Onshape` / `FreeCAD` basics.
> * **🔵 Pass 2 (Tier 2 — Applied Pass):** `KiCad 8/9` (4-layer PCBs), `ngspice`, `CadQuery` / `Build123d`, `MuJoCo`, `Python Control` (`control`), `FreeRTOS` / `Zephyr`, `Ruckig`, and `PlotJuggler`.
> * **🟣 Pass 3 (Tier 3 — Production Pass):** `FastHenry2` / `openEMS`, `Gmsh` + `CalculiX` Modal FEA, `Pinocchio` ($O(n)$ RNEA), `acados` / `OSQP` / `TinyMPC`, `GTSAM`, `PREEMPT_RT` Linux + `ros2_control`, and `Verilator` / `Yosys`.

---

## 1. End-to-End Mechatronics Toolchain Flow

```mermaid
flowchart LR
    subgraph ECAD_SIM["1. Electronics & EM Simulation"]
        KICAD["KiCad 8/9<br/>Schematic, 6-Layer PCB,<br/>IPC-2581 / Gerber Export"]
        NGSPICE["ngspice / Xyce<br/>Mixed-Signal & Power<br/>Transient / AC Loop Sim"]
        OPENEMS["openEMS / FastHenry2<br/>3D EM Field & Loop<br/>Inductance Extraction"]
        KICAD <--> NGSPICE
        KICAD --> OPENEMS
    end

    subgraph MCAD_FEA["2. Mechanics, CAD & Multiphysics FEA"]
        FREECAD["FreeCAD 1.0+ / CadQuery<br/>Parametric & Python-Driven<br/>B-Rep Solid Modeling"]
        GMSH["Gmsh<br/>2nd-Order Tetrahedral /<br/>Hexahedral Meshing"]
        CALCULIX["CalculiX / Elmer FEM<br/>Static Stress, Thermal &<br/>Modal Eigenvalue Solver"]
        FREECAD -->|STEP| GMSH --> CALCULIX
    end

    subgraph DYN_CTRL["3. Multibody Dynamics & Optimal Control"]
        PINOCCHIO["Pinocchio + CasADi<br/>O(n) RNEA/ABA + Analytical<br/>Derivatives & SysID"]
        MUJOCO["MuJoCo / Drake<br/>Contact-Implicit Physics<br/>& MIL Verification"]
        ACADOS["acados / OSQP / TinyMPC<br/>Embedded C Codegen for<br/>RTI-NMPC & CBF-QP"]
        FREECAD -->|URDF / Inertia| PINOCCHIO
        PINOCCHIO <--> MUJOCO
        PINOCCHIO --> ACADOS
    end

    subgraph EMB_HIL["4. Real-Time Firmware, FPGA & HIL"]
        ZEPHYR["Zephyr RTOS / FreeRTOS / RTIC<br/>ARM GCC / LLVM + CMake<br/>Zero-Heap C++20 / Rust"]
        VERILATOR["Yosys + nextpnr + Verilator<br/>FPGA RTL Synthesis &<br/>Cycle-Accurate Co-Sim"]
        PLOT["PlotJuggler + Foxglove + sigrok<br/>Real-Time Telemetry, FFT &<br/>Protocol Decoding"]
        ACADOS -->|Static C99/C++20| ZEPHYR
        ZEPHYR --> PLOT
        VERILATOR --> ZEPHYR
    end

    style ECAD_SIM fill:#450a0a,stroke:#f87171,color:#fef2f2
    style MCAD_FEA fill:#1e293b,stroke:#f59e0b,color:#fef3c7
    style DYN_CTRL fill:#064e3b,stroke:#34d399,color:#ecfdf5
    style EMB_HIL fill:#1e3a8a,stroke:#60a5fa,color:#eff6ff
```

---

## 2. Electronics, SPICE & Electromagnetic Extraction

| Tool | License | Primary Engineering Role | Key Production Features & CLI / Automation Integration |
| :--- | :--- | :--- | :--- |
| **KiCad (`8.0+ / 9.0`)** | GPLv3 | Schematic capture, multilayer PCB layout, 3D STEP export | Native `kicad-cli` for automated CI DRC/ERC checks, BOM CSV generation, PDF schematic plots, and Gerber/IPC-2581 fab packages. |
| **ngspice / Xyce** | BSD / GPL | Analog front-end, gate-drive transient, and small-signal loop simulation | Integrated inside KiCad or driven headless from Python (`PySpice`) to run automated Monte-Carlo component tolerance and thermal sweeps. |
| **FastHenry2 / FastCap2** | MIT-like | 3D quasi-static parasitic inductance ($L$) and capacitance ($C$) extraction | Extracts the exact $6\times 6$ mutual inductance matrix of PCB half-bridge switching loops to predict $L_{\text{loop}}\,dI/dt$ overshoot before tape-out. |
| **openEMS** | GPLv3 | 3D Finite-Difference Time-Domain (FDTD) electromagnetic solver | Full-wave simulation of PCB trace impedance, return-path discontinuities, and near-field/far-field radiated emissions. |

---

## 3. Mechanical CAD, Meshing & Finite Element Analysis (FEA)

| Tool | License | Primary Engineering Role | Key Production Features & CLI / Automation Integration |
| :--- | :--- | :--- | :--- |
| **FreeCAD (`1.0+`)** | LGPLv2+ | Parametric 3D solid modeling, assembly constraints, FEM workbench | Full Python API (`import FreeCAD`), bidirectional STEP/IGES exchange, and direct integration with Gmsh and CalculiX. |
| **CadQuery / Build123d** | Apache 2.0 | Code-first parametric Python CAD (`OpenCASCADE` kernel) | Enables version-controlled (`git diff`) programmatic generation of cycloidal disks, flexure hinges, bearing housings, and custom motor stators. |
| **Gmsh** | GPLv2+ | Parametric 3D finite-element mesh generator | Generates high-quality 10-node quadratic tetrahedral (`C3D10`) meshes essential for accurate bending stiffness in thin flexures. |
| **CalculiX (`ccx`)** | GPLv2 | Structural static, nonlinear contact, thermal, and modal eigenvalue FEA | Uses Abaqus-compatible `.inp` deck syntax; extracts natural frequencies ($\omega_1\dots\omega_n$), mass-normalized mode shapes, and stress tensors. |
| **Elmer FEM** | LGPLv2.1 | Multiphysics FEA (coupled electromagnetic-thermal-structural) | Simulates motor stator Joule heating, eddy-current losses, and thermal expansion deformation in one coupled solve. |
| **onshape-to-robot / phobos** | MIT / BSD | CAD-to-URDF/MJCF automated exporter | Extracts exact mass, Center of Mass (CoM), and $3\times 3$ inertia tensors directly from CAD assemblies into `URDF` and `MuJoCo` XML models. |

---

## 4. Multibody Dynamics, Simulation & Optimal Control Solvers

| Tool | License | Primary Engineering Role | Key Production Features & CLI / Automation Integration |
| :--- | :--- | :--- | :--- |
| **Pinocchio** | BSD-2 | Fast $O(n)$ rigid-body dynamics and analytical derivatives | Computes RNEA, ABA, CRBA, operational-space $\Lambda(q)$, and exact analytical Jacobians $\frac{\partial \tau}{\partial q}, \frac{\partial \tau}{\partial \dot{q}}$ in $< 4\ \mu\text{s}$ in C++ (`Eigen`) and Python. |
| **MuJoCo (`DeepMind`)** | Apache 2.0 | High-speed contact-implicit physics engine | Industry standard for legged/manipulation simulation; supports tendon routing, actuator delay, sensor noise models, and C/C++ plugin loops. |
| **Drake (`MIT / TRI`)** | BSD-3 | Model-based multibody dynamics, trajectory optimization, and Lyapunov verification | First-class support for symbolic/autodiff (`AutoDiffXd`) plant inspection, Direct Collocation, Sums-of-Squares (SOS), and hydroelastic contact. |
| **CasADi** | LGPLv3 | Symbolic framework for algorithmic differentiation and nonlinear optimization | Generates zero-allocation C99 code for nonlinear kinematics, dynamics, Jacobians, and Hessians with exact sparsity patterns. |
| **`acados`** | BSD-2 | Embedded Nonlinear Model Predictive Control (NMPC) & MHE | Implements Real-Time Iteration (RTI), Gauss-Newton Hessian approximations, and calls `HPIPM`/`BLASFEO` for sub-millisecond embedded execution. |
| **OSQP / ProxQP / TinyMPC** | Apache 2.0 / BSD-2 / MIT | Embedded Convex Quadratic Programming (QP) solvers | Division-free active-set/ADMM solvers with warm-starting and static C code generation (`0` `malloc` calls) for Cortex-M4/M7 and `PREEMPT_RT`. |
| **Python Control (`control`)** | BSD-3 | LTI state-space, Bode/Nyquist, Gang of Four, LQR/Kalman/Hinfsyn | MATLAB-compatible API (`tf`, `ss`, `bode`, `gangof4`, `dlqr`, `hinfsyn`, `c2d`) for scriptable control design and SysID verification. |

---

## 5. Embedded Firmware, RTOS, FPGA & Telemetry

| Tool | License | Primary Engineering Role | Key Production Features & CLI / Automation Integration |
| :--- | :--- | :--- | :--- |
| **ARM GNU Toolchain / LLVM Embedded + CMake + Ninja** | GPL / Apache 2.0 | Cross-compilation, linker-script memory partitioning, static analysis | Combine with `-fno-exceptions -fno-rtti -Wall -Wextra -Werror -Wconversion` and `clang-tidy` / `cppcheck` in CI. |
| **Zephyr RTOS / FreeRTOS** | Apache 2.0 / MIT | Deterministic real-time operating systems | Priority-inheritance mutexes, static object allocation (`configSUPPORT_DYNAMIC_ALLOCATION 0`), devicetree hardware description, and CAN-FD/EtherCAT stacks. |
| **RTIC (`Real-Time Interrupt-driven Concurrency`)** | MIT / Apache 2.0 | Hardware-scheduled concurrency framework for Embedded Rust | Uses the ARM Cortex-M NVIC hardware directly to implement Stack Resource Policy (SRP) with **zero kernel software overhead** and compile-time deadlock freedom. |
| **OpenOCD / probe-rs / pyOCD + GDB** | GPL / MIT / Apache 2.0 | SWD/JTAG flashing, hardware breakpoints, real-time RTT/SWO trace | `probe-rs` and `SEGGER RTT` stream high-rate binary telemetry from target RAM over SWD without halting or slowing the $40\text{ kHz}$ control ISR! |
| **Renode** | BSD-3 | Deterministic instruction-set & multi-node network simulator | Boots unmodified production ARM `.elf` binaries in CI and simulates virtual CAN-FD/SPI/UART networks across multiple MCU nodes. |
| **Yosys + nextpnr + Verilator + Surfer** | ISC / LGPL | Open-source Verilog/SystemVerilog synthesis, place-and-route, and fast C++ cycle-accurate RTL simulation | Compiles FPGA quadrature decoders, sinc³ $\Sigma\Delta$ filters, and SVPWM generators into fast C++ models that co-simulate directly with firmware. |
| **PlotJuggler & `sigrok` / PulseView** | MPL 2.0 / GPLv3 | High-rate real-time telemetry plotting, live FFT, and logic-analyzer protocol decoding | Decodes SPI, BiSS-C, CAN-FD, I2C, and PWM timings while streaming live CSV/UDP/ZeroMQ/MCAP control signals. |

---

## 6. Curated Awesome-Mechatronics Open-Source Ecosystem (Tier-Mapped Directory)

*Ingested and mapped from the open-source mechatronics community ([`engyasin/awesome-mechatronics`](https://github.com/engyasin/awesome-mechatronics)).*

### 🟢 Tier 1: Beginner / Intuitive Ecosystem
* **Simulators & Web Tools:**
  - 🔗 [Falstad Circuit Simulator](https://www.falstad.com/circuit/) — *Real-time animated circuit simulation displaying voltage as color and current as moving electrons.*
  - 🔗 [Wokwi Browser Simulator](https://wokwi.com/) — *Simulate ESP32, STM32, and Arduino hardware with virtual logic analyzers, ADCs, and PWM.*
  - 🔗 [Tinkercad Circuits](https://www.tinkercad.com/circuits) — *Visual breadboard wiring and introductory microcontroller simulation.*
  - 🔗 [myPhysicsLab](https://www.myphysicslab.com/) — *Interactive 2D physics simulations of spring-mass-dampers and pendulums.*
  - 🔗 [Webots Robot Simulator](https://cyberbotics.com/) — *Beginner-friendly open-source 3D robot simulator with cross-platform C/C++/Python APIs.*
* **Hardware & Starter Toolchains:**
  - 🔗 [Arduino IDE 2.x](https://www.arduino.cc/en/software) — *Entry-level IDE for flashing 8-bit and 32-bit development boards.*
  - 🔗 [ESP32 / ESP-IDF Framework](https://github.com/espressif/esp-idf) — *Low-cost dual-core Wi-Fi/BLE MCU with hardware motor control PWM (MCPWM).*
  - 🔗 [Raspberry Pi Pico / RP2040](https://www.raspberrypi.com/documentation/microcontrollers/) — *Dual-core Cortex-M0+ with Programmable I/O (PIO) state machines.*
* **High-Level Libraries:**
  - 🔗 [SimpleFOC Library](https://github.com/simplefoc/Arduino-FOC) — *Open-source library for driving 3-phase BLDC/Stepper motors with breakout boards.*
  - 🔗 [grbl CNC Motion Controller](https://github.com/gnea/grbl) — *High-performance, low-cost open-source G-code parser and 3-axis motion controller.*
  - 🔗 [AccelStepper](https://www.airspayce.com/mikem/arduino/AccelStepper/) — *Non-blocking stepper motor library with acceleration and deceleration ramps.*

### 🔵 Tier 2: Intermediate / Applied Ecosystem
* **ECAD & Circuit Analysis:**
  - 🔗 [KiCad EDA (8.0+)](https://www.kicad.org/) — *Professional open-source schematic capture and 4–8 layer PCB layout with 3D raytracing.*
  - 🔗 [ngspice](https://ngspice.sourceforge.io/) — *Open-source mixed-signal SPICE engine for AC loop, transient, and Monte Carlo sweeps.*
  - 🔗 [Qucs-S](https://ra3xdh.github.io/) — *Quite Universal Circuit Simulator with SPICE GUI integration.*
  - 🔗 [EasyEDA](https://easyeda.com/) — *Cloud-based schematic capture and PCB layout tightly integrated with JLCPCB parts libraries.*
* **Parametric CAD & Modeling:**
  - 🔗 [FreeCAD (1.0+)](https://www.freecad.org/) — *Open-source parametric 3D modeler with assembly, draft, and FEM workbenches.*
  - 🔗 [OpenSCAD](https://openscad.org/) — *The programmers' solid 3D CAD modeler using constructive solid geometry (CSG).*
  - 🔗 [CadQuery](https://github.com/CadQuery/cadquery) — *Python-based parametric CAD framework built on the OpenCASCADE technology kernel.*
* **Embedded Environments & RTOS:**
  - 🔗 [PlatformIO](https://platformio.org/) — *Professional collaborative platform for embedded development with dependency management.*
  - 🔗 [STM32CubeIDE / STM32CubeMX](https://www.st.com/en/development-tools/stm32cubeide.html) — *Peripheral configuration GUI and C/C++ IDE for ARM Cortex-M microcontrollers.*
  - 🔗 [FreeRTOS Kernel](https://www.freertos.org/) — *Market-leading real-time operating system for microcontrollers and small microprocessors.*
  - 🔗 [MicroPython](https://micropython.org/) — *Lean Python 3 implementation optimized to run on bare-metal microcontrollers.*
  - 🔗 [micro-ROS](https://micro.ros.org/) — *Puts ROS 2 onto resource-constrained microcontrollers over serial, CAN, or UDP.*
* **Numerical Methods & Control:**
  - 🔗 [GNU Octave](https://octave.org/) — *Free, open-source high-level language primarily intended for numerical computations (MATLAB compatible).*
  - 🔗 [Python Control Systems Library (`python-control`)](https://python-control.readthedocs.io/) — *Python package that implements basic operations for analysis and design of feedback control systems.*
  - 🔗 [SymPy](https://www.sympy.org/) — *Python library for symbolic mathematics, kinematics equations, and Jacobian derivations.*
  - 🔗 [CasADi](https://web.casadi.org/) — *Open-source tool for nonlinear optimization and algorithmic differentiation.*
* **Actuators, Drivers & Telemetry:**
  - 🔗 [VESC Project (Benjamin Vedder)](https://vesc-project.com/) — *Open-source motor controller hardware and firmware for high-power electric drives.*
  - 🔗 [PlotJuggler](https://github.com/facontidavide/PlotJuggler) — *Fast, extensible time-series visualization tool for CSV, ULog, ROS 1/2, and MQTT data.*
  - 🔗 [Foxglove Studio](https://foxglove.dev/) — *Modern visualization and debugging tool for robotics with custom 3D and plot panels.*

### 🟣 Tier 3: Advanced / Production Ecosystem
* **Robotics Middleware & Whole-Body Stacks:**
  - 🔗 [ROS 2 (Humble / Jazzy)](https://docs.ros.org/) — *Industry-standard open-source robot middleware with DDS communications.*
  - 🔗 [ros2_control](https://control.ros.org/) — *Real-time controller manager and hardware abstraction layer for ROS 2.*
  - 🔗 [MoveIt 2](https://moveit.picknik.ai/) — *Advanced manipulation framework for kinematics, motion planning, and collision checking.*
  - 🔗 [Nav2](https://nav2.org/) — *Autonomous navigation framework for mobile robots using behavior trees and costmaps.*
* **Rigid-Body Dynamics & GPU Physics:**
  - 🔗 [Pinocchio (LAAS-CNRS)](https://github.com/stack-of-tasks/pinocchio) — *Blazing-fast C++ library for rigid body dynamics algorithms ($O(n)$ RNEA/ABA) and derivatives.*
  - 🔗 [Drake (MIT / Toyota Research Institute)](https://drake.mit.edu/) — *Model-based design, trajectory optimization, and Lyapunov verification for robotic systems.*
  - 🔗 [MuJoCo (Google DeepMind)](https://mujoco.org/) — *Multi-Joint dynamics with Contact: convex optimization physics engine.*
  - 🔗 [NVIDIA Isaac Sim / Isaac Lab](https://developer.nvidia.com/isaac-sim) — *GPU-accelerated photorealistic simulation and synthetic data generation built on Omniverse.*
  - 🔗 [PyBullet](https://pybullet.org/) — *Python module for physics simulation for robotics, games, and machine learning.*
* **Embedded Optimization & Fast Solvers:**
  - 🔗 [acados](https://github.com/acados/acados) — *Fast and embedded solvers for nonlinear model predictive control (NMPC) and moving horizon estimation.*
  - 🔗 [OSQP (Operator Splitting QP Solver)](https://osqp.org/) — *Numerical optimization package for solving convex quadratic programs with division-free embedded C codegen.*
  - 🔗 [TinyMPC](https://tinympc.org/) — *High-speed model predictive control solver designed specifically for microcontrollers.*
* **Production Firmware, Real-Time OS & Safety:**
  - 🔗 [ODrive Robotics](https://github.com/odriverobotics/ODrive) — *High-performance dual-axis brushless motor controller firmware and Python tools.*
  - 🔗 [Zephyr RTOS Project](https://www.zephyrproject.org/) — *Scalable, secure, and safety-oriented real-time operating system with rich driver subsystems.*
  - 🔗 [RTIC (Real-Time Interrupt-driven Concurrency)](https://rtic.rs/) — *Hardware-accelerated concurrency framework for Embedded Rust on ARM Cortex-M.*
  - 🔗 [Linux PREEMPT_RT](https://wiki.linuxfoundation.org/realtime/start) — *Real-time patch turning the Linux kernel into a hard real-time operating system.*
  - 🔗 [Renode (Antmicro)](https://renode.io/) — *Open-source hardware simulation framework enabling virtual multi-node embedded system testing.*

