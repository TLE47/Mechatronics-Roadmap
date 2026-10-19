# Annotated Library: Authoritative Textbooks, Seminal Papers, Courses & Industry Standards (Tier 1 → Tier 3)

> **Curated for:** [MechaLab Multi-Pass Tiered Roadmap](../README.md) · **Merged with [`engyasin/awesome-mechatronics`](https://github.com/engyasin/awesome-mechatronics)**  
> Read these references in synchronization with your current pass through the roadmap:
> * **🟢 Level 0 & Pass 1 (Tier 1 Reading Order):** *Bolton* (Mechatronics 7e), *Alciatore & Histand* (Measurement Systems), *Bishop* (*The Mechatronics Handbook* — Free PDF), *Scherz & Monk* (*Practical Electronics for Inventors*), *Horowitz & Hill* (Ch. 1–4, 9), *Lynch & Park* (Ch. 1–3, 6), *Åström & Murray* (Ch. 1–6, 10 — free at `fbsbook.org`), *Paul McWhorter* (Arduino YouTube), and *SimpleFOC* docs.
> * **🔵 Pass 2 (Tier 2 Reading Order):** *Kaltjob* (*Control of Mechatronic Systems*), *Brunton & Kutz* (*Data-Driven Science & Engineering* — Free PDF), *Horowitz & Hill* (Ch. 5, 8, 13), *Ott* (PCB EMC), *Slocum* (Exact constraint), *Ben Katz's MIT Thesis* (QDD actuators), *Yiu* (Cortex-M), *Tedrake's Underactuated Robotics & Manipulation*, *Capuano et al.* (*Robot Learning: A Tutorial* `arXiv:2510.12403`), and *Warden & Situnayake* (*TinyML*).
> * **🟣 Pass 3 (Tier 3 Reading Order):** *Sola's Micro Lie Theory & ESKF*, *Karnopp et al.* (Bond Graphs), *Featherstone* ($O(n)$ RNEA/ABA), *Krause / De Doncker* ($d$-$q$ FOC), *Buttazzo* (Real-Time Scheduling), *Slotine & Li* (Passivity), *Rawlings / Borrelli* (MPC), *Khatib / Hogan* (Operational Impedance), *Chi et al.* (Diffusion Policy), *Black et al.* (Real-Time Action Chunking Flow Policies), *Kawaharazuka et al.* (VLA Survey), and *Pintelon & Schoukens* (Frequency-Domain SysID).

---

## 0. Evolution of Mechatronics: Classical V-Model → CPS → Embodied & Physical AI

| Title & Authors | Year / Venue | Tier | Core Contribution & Why It Matters |
| :--- | :--- | :---: | :--- |
| **The Evolution of Mechatronics Engineering and Its Relationship with Industry 3.0, 4.0, and 5.0**<br/>*Technologies* ([DOI: 10.3390/technologies14020081](https://doi.org/10.3390/technologies14020081)) | 2026 (Open Access 🆓) | **Tier 1** | Traces the 4 definitions of mechatronics from the 1969 Yaskawa coinage and 1990s V-Model co-design to Industry 4.0 Cyber-Physical Systems (CPS), Industry 5.0 Human-CPS, and Embodied/Physical AI. |
| **The Mechatronics Handbook**<br/>*R. H. Bishop (Ed.)* ([Borrow on Internet Archive](https://archive.org/details/mechatronicshand0000unse)) | CRC Press (Borrow free 🆓) | **Tier 1** | Comprehensive multi-domain desk reference covering sensors, actuators, physical modeling, and microprocessor interfacing. |
| **Mechatronics: Electronic Control Systems in Mechanical and Electrical Engineering (7th Ed.)** & **Introduction to Mechatronics and Measurement Systems (5th Ed.)**<br/>*W. Bolton* / *D. G. Alciatore & M. B. Histand* | Pearson / McGraw-Hill | **Tier 1** | The two classic undergraduate entry textbooks for sensor signal conditioning, op-amps, digital logic, and PLC/microcontroller basics. |
| **Skills for Physical Artificial Intelligence**<br/>*A. Miriyev & M. Kovač* ([*Nature Machine Intelligence*](https://www.nature.com/articles/s42256-020-0177-2)) | 2020 | **Tier 2** | Identifies the co-design gap between materials, mechanical hardware, power autonomy, and embodied intelligence. |
| **Intelligence as Computation** (`arXiv:2412.14701`)<br/>*O. Brock* ([arXiv Free PDF](https://arxiv.org/abs/2412.14701)) & **ITU-T Rec. F.748.66** ([ITU Standard](https://www.itu.int/rec/T-REC-F.748.66)) | 2024 / Dec 2025 | **Tier 3** | Unifies digital, analog, mechanical, and morphological computation into a single continuum; paired with the formal ITU-T standard for embodied AI systems. |

---

## 1. Mathematical & Multi-Domain Physical Foundations ([Track 00](../00-foundations/README.md))

| Title & Authors | Year / Edition | Tier | Core Contribution & Why It Matters |
| :--- | :--- | :---: | :--- |
| **Data-Driven Science and Engineering: Machine Learning, Dynamical Systems, and Control (2nd Ed.)**<br/>*S. L. Brunton & J. N. Kutz* ([databookuw.com](https://www.databookuw.com/)) | 2022 (Cambridge, Free PDF 🆓) | **Tier 2** | Bridges SVD, Fourier/wavelet transforms, Dynamic Mode Decomposition (DMD), SINDy nonlinear system identification, MPC, and reinforcement learning with runnable Python/MATLAB code. |
| **Control of Mechatronic Systems**<br/>*P. O. J. Kaltjob* ([DOI: 10.1002/9781119505730](https://doi.org/10.1002/9781119505730)) | 2021 (Wiley) | **Tier 2** | Focused specifically on discrete-time digital control implementation, physical modeling, and electro-mechanical coupling. |
| **System Dynamics: Modeling, Simulation, and Control of Mechatronic Systems**<br/>*D. C. Karnopp, D. L. Margolis, & R. C. Rosenberg* | 2012 (6th Ed., Wiley) | **Tier 3** | The definitive text on **Bond Graph modeling**, causal strokes, gyrators/transformers, and deriving unified state-space ODEs across electrical, mechanical, fluid, and thermal domains. |
| **Linear Algebra and Learning from Data** & **Numerical Linear Algebra**<br/>*G. Strang* / *L. N. Trefethen & D. Bau* | 2019 / 1997 (SIAM) | **Tier 2/3** | SVD geometry, conditioning numbers, Householder QR, Cholesky factorization, and why naive matrix inversion fails in finite-precision floating point. |
| **A Micro Lie Theory for State Estimation in Robotics** (`arXiv:1812.01537`)<br/>*J. Sola, J. Deray, & D. Atchuthan* ([arXiv](https://arxiv.org/abs/1812.01537)) | 2018 (Free PDF 🆓) | **Tier 3** | Concise, self-contained derivation of Lie groups ($SO(3), SE(3), \mathbb{S}^3$), tangent spaces, exponential/logarithmic maps, Adjoints, and Jacobians on manifolds. |
| **Discrete-Time Signal Processing** & **Computer-Controlled Systems**<br/>*A. V. Oppenheim & R. W. Schafer* / *K. J. Åström & B. Wittenmark* | 2009 / 2011 | **Tier 2/3** | Sampling theorem, $Z$-transform, Transposed Direct Form II biquads, exact ZOH discretization, inter-sample ripple, and Tustin pre-warping. |
| **Port-Hamiltonian Systems Theory** & **Mechatronic Systems: Modelling and Simulation with HDLs**<br/>*A. van der Schaft & D. Jeltsema* / *G. Pelz* | 2014 / 2003 | **Tier 3** | Generalizes Bond Graphs into energy-routing Dirac structures (IDA-PBC) and hardware-description-language (VHDL-AMS/Verilog-AMS) mixed-domain simulation. |

---

## 2. Mixed-Signal Electronics, Power Stages & EMC PCB Design ([Track 01](../01-electronics-and-power/README.md))

| Title & Authors | Year / Edition | Tier | Core Contribution & Why It Matters |
| :--- | :--- | :---: | :--- |
| **Practical Electronics for Inventors (5th Ed.)**<br/>*P. Scherz & S. Monk* | 2022 (McGraw-Hill) | **Tier 1** | Approachable, visual onboarding for passive components, op-amps, transistors, regulators, and bench prototyping before tackling *Horowitz & Hill*. |
| **The Art of Electronics (3rd Ed.) & The x-Chapters**<br/>*P. Horowitz & W. Hill* ([artofelectronics.net](https://artofelectronics.net/)) | 2015 & 2020 (Cambridge) | **Tier 1–3** | Unmatched practical wisdom on low-noise BJT/JFET/op-amp front ends, active filters, precision voltage references, ADCs, power switching, and grounding. |
| **Electromagnetic Compatibility Engineering**<br/>*H. W. Ott* | 2009 (Wiley) | **Tier 2/3** | Return-current inductance physics, PCB stackup partitioning, why split ground planes fail, $360^\circ$ cable shielding, and ESD/CISPR compliance. |
| **Fundamentals of Power Electronics**<br/>*R. W. Erickson & D. Maksimović* | 2020 (3rd Ed., Springer) | **Tier 2/3** | State-space averaging, switch-mode buck/boost/bridge topologies, magnetics design, soft switching, and converter loop compensation. |
| **High-Speed Digital Design: A Handbook of Black Magic**<br/>*H. Johnson & M. Graham* | 1993 (Prentice Hall) | **Tier 3** | Transmission-line reflections, termination topologies, via inductance, power distribution network (PDN) impedance, and clock jitter. |
| **GaN Transistors for Efficient Power Conversion** & **TI SLUA618A Gate Driver Guide**<br/>*A. Lidow et al.* / *L. Balogh* ([TI PDF](https://www.ti.com/lit/pdf/slua618)) | 2020 / 2017 (Free 🆓) | **Tier 3** | Ultra-low-inductance ($< 0.5\text{ nH}$) PCB layout, Kelvin gate loops, Miller plateau shoot-through calculations, and bootstrap sizing. |

---

## 3. Precision Mechanics, Actuation, Compliance & Multibody Dynamics ([Track 02](../02-mechanics-kinematics-dynamics/README.md))

| Title & Authors | Year / Edition | Tier | Core Contribution & Why It Matters |
| :--- | :--- | :---: | :--- |
| **Compact Gearboxes for Modern Robotics: A Review**<br/>*P. L. García et al.* ([*Frontiers in Robotics and AI*](https://www.frontiersin.org/articles/10.3389/frobt.2020.00103/full)) | 2020 (Open Access 🆓) | **Tier 1/2** | Best free quantitative comparison of harmonic (strain-wave), cycloidal, planetary, and QDD transmissions across efficiency, backlash, and backdrivability. |
| **Series Elastic Actuators** & **Variable Impedance Actuators: A Review**<br/>*G. A. Pratt & M. M. Williamson* ([IROS 1995](https://ieeexplore.ieee.org/document/525827)) / *B. Vanderborght et al.* ([RAS 2013](https://www.sciencedirect.com/science/article/pii/S0921889013001188)) | 1995 / 2013 | **Tier 2** | Foundational papers on turning force control into position deformation control via deliberate series elasticity (SEA) and variable stiffness (VSA). |
| **Precision Machine Design** & **Foundations of Mechanical Accuracy**<br/>*A. H. Slocum* ([MIT Free PDFs](https://pergatory.mit.edu/resources/FUNdaMENTALS.html)) / *W. R. Moore* | 1992 / 1970 | **Tier 2/3** | Exact kinematic constraint, Kelvin/Maxwell couplings, Abbe offset errors, thermal growth compensation, preloaded bearings, and structural loops. |
| **Flexures: Elements of Elastic Mechanisms** & **Shigley's Mechanical Engineering Design**<br/>*S. T. Smith* / *R. G. Budynas & J. K. Nisbett* | 2000 / 2020 | **Tier 2/3** | Analytical stiffness and fatigue life of notch hinges/leaf springs, rolling-element bearing $L_{10}$ life, and AGMA gear stress equations. |
| **Modern Robotics: Mechanics, Planning, and Control**<br/>*K. M. Lynch & F. C. Park* ([Free Preprint & Videos](http://hades.mech.northwestern.edu/index.php/Modern_Robotics)) | 2017 (Cambridge, Free 🆓) | **Tier 1–3** | Screw theory, Product of Exponentials (PoE) forward/inverse kinematics, spatial twists/wrenches, and Lagrangian/Newton-Euler dynamics. |
| **Rigid Body Dynamics Algorithms** & **Robotics: Modelling, Planning and Control**<br/>*R. Featherstone* / *B. Siciliano, L. Sciavicco, L. Villani, & G. Oriolo* | 2008 / 2009 (Springer) | **Tier 2/3** | 6D spatial vector algebra, $O(n)$ RNEA, CRBA, ABA, and the standard European analytical robotics curriculum. |
| **Morphological Computation & Active Metamaterials**<br/>*Kortman et al.* ([Adv. Intell. Syst. 2025](https://advanced.onlinelibrary.wiley.com/doi/10.1002/aisy.202400294)) & *Active Metamaterials Roadmap* ([arXiv:2411.09711](https://arxiv.org/abs/2411.09711)) | 2024 / 2025 (Free 🆓) | **Tier 3** | How compliant mechanical bodies and shape-morphing structures offload control effort directly into physical morphology. |

---

## 4. Sensors, Metrology, Actuators & FOC Drives ([Track 03](../03-sensors-and-actuators/README.md))

| Title & Authors | Year / Edition | Tier | Core Contribution & Why It Matters |
| :--- | :--- | :---: | :--- |
| **Analysis of Electric Machinery and Drive Systems** & **Advanced Electrical Drives**<br/>*P. C. Krause et al.* / *R. De Doncker et al.* | 2013 / 2020 | **Tier 2/3** | Complete derivation of Clarke/Park reference frame transformations, PMSM equations, SVPWM modulation, and $d$-$q$ current decoupling. |
| **A Low Cost Modular Actuator for Dynamic Robots** & **Lightweight QDD Hip Exoskeleton**<br/>*B. Katz* ([MIT Thesis](https://dspace.mit.edu/handle/1721.1/118671)) / *S. Yu et al.* ([arXiv:2004.00467](https://arxiv.org/abs/2004.00467)) | 2018 / 2020 (Free 🆓) | **Tier 2/3** | Complete electromechanical design, encoder LUT calibration, and thermal/backdrivability trade-offs of Quasi-Direct-Drive (QDD) actuators. |
| **Cycloidal QDD Actuators with Learning-Based Torque Estimation** (`arXiv:2410.16591`)<br/>([arXiv Free PDF](https://arxiv.org/abs/2410.16591)) | 2024 (Free 🆓) | **Tier 3** | Demonstrates how learned residual models compensate for cycloidal gear friction/ripple to achieve sensorless proprioceptive torque control. |
| **Heydemann Encoder Correction** & **Piccoli & Yim Anticogging**<br/>*P. L. M. Heydemann* (*Applied Optics*) / *M. Piccoli & M. Yim* (*IJRR*) | 1981 / 2016 | **Tier 3** | Least-squares Lissajous ellipse fitting for $\sin/\cos$ encoders and position-indexed harmonic LUT cancellation of magnetic cogging torque. |

---

## 5. Hard Real-Time Embedded Systems, Industrial PLC/OPC-UA & Edge AI ([Track 04](../04-embedded-and-realtime/README.md))

| Title & Authors | Year / Edition | Tier | Core Contribution & Why It Matters |
| :--- | :--- | :---: | :--- |
| **Programmable Logic Controllers (6th Ed.)** & **Automotive Mechatronics**<br/>*F. D. Petruzella* / *Bosch Professional* | 2022 / 2014 | **Tier 1/2** | Deterministic PLC scan-cycle execution (IEC 61131-3 Structured Text & Ladder) and automotive CAN/FlexRay/AUTOSAR drivetrain electronics. |
| **TinyML** & **State of Edge AI on Microcontrollers in 2026** & **MicroFlow** (`arXiv:2409.19432`)<br/>*P. Warden & D. Situnayake* / *S. Hymel* ([Blog](https://shawnhymel.com/3125/state-of-edge-ai-on-microcontrollers-in-2026/)) / *M. Carnelos* ([arXiv](https://arxiv.org/abs/2409.19432)) | 2020–2026 (Free 🆓) | **Tier 2/3** | Deploying quantized neural networks for real-time vibration anomaly detection and condition monitoring directly on Cortex-M / Rust MCUs. |
| **Hard Real-Time Computing Systems (4th Ed.)** & **Real-Time Systems**<br/>*G. C. Buttazzo* / *H. Kopetz* | 2024 / 2011 (Springer) | **Tier 3** | Rate Monotonic Analysis (RMA), Earliest Deadline First (EDF), Response-Time Analysis (RTA), Priority Inheritance, and IEEE 1588 / EtherCAT DC clock sync. |
| **The Definitive Guide to ARM Cortex-M3/M4** & **C++ Concurrency in Action** & **Real-Time C++**<br/>*J. Yiu* / *A. Williams* / *C. Kormanyos* | 2013–2021 | **Tier 2/3** | NVIC `BASEPRI` zero-latency ISRs, FPU lazy stacking, C++20 `memory_order_acquire`/`release` lock-free atomics, and zero-heap bare-metal templates. |

---

## 6. Control Theory, State Estimation & Embedded Optimization ([Track 05](../05-control-and-estimation/README.md))

| Title & Authors | Year / Edition | Tier | Core Contribution & Why It Matters |
| :--- | :--- | :---: | :--- |
| **Feedback Systems: An Introduction for Scientists and Engineers (2nd Ed.)**<br/>*K. J. Åström & R. M. Murray* ([fbsbook.org](https://www.fbsbook.org/)) | 2021 (Free PDF 🆓) | **Tier 1–3** | Loop shaping, the Gang of Four ($S, T, PS, CS$), Bode's sensitivity integral, anti-windup, and state-space feedback. |
| **Multivariable Feedback Control** & **Applied Nonlinear Control**<br/>*S. Skogestad & I. Postlethwaite* / *J.-J. E. Slotine & W. Li* | 2005 / 1991 | **Tier 3** | Singular-value loop shaping, $H_\infty$ robust control, Lyapunov stability, Barbalat's lemma, sliding mode, and passivity-based adaptive control. |
| **Probabilistic Robotics** & **State Estimation for Robotics (2nd Ed.)** & **Quaternion ESKF**<br/>*S. Thrun et al.* / *T. D. Barfoot* ([Free PDF](http://asrl.utias.utoronto.ca/~tdb/bib/barfoot_ser17.pdf)) / *J. Sola* ([arXiv:1711.02508](https://arxiv.org/abs/1711.02508)) | 2005 / 2024 / 2017 | **Tier 2/3** | Recursive Bayes filtering, particle filters, matrix Lie group estimation on $SE(3)$, and strapdown IMU Error-State Kalman Filtering. |
| **Model Predictive Control (2nd Ed.)**, **Predictive Control for Linear and Hybrid Systems**, & **`acados`**<br/>*Rawlings, Mayne & Diehl* ([Free PDF](https://sites.engineering.ucsb.edu/~jbraw/mpc/)) / *Borrelli, Bemporad & Morari* / *Verschueren et al.* | 2020 / 2017 / 2022 | **Tier 3** | Recursive feasibility, hybrid/multiparametric MPC, Real-Time Iteration (RTI) NMPC, and sub-millisecond `HPIPM`/`BLASFEO` embedded solvers. |

---

## 7. Robotics, Whole-Body Control, Visuomotor Learning & VLAs ([Track 06](../06-robotics-and-autonomy/README.md))

| Title & Authors | Year / Edition | Tier | Core Contribution & Why It Matters |
| :--- | :--- | :---: | :--- |
| **Springer Handbook of Robotics (2nd Ed.)** & **Introduction to Autonomous Mobile Robots**<br/>*B. Siciliano & O. Khatib (Eds.)* / *R. Siegwart, I. R. Nourbakhsh, & D. Scaramuzza* | 2016 / 2011 | **Tier 1–3** | The 2,300-page encyclopedia of robotics alongside the standard mobile robotics text on wheel kinematics, odometry, and SLAM. |
| **Operational-Space Control**, **Impedance Control**, & **MIT Cheetah 3 Convex MPC**<br/>*O. Khatib* (1987) / *N. Hogan* (1985) / *J. Di Carlo et al.* (2018) | 1985–2018 | **Tier 3** | Operational inertia $\Lambda(q)$, null-space projection $\bar{J}(q)$, physical passivity under contact, and real-time quadruped GRF QP optimization. |
| **Underactuated Robotics** & **Robotic Manipulation** & **Planning Algorithms**<br/>*R. Tedrake* ([underactuated.mit.edu](https://underactuated.mit.edu/) & [manipulation.mit.edu](https://manipulation.mit.edu/)) / *S. M. LaValle* ([lavalle.pl](http://lavalle.pl/planning/)) | 2026 / 2006 (Free 🆓) | **Tier 2/3** | Interactive MIT textbooks with runnable Drake notebooks covering LQR trees, hydroelastic contact, perception, and kinodynamic planning. |
| **Robot Learning: A Tutorial** (`arXiv:2510.12403`) & **LeRobot** (`arXiv:2602.22818`)<br/>*F. Capuano, C. Pascal, A. Zouitine, M. Aractingi, & T. Wolf* ([arXiv](https://arxiv.org/abs/2510.12403)) | 2025 / ICLR 2026 (Free 🆓) | **Tier 2/3** | The single best hands-on tutorial from classical control and RL to behavioral cloning, ACT, Diffusion Policy, and VLAs using Hugging Face `lerobot`. |
| **ACT / ALOHA** (`arXiv:2304.13705`), **Universal Manipulation Interface (UMI)**, & **Diffusion Policy** (`arXiv:2303.04137`)<br/>*T. Zhao et al.* ([RSS 2023](https://arxiv.org/abs/2304.13705)) / *C. Chi et al.* ([UMI 2024](https://umi-gripper.github.io/) & [Diffusion Policy](https://diffusion-policy.cs.columbia.edu/)) | 2023–2025 (Free 🆓) | **Tier 2/3** | Action Chunking with Transformers (ACT) on low-cost bimanual hardware, handheld robot-free data collection (UMI), and multimodal denoising action diffusion. |
| **Real-Time Execution of Action Chunking Flow Policies (RTC)** (`arXiv:2506.07339`) & **FAST Tokenization**<br/>*K. Black, M. Galliker, & S. Levine* ([NeurIPS 2025](https://arxiv.org/abs/2506.07339)) / *K. Pertsch et al.* ([RSS 2025](https://www.pi.website/research/fast)) | 2025 (Free 🆓) | **Tier 3** | "Action inpainting" flow-matching execution that computes the next action chunk while executing the current chunk so 3B–7B VLAs run smoothly at real robot rates. |
| **Vision-Language-Action (VLA) Surveys & Real-Robot RL (`HIL-SERL`)**<br/>*Kawaharazuka et al.* ([vla-survey.github.io](https://vla-survey.github.io/)) / *TMLR Data Survey* ([arXiv:2604.23001](https://arxiv.org/abs/2604.23001)) / *J. Luo et al.* ([hil-serl.github.io](https://hil-serl.github.io/)) | 2024–2026 (Free 🆓) | **Tier 3** | Comprehensive taxonomy + searchable database of VLAs (`SmolVLA`, `OpenVLA`, `π₀`, `GR00T N1.6`), data engine bottlenecks, and 1–2 hour sample-efficient real-robot RL. |
| **Machine Learning, Deep RL & Computer Vision Foundations**<br/>*Zhang et al.* ([d2l.ai](https://d2l.ai/)) / *Sutton & Barto* ([RL Book](http://incompleteideas.net/book/the-book.html)) / *OpenAI* ([Spinning Up](https://spinningup.openai.com/)) / *K. Murphy* ([probml.github.io](https://probml.github.io/pml-book/)) / *R. Szeliski* ([szeliski.org](https://szeliski.org/Book/)) | 2018–2025 (All Free 🆓) | **Tier 2/3** | Five complete, open-access foundational textbooks covering PyTorch/JAX deep learning, reinforcement learning, probabilistic ML, and 3D computer vision. |

---

## 8. Systems Engineering, SysID, HIL, Industrial Standards & AI Safety ([Track 07](../07-systems-hil-and-production/README.md))

| Title & Authors | Year / Edition | Tier | Core Contribution & Why It Matters |
| :--- | :--- | :---: | :--- |
| **System Identification: A Frequency Domain Approach** & **Fault-Diagnosis Systems**<br/>*R. Pintelon & J. Schoukens* / *R. Isermann* | 2012 / 2006 | **Tier 3** | Schroeder-phased multisine excitation design, Best Linear Approximation (BLA), closed-loop FRF variance bounds, and observer-based fault detection. |
| **Asset Administration Shell (AAS, IEC 63278-1:2023)** & **AutomationML (IEC 62714)**<br/>*Industrial Digital Twin Assoc.* ([industrialdigitaltwin.org](https://industrialdigitaltwin.org/)) | 2023–2026 (Standard) | **Tier 2/3** | Standardized Industry 4.0/5.0 digital twin information models and OPC UA interoperability (`Eclipse BaSyx`). |
| **Agentic AI in Engineering and Manufacturing** & **VLA Safety Survey**<br/>*MIT DeCoDE Lab* ([2026 Paper PDF](https://decode.mit.edu/assets/papers/2026_Edwards_Agentic_AI_in_Engineering_and_Manufacturing.pdf)) / ([arXiv:2604.23775](https://arxiv.org/abs/2604.23775)) | 2026 (Free 🆓) | **Tier 3** | Defines *bounded autonomy*—why LLM/VLA agents must operate strictly inside deterministic, hardware-enforced safety envelopes (PLC interlocks, CBF-QP, STO). |
| **IEC 61508 / ISO 13849-1 / IEC 61800-5-2 / ISO 10218:2025 / ISO/TS 15066 / EU Machinery Regulation 2023/1230** | Current Editions ([EUR-Lex](https://eur-lex.europa.eu/eli/reg/2023/1230/oj)) | **Tier 3** | Functional safety lifecycle (SIL / PLe), Safe Torque Off (STO), collaborative robot power-and-force limiting (ISO/TS 15066), and the mandatory 2027 EU Machinery Regulation covering AI-enabled safety components. |

---

## 9. Top Free Video Courses, Flagship Journals, Conferences & Communities

### 🎓 Curated Free Online Video Courses
* **Tier 1 (Beginner):** [Paul McWhorter — *Arduino & ESP32 for Beginners*](https://www.youtube.com/@paulmcwhorter) · [Brian Douglas — *Control System Lectures*](https://www.youtube.com/@BrianBDouglas) · [MATLAB Tech Talks — *Understanding PID Control*](https://www.mathworks.com/videos/series/understanding-pid-control.html) · [Articulated Robotics — *Build a ROS 2 Mobile Robot*](https://articulatedrobotics.xyz/)
* **Tier 2 (Applied):** [Steve Brunton (UW) — *Control Bootcamp*](https://www.youtube.com/playlist?list=PLMrJAkhIeNNR20Mz-VpzgfQs5zrYi085m) · [Northwestern — *Modern Robotics Specialization*](https://www.coursera.org/specializations/modernrobotics) · [Cyrill Stachniss (Bonn) — *SLAM Lectures*](https://www.youtube.com/@CyrillStachniss) · [Hugging Face — *LeRobot Tutorials & SO-101 Guide*](https://huggingface.co/docs/lerobot)
* **Tier 3 (Production / Research):** [Oussama Khatib (Stanford CS223A) — *Intro to Robotics & Operational Space*](https://see.stanford.edu/Course/CS223A) · [Russ Tedrake (MIT 6.832 & 6.4210) — *Underactuated Robotics & Manipulation*](https://underactuated.mit.edu/) · [NVIDIA — *Sim-to-Real with SO-101 (Isaac Sim → Isaac Lab → GR00T)*](https://docs.nvidia.com/learning/physical-ai/sim-to-real-so-101/latest/)

### 🏛️ Flagship Journals, Conferences & Active Communities
* **Flagship Peer-Reviewed Journals:** [*IEEE/ASME Transactions on Mechatronics (TMECH)*](https://ieeexplore.ieee.org/xpl/RecentIssue.jsp?punumber=3516) · [*Mechatronics* (Elsevier)](https://www.sciencedirect.com/journal/mechatronics) · [*IEEE Transactions on Robotics (T-RO)*](https://www.ieee-ras.org/publications/t-ro) · [*International Journal of Robotics Research (IJRR)*](https://journals.sagepub.com/home/ijr) · [*Science Robotics*](https://www.science.org/journal/scirobotics) · [*IEEE Robotics and Automation Letters (RA-L)*](https://www.ieee-ras.org/publications/ra-l) · [*Mechanism and Machine Theory*](https://www.sciencedirect.com/journal/mechanism-and-machine-theory) · [*Frontiers in Robotics and AI* (Open Access 🆓)](https://www.frontiersin.org/journals/robotics-and-ai)
* **Premier Conferences & Industrial Trade Fairs:** [ICRA](https://www.ieee-ras.org/conferences-workshops/fully-sponsored/icra) · [IROS](https://www.ieee-ras.org/conferences-workshops/fully-sponsored/iros) · [Robotics: Science and Systems (RSS)](https://roboticsconference.org/) · [Conference on Robot Learning (CoRL)](https://www.corl.org/) · [IEEE/ASME AIM](https://www.ieee-ies.org/conferences) · [Hannover Messe](https://www.hannovermesse.de/) · [SPS Nuremberg](https://sps.mesago.com/) · [automatica Munich](https://automatica-munich.com/) · [NVIDIA GTC](https://www.nvidia.com/gtc/)
* **Communities & Related Awesome Lists:** [ROS Discourse](https://discourse.ros.org/) · [Robotics Stack Exchange](https://robotics.stackexchange.com/) · [LeRobot Discord & HF Robotics](https://huggingface.co/robotics) · [r/robotics](https://reddit.com/r/robotics) · [r/ControlTheory](https://reddit.com/r/ControlTheory) · [r/PLC](https://reddit.com/r/PLC) · [`engyasin/awesome-mechatronics`](https://github.com/engyasin/awesome-mechatronics) · [`KwanWaiPang/Awesome-VLA`](https://github.com/KwanWaiPang/Awesome-VLA) · [`keon/awesome-physical-ai`](https://github.com/keon/awesome-physical-ai) · [`AtsushiSakai/PythonRobotics`](https://github.com/AtsushiSakai/PythonRobotics) · [`rust-embedded/awesome-embedded-rust`](https://github.com/rust-embedded/awesome-embedded-rust)
