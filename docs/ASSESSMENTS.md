# MechaLab Assessment, Skip Test & Ladder Gate Specification

> **Purpose:** Defines the diagnostic **Module Skip Tests**, **Ladder Gate Tests**, **Mandatory Safety Gates**, and **Capstone Qualification Rubrics** across all 40 Bridge Modules (`modules/*.md`) and 24 Legacy Steps (`modules/_index.yaml`).

---

## 1. Two-Tier Assessment Architecture

1. **Module-Level Skip Test (`## 7. Checkpoint -> ### Skip test`, present in all 40 bridge modules):**
   - **Length:** 4–6 quantitative calculation, code-tracing, or physical-failure-diagnosis questions ($\ge 60\%$ doing/calculation) tagged with `[Concept: <concept_id>]` (plus `[Spaced review — Concept: <concept_id>]` from prerequisite modules).
   - **Grading:** Self-contained runnable Python `assert` answer key (`python3`) with explicit numerical tolerances ($\pm 10^{-11}$ to $\pm 10^{-2}$, or exact integer $\pm 0$).
   - **Pass Threshold:** $\ge 80\%$ ($4/4$ or $4/5$), **AND $100\%$ on all `[SAFETY]`-tagged questions** in `safety_level: high` modules after reading `## Safety notes`.
   - **Remediation:** Every question maps to a specific `##` section (`## 2. Intuition first`, `## 3. Formalization`, `## 4. Worked example`, or `## Safety notes`) if missed.

2. **Ladder-Level Gate Test (`## 7. Checkpoint -> ### Gate test`, present in the 24 ladder-final bridge modules):**
   - **Length:** 8 comprehensive questions spanning **every** `new_concept` introduced across the entire bridge ladder.
   - **Pass Threshold:** $\ge 80\%$ ($7/8$), **AND $100\%$ ($2/2$) on all `[SAFETY]`-tagged questions** in `safety_level: high` ladders.
   - **Privilege:** Passing a Ladder Gate Test allows an experienced learner to skip the entire bridge ladder and enter the target Legacy Step directly.

---

## 2. Master Index of All 24 Ladder Gate Tests

