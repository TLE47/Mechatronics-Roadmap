# Annotated Library: Authoritative Textbooks, Seminal Papers & Industry Standards

> **Curated for:** [Production-Grade Mechatronics Engineering & Research Roadmap](../README.md)  
> Every entry in this library has been selected for mathematical rigor, physical insight, and direct applicability to building real electromechanical hardware.

---

## 1. Mathematical & Multi-Domain Physical Foundations ([Track 00](../00-foundations/README.md))

| Title & Authors | Year / Edition | Core Contribution & Why It Matters |
| :--- | :--- | :--- |
| **System Dynamics: Modeling, Simulation, and Control of Mechatronic Systems**<br/>*D. C. Karnopp, D. L. Margolis, & R. C. Rosenberg* | 2012 (6th Ed., Wiley) | The definitive text on **Bond Graph modeling**, causal strokes, gyrators/transformers, and deriving unified state-space ODEs across electrical, mechanical, fluid, and thermal domains. |
| **Linear Algebra and Learning from Data** & **Numerical Linear Algebra**<br/>*G. Strang* / *L. N. Trefethen & D. Bau* | 2019 / 1997 (SIAM) | SVD geometry, conditioning numbers, Householder QR, Cholesky factorization, and why naive matrix inversion fails in finite-precision floating point. |
| **A Micro Lie Theory for State Estimation in Robotics** (`arXiv:1812.01537`)<br/>*J. Sola, J. Deray, & D. Atchuthan* | 2018 | Concise, self-contained derivation of Lie groups ($SO(3), SE(3), \mathbb{S}^3$), tangent spaces, exponential/logarithmic maps, Adjoints, and Jacobians on manifolds. |
| **Discrete-Time Signal Processing**<br/>*A. V. Oppenheim & R. W. Schafer* | 2009 (3rd Ed., Pearson) | Sampling theorem, $Z$-transform, FIR/IIR structures, Transposed Direct Form II, coefficient quantization, limit cycles, and Welch spectral analysis. |
| **Computer-Controlled Systems: Theory and Design**<br/>*K. J. Åström & B. Wittenmark* | 2011 (3rd Ed., Dover) | Exact ZOH discretization, inter-sample ripple, aliasing, Tustin pre-warping, and sampled-data stochastic control. |
| **Port-Hamiltonian Systems Theory: An Introductory Overview**<br/>*A. van der Schaft & D. Jeltsema* | 2014 (*FnT in Systems & Control*) | Generalizes Bond Graphs and Lagrangian mechanics into energy-routing Dirac structures and Interconnection and Damping Assignment Passivity-Based Control (IDA-PBC). |

---

## 2. Mixed-Signal Electronics, Power Stages & EMC PCB Design ([Track 01](../01-electronics-and-power/README.md))

| Title & Authors | Year / Edition | Core Contribution & Why It Matters |
| :--- | :--- | :--- |
| **The Art of Electronics (3rd Ed.) & The x-Chapters**<br/>*P. Horowitz & W. Hill* | 2015 & 2020 (Cambridge Univ. Press) | Unmatched practical wisdom on low-noise BJT/JFET/op-amp front ends, active filters, precision voltage references, ADCs, power switching, and grounding. |
| **Electromagnetic Compatibility Engineering**<br/>*H. W. Ott* | 2009 (Wiley) | Return-current inductance physics, PCB stackup partitioning, why split ground planes fail, $360^\circ$ cable shielding, and ESD/CISPR compliance. |
| **Fundamentals of Power Electronics**<br/>*R. W. Erickson & D. Maksimović* | 2020 (3rd Ed., Springer) | State-space averaging, switch-mode buck/boost/bridge topologies, magnetics design, soft switching, and converter loop compensation. |
| **High-Speed Digital Design: A Handbook of Black Magic**<br/>*H. Johnson & M. Graham* | 1993 (Prentice Hall) | Transmission-line reflections, termination topologies, via inductance, power distribution network (PDN) impedance, and clock jitter. |
| **GaN Transistors for Efficient Power Conversion**<br/>*A. Lidow, M. de Rooij, J. Strydom, D. Reusch, & J. Glaser* | 2020 (3rd Ed., Wiley) | Ultra-low-inductance ($< 0.5\text{ nH}$) PCB layout, Kelvin gate loops, and $100+\text{ V/ns}$ switching techniques for eGaN HEMTs. |
| **Fundamentals of MOSFET and IGBT Gate Driver Circuits** (*TI SLUA618A*)<br/>*L. Balogh* | 2017 (Texas Instruments) | Step-by-step gate-charge physics, Miller plateau shoot-through calculation, bootstrap capacitor sizing, and isolated gate drive transformers. |