| # | Ladder Target Legacy Step | Ladder Modules (in Order) | Ladder-Final Gate Module | Safety Level | `[SAFETY]` 100% Gate? | Concepts Covered by 8-Question Gate Test |
| :-: | :--- | :--- | :--- | :---: | :---: | :--- |
| **1** | **Step 1.1** (`00-foundations.T1.01`) | `T1.00a` $\to$ `T1.00b` $\to$ `T1.00c` $\to$ `T1.00d` $\to$ `T1.00e` | [`00-foundations.T1.00e`](../modules/00-foundations.T1.00e.md) | `none` | No | `for_while_loops_and_functions`, `lists_dicts_and_numpy_arrays`, `si_base_and_derived_units`, `unit_conversion_factor_label`, `radians_unit_circle_and_atan2`, `2d_vectors_and_components`, `newtons_second_law_and_torque`, `spring_energy_and_power` |
| **2** | **Step 1.2** (`01-electronics.T1.02`) | `T1.01a` $\to$ `T1.01c` $\to$ `T1.01d` $\to$ `T1.01b` | [`01-electronics.T1.01b`](../modules/01-electronics.T1.01b.md) | `high` | **Yes (Q7, Q8)** | `voltage_current_resistance_ohms_law`, `kvl_kcl_and_voltage_divider`, `multimeter_and_current_limited_psu_safety`, `breadboard_internal_bus_connectivity`, `capacitor_rc_time_constant`, `inductor_flyback_diode_clamping`, `pwm_duty_cycle_effective_voltage`, `h_bridge_polarity_and_shoot_through` |
| **3** | **Step 1.3** (`02-mechanics.T1.03`) | `T1.02a` | [`02-mechanics.T1.02a`](../modules/02-mechanics.T1.02a.md) | `none` | No | `free_body_diagram_static_equilibrium`, `gravity_lever_arm_cosine_torque`, `gear_ratio_speed_torque_power_tradeoff` |
| **4** | **Step 1.4** (`03-sensors.T1.04`) | `T1.03a` | [`03-sensors.T1.03a`](../modules/03-sensors.T1.03a.md) | `low` | No | `lorentz_force_and_back_emf_constants`, `mechanical_vs_electrical_angle_pole_pairs`, `quadrature_ab_gray_code_direction` |
| **5** | **Step 1.5** (`04-embedded.T1.05`) | `T1.04a` $\to$ `T1.04b` | [`04-embedded.T1.04b`](../modules/04-embedded.T1.04b.md) | `low` | No | `c_fixed_width_integer_types_and_overflow`, `bitwise_masks_and_shifts`, `c_structs_and_pointers_pass_by_reference`, `non_blocking_tick_scheduler`, `finite_state_machine_switch_enum`, `hardware_isr_and_volatile_contract` |
| **6** | **Step 1.6** (`05-control.T1.06`) | `T1.05a` | [`05-control.T1.05a`](../modules/05-control.T1.05a.md) | `low` | No | `open_vs_closed_loop_feedback_diagram`, `pid_spring_damper_integrator_roles`, `actuator_saturation_and_integrator_windup` |
| **7** | **Step 1.7** (`06-robotics.T1.07`) | `T1.06a` | [`06-robotics.T1.06a`](../modules/06-robotics.T1.06a.md) | `low` | No | `trajectory_vs_step_setpoint_velocity_continuity`, `cubic_quintic_boundary_condition_matching`, `virtual_joint_spring_damper_compliance` |
| **8** | **Step 1.8** (`07-systems.T1.08`) | `T1.07a` | [`07-systems.T1.07a`](../modules/07-systems.T1.07a.md) | `high` | **Yes (Q7, Q8)** | `cyclic_plc_scan_read_execute_write`, `normally_closed_hardware_estop_chain`, `single_tone_sine_sweep_gain_and_phase` |
| **9** | **Step 2.1** (`00-foundations.T2.01`) | `T2.00a` $\to$ `T2.00b` $\to$ `T2.00c` $\to$ `T2.00d` $\to$ `T2.00e` $\to$ `T2.00f` | [`00-foundations.T2.00f`](../modules/00-foundations.T2.00f.md) | `none` | No | `derivative_slope_and_integral_area`, `matrix_vector_multiplication`, `cross_product_3d_moment`, `second_order_ode_natural_frequency_damping`, `bode_magnitude_db_and_phase`, `continuous_state_space_a_b_c_d`, `tustin_frequency_prewarping_and_biquad`, `gaussian_variance_and_covariance_propagation` |
| **10** | **Step 2.2** (`01-electronics.T2.02`) | `T2.01a` $\to$ `T2.01b` | [`01-electronics.T2.01b`](../modules/01-electronics.T2.01b.md) | `high` | **Yes (Q7, Q8)** | `opamp_negative_feedback_and_virtual_short`, `differential_shunt_amplifier_and_cmvr`, `kelvin_four_wire_shunt_footprint`, `parasitic_loop_inductance_voltage_overshoot`, `high_side_bootstrap_gate_driver`, `precharge_resistor_inrush_and_stored_energy` |
| **11** | **Step 2.3** (`02-mechanics.T2.03`) | `T2.02a` | [`02-mechanics.T2.02a`](../modules/02-mechanics.T2.02a.md) | `none` | No | `six_dof_gruebler_constraint_counting`, `se3_homogeneous_transformation_matrix`, `geometric_jacobian_and_parallel_axis_theorem` |
| **12** | **Step 2.4** (`03-sensors.T2.04`) | `T2.03a` | [`03-sensors.T2.03a`](../modules/03-sensors.T2.03a.md) | `low` | No | `three_phase_balanced_sum_and_clarke_projection`, `park_rotating_frame_dc_demodulation`, `pll_velocity_tracking_and_noise_random_walk` |
| **13** | **Step 2.5** (`04-embedded.T2.05`) | `T2.04a` $\to$ `T2.04b` | [`04-embedded.T2.04b`](../modules/04-embedded.T2.04b.md) | `low` | No | `spi_full_duplex_clock_polarity_phase`, `dma_zero_cpu_memory_transfer`, `double_buffered_ping_pong_half_complete_isr`, `rtos_preemptive_priority_and_rate_monotonic_bound`, `priority_inversion_and_priority_inheritance_mutex`, `can_bitwise_arbitration_and_zephyr_microros` |
| **14** | **Step 2.6** (`05-control.T2.06`) | `T2.05a` | [`05-control.T2.05a`](../modules/05-control.T2.05a.md) | `none` | No | `loop_transfer_gain_and_phase_margin`, `sensitivity_complementary_waterbed_tradeoff`, `luenberger_observer_and_brysons_lqr_weights` |
| **15** | **Step 2.7** (`06-robotics.T2.07`) | `T2.06a` | [`06-robotics.T2.06a`](../modules/06-robotics.T2.06a.md) | `low` | No | `ros2_nodes_topics_services_and_qos`, `tf2_transform_tree_and_urdf_kinematics`, `ros2_control_hardware_interface_read_write` |
| **16** | **Step 3.1** (`00-foundations.T3.01`) | `T3.00a` | [`00-foundations.T3.00a`](../modules/00-foundations.T3.00a.md) | `none` | No | `skew_symmetric_hat_vee_cross_matrix`, `matrix_exponential_taylor_and_rodrigues`, `hamiltonian_energy_power_balance_passivity` |
| **17** | **Step 3.2** (`01-electronics.T3.02`) | `T3.01a` | [`01-electronics.T3.01a`](../modules/01-electronics.T3.01a.md) | `high` | **Yes (Q7, Q8)** | `six_layer_flux_cancellation_sub2nh_stackup`, `bessel_linear_phase_antialiasing_afe`, `sar_adc_charge_bucket_and_cauer_thermal_rc` |
| **18** | **Step 3.3** (`02-mechanics.T3.03`) | `T3.02a` | [`02-mechanics.T3.02a`](../modules/02-mechanics.T3.02a.md) | `low` | No | `spatial_twist_wrench_and_screw_axis`, `circular_notch_flexure_stiffness_stress`, `recursive_forward_velocity_backward_wrench` |
| **19** | **Step 3.4** (`03-sensors.T3.04`) | `T3.03a` | [`03-sensors.T3.03a`](../modules/03-sensors.T3.03a.md) | `medium` | No | `dq_cross_coupling_and_feedforward_decoupling`, `svpwm_minmax_neutral_shift_modulation`, `encoder_spatial_harmonic_and_cogging_lut` |
| **20** | **Step 3.5** (`04-embedded.T3.05`) | `T3.04a` | [`04-embedded.T3.04a`](../modules/04-embedded.T3.04a.md) | `low` | No | `center_aligned_pwm_peak_adc_trigger`, `q1_31_fixed_point_cordic_trig`, `seqlock_optimistic_torn_read_detection` |
| **21** | **Step 3.6** (`05-control.T3.06`) | `T3.05a` | [`05-control.T3.05a`](../modules/05-control.T3.05a.md) | `medium` | No | `joseph_form_covariance_and_tangent_error_state`, `constrained_quadratic_program_active_set`, `control_barrier_function_forward_invariance` |
| **22** | **Step 3.7** (`06-robotics.T3.07` — AI) | `T3.06a` $\to$ `T3.06b` | [`06-robotics.T3.06b`](../modules/06-robotics.T3.06b.md) | `high` | **Yes (Q7, Q8)** | `neural_network_forward_pass_and_mse_loss`, `chain_rule_backpropagation_and_gradient_descent`, `behavior_cloning_expert_demonstration_fit`, `mdp_discounted_return_and_policy_gradient_ppo`, `action_chunking_temporal_ensembling_rtc`, `sim_to_real_domain_randomization_and_safety_shield` |
| **23** | **Step 3.7** (`06-robotics.T3.07` — Ind. 4.0) | `T3.06a` | [`07-systems.T3.06a`](../modules/07-systems.T3.06a.md) | `high` | **Yes (Q7, Q8)** | `opc_ua_address_space_nodes_and_pub_sub`, `iec_63278_aas_submodel_digital_nameplate`, `iso_13849_category3_pld_dual_channel_sto` |
| **24** | **Step 3.8** (`08-capstones.T3.08`) | `T3.07a` | [`08-capstones.T3.07a`](../modules/08-capstones.T3.07a.md) | `high` | **Yes (Q7, Q8)** | `rss_and_worst_case_spatial_error_budget`, `end_to_end_latency_and_phase_margin_erosion_budget`, `pre_bring_up_interface_and_safety_signoff_gate` |

---

## 3. Automated Validation & Grading Verification Commands

Run the DAG and structural validator across all 64 modules (`24 legacy + 40 bridge`):

```bash
python3 scripts/validate_modules.py
```

Execute all 105 embedded Python `Worked example`, `Skip test`, and `Gate test` assertion blocks across all 40 bridge modules:

```bash
python3 -c '
import pathlib, re, subprocess, sys, textwrap
for p in sorted(pathlib.Path("modules").glob("*.md")):
    for i, code in enumerate(re.findall(r"```python\n(.*?)```", p.read_text(), re.S), 1):
        r = subprocess.run([sys.executable, "-c", textwrap.dedent(code)], capture_output=True, text=True)
        assert r.returncode == 0, f"{p.name} block #{i} failed:\n{r.stderr}"
print("All 105 Python Worked-Example/Skip/Gate test blocks across 40 bridge modules passed!")
'
```