---

## 3. Precision Mechanics, Kinematics & Multibody Dynamics ([Track 02](../02-mechanics-kinematics-dynamics/README.md))

| Title & Authors | Year / Edition | Core Contribution & Why It Matters |
| :--- | :--- | :--- |
| **Precision Machine Design**<br/>*A. H. Slocum* | 1992 (Prentice Hall / SME) | The foundational masterpiece on exact kinematic constraint, Kelvin/Maxwell couplings, Abbe offset errors, thermal growth compensation, preloaded bearings, and structural loops. |
| **Foundations of Mechanical Accuracy**<br/>*W. R. Moore* | 1970 (Moore Special Tool Co.) | Classic treatise on geometric metrology: flatness, straightness, squareness, master dividing circles, and lapping/scraping mechanics. |
| **Flexures: Elements of Elastic Mechanisms**<br/>*S. T. Smith* | 2000 (CRC Press) | Analytical stiffness, parasitic error motion, fatigue life, and modal dynamics of leaf springs, notch hinges, and monolithic compliant stages. |
| **Modern Robotics: Mechanics, Planning, and Control**<br/>*K. M. Lynch & F. C. Park* | 2017 (Cambridge Univ. Press) | Screw theory, Product of Exponentials (PoE) forward/inverse kinematics, spatial twists/wrenches, and Lagrangian/Newton-Euler dynamics. |
| **Rigid Body Dynamics Algorithms**<br/>*R. Featherstone* | 2008 (Springer) | 6D spatial vector algebra, $O(n)$ Recursive Newton-Euler (RNEA), Composite-Rigid-Body (CRBA), Articulated-Body (ABA), and contact constraints. |
| **Shigley's Mechanical Engineering Design**<br/>*R. G. Budynas & J. K. Nisbett* | 2020 (11th Ed., McGraw-Hill) | Goodman fatigue criteria, shaft deflection, rolling-element bearing $L_{10}$ life, bolted joint preload stiffness, and AGMA gear stress equations. |

---

## 4. Sensors, Metrology, Actuators & FOC Drives ([Track 03](../03-sensors-and-actuators/README.md))

| Title & Authors | Year / Edition | Core Contribution & Why It Matters |
| :--- | :--- | :--- |
| **Analysis of Electric Machinery and Drive Systems**<br/>*P. C. Krause, O. Wasynczuk, S. D. Sudhoff, & S. D. Pekarek* | 2013 (3rd Ed., Wiley-IEEE) | Complete derivation of Clarke/Park reference frame transformations, PMSM/Induction machine equations, and inverter modulation strategies. |
| **Advanced Electrical Drives: Analysis, Modeling, Control**<br/>*R. De Doncker, D. W. J. Pulle, & A. Veltman* | 2020 (2nd Ed., Springer) | Space vector modulation, $d$-$q$ current decoupling, flux weakening, and observer-based sensorless drive control. |
| **A Low Cost Modular Actuator for Dynamic Robots**<br/>*B. Katz* (MIT Master's Thesis) | 2018 (MIT) | Detailed electromechanical design of the MIT Mini-Cheetah Quasi-Direct-Drive (QDD) actuator and compact high-rate FOC firmware. |
| **Determination of Quadrature Encoder Errors (Heydemann Correction)**<br/>*P. L. M. Heydemann* | 1981 (*Applied Optics*, 20(19)) | Least-squares ellipse fitting to remove DC offset, amplitude imbalance, and quadrature phase error in optical interferometers and $\sin/\cos$ encoders. |
| **Anticogging: Torque Ripple Suppression, Modeling, and Parameter Selection**<br/>*M. Piccoli & M. Yim* | 2016 (*IJRR*, 35(1–3)) | Position-indexed harmonic/LUT identification and feedforward cancellation of magnetic cogging torque in brushless actuators. |

---

## 5. Hard Real-Time Embedded Systems, Networks & FPGA ([Track 04](../04-embedded-and-realtime/README.md))

| Title & Authors | Year / Edition | Core Contribution & Why It Matters |
| :--- | :--- | :--- |
| **Hard Real-Time Computing Systems: Predictable Scheduling Algorithms and Applications**<br/>*G. C. Buttazzo* | 2024 (4th Ed., Springer) | Rate Monotonic Analysis (RMA), Earliest Deadline First (EDF), Response-Time Analysis (RTA), Priority Inheritance, and Stack Resource Policy (SRP). |
| **Real-Time Systems: Design Principles for Distributed Embedded Applications**<br/>*H. Kopetz* | 2011 (2nd Ed., Springer) | Time-triggered architectures, distributed clock synchronization (IEEE 1588 / EtherCAT DC), replica determinism, and fault containment regions. |
| **The Definitive Guide to ARM Cortex-M3 and Cortex-M4 / System-on-Chip Design**<br/>*J. Yiu* | 2013 & 2019 (Newnes) | NVIC interrupt tail-chaining, `BASEPRI` zero-latency ISRs, FPU lazy stacking, MPU protection, and bus matrix/TCM architecture. |
| **C++ Concurrency in Action**<br/>*A. Williams* | 2019 (2nd Ed., Manning) | C++ memory model (`memory_order_acquire`/`release`), cache-line ping-pong, and wait-free/lock-free data structures. |
| **Real-Time C++: Efficient Object-Oriented and Template Microcontroller Programming**<br/>*C. Kormanyos* | 2021 (4th Ed., Springer) | Zero-overhead C++20 templates, compile-time `constexpr` LUT generation, custom fixed-size allocators, and bare-metal register access. |

---

## 6. Control Theory, State Estimation & Embedded Optimization ([Track 05](../05-control-and-estimation/README.md))

| Title & Authors | Year / Edition | Core Contribution & Why It Matters |
| :--- | :--- | :--- |
| **Feedback Systems: An Introduction for Scientists and Engineers**<br/>*K. J. Åström & R. M. Murray* | 2021 (2nd Ed., Princeton Univ. Press) | Loop shaping, the Gang of Four ($S, T, PS, CS$), Bode's sensitivity integral, anti-windup, and state-space feedback. |
| **Multivariable Feedback Control: Analysis and Design**<br/>*S. Skogestad & I. Postlethwaite* | 2005 (2nd Ed., Wiley) | Singular-value loop shaping, RGA (Relative Gain Array), structured singular value ($\mu$-analysis), and $H_\infty$ robust control. |
| **Applied Nonlinear Control**<br/>*J.-J. E. Slotine & W. Li* | 1991 (Prentice Hall) | Lyapunov stability, Barbalat's lemma, feedback linearization, sliding mode control, and passivity-based adaptive robot control. |
| **State Estimation for Robotics**<br/>*T. D. Barfoot* | 2024 (2nd Ed., Cambridge Univ. Press) | Matrix Lie group estimation, batch MAP vs. recursive Bayesian filtering, Gauss-Newton on $SE(3)$, and sliding-window factor graphs. |
| **Quaternion Kinematics for the Error-State Kalman Filter** (`arXiv:1711.02508`)<br/>*J. Sola* | 2017 | Complete line-by-line equations for strapdown IMU propagation, tangent-space error covariance, and manifold injection/reset. |
| **Model Predictive Control: Theory, Computation, and Design**<br/>*J. B. Rawlings, D. Q. Mayne, & M. Diehl* | 2020 (2nd Ed., Nob Hill) | Recursive feasibility, terminal cost/set stability proofs, Real-Time Iteration (RTI) NMPC, and Moving Horizon Estimation (MHE). |
| **acados — A Modular Open-Source Framework for Fast Embedded Optimal Control**<br/>*R. Verschueren et al.* | 2022 (*Mathematical Programming Computation*) | High-performance interior-point (`HPIPM`) and active-set QP solvers backed by hardware-vectorized `BLASFEO` kernels for sub-millisecond NMPC. |

---

## 7. Robotics, Whole-Body Control, Perception & Autonomy ([Track 06](../06-robotics-and-autonomy/README.md))

| Title & Authors | Year / Edition | Core Contribution & Why It Matters |
| :--- | :--- | :--- |
| **A Unified Approach for Motion and Force Control of Robot Manipulators**<br/>*O. Khatib* | 1987 (*IEEE J. Robotics & Automation*) | Operational-space inertia matrix $\Lambda(q)$, dynamically consistent null-space projection $\bar{J}(q)$, and task-space decoupling. |
| **Impedance Control: An Approach to Manipulation (Parts I–III)**<br/>*N. Hogan* | 1985 (*ASME J. DSMC*) | Port-based causality (admittance vs. impedance), physical passivity under arbitrary passive environments, and interactive force regulation. |
| **On-Manifold Preintegration for Real-Time Visual-Inertial Odometry**<br/>*C. Forster, L. Carlone, F. Dellaert, & D. Scaramuzza* | 2017 (*IEEE T-RO*, 33(1)) | Preintegrating high-rate IMU measurements on $SO(3) \times \mathbb{R}^6$ with analytical bias Jacobians inside a keyframe factor graph. |
| **Dynamic Locomotion in the MIT Cheetah 3 Through Convex Model-Predictive Control**<br/>*J. Di Carlo, P. M. Wensing, B. Katz, G. Bledt, & S. Kim* | 2018 (*IROS*) | Single-rigid-body centroidal dynamics linearization and real-time convex QP optimization of ground reaction forces over friction cones. |
| **Planning Algorithms** & **Underactuated Robotics**<br/>*S. M. LaValle* / *R. Tedrake* | 2006 / 2024 (MIT Course Notes) | Kinodynamic motion planning, LQR trees, Sums-of-Squares (SOS) Lyapunov funnel verification, and trajectory optimization (`Direct Collocation`). |

---

## 8. Systems Engineering, SysID, HIL & Functional Safety ([Track 07](../07-systems-hil-and-production/README.md))

| Title & Authors | Year / Edition | Core Contribution & Why It Matters |
| :--- | :--- | :--- |
| **System Identification: A Frequency Domain Approach**<br/>*R. Pintelon & J. Schoukens* | 2012 (2nd Ed., Wiley-IEEE) | Schroeder-phased multisine excitation design, Best Linear Approximation (BLA) in the presence of nonlinearities, and closed-loop FRF variance bounds. |
| **Fault-Diagnosis Systems: An Introduction from Fault Detection to Fault Tolerance**<br/>*R. Isermann* | 2006 (Springer) | Parity-equation and observer-based residual generation, parameter-estimation fault detection, and actuator/sensor hardware redundancy. |
| **IEC 61508 / ISO 13849-1 / IEC 61800-5-2 / ISO 10218** | Current Editions | Functional safety lifecycle, Safe Failure Fraction (SFF), Diagnostic Coverage (DC), Performance Level (PLa–PLe), and Safe Torque Off (STO). |
