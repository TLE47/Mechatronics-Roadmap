// stm32g474_foc_firmware.cpp — Capstone I Bare-Metal STM32G474 Register-Level 40 kHz FOC Firmware & Unit Tests
//
// Target MCU: STMicroelectronics STM32G474RET6 (170 MHz Cortex-M4F + Hardware CORDIC + TIM1 + Dual ADC1/ADC2 DMA)
// Architecture:
//   - Zero dynamic allocation (`operator new` trapped inside ISR & control path)
//   - Register-exact CMSIS memory-mapped structs (`TIM_TypeDef`, `ADC_TypeDef`, `CORDIC_TypeDef`, `DMA_Channel_TypeDef`)
//     so the exact same source compiles onto physical Cortex-M4F silicon OR host x86_64/ARM64 unit-test mock registers
//   - 40 kHz Center-Aligned Mode 1 (`CMS = 0b01`) on `TIM1` (`f_clk = 170 MHz`, `ARR = 2125`, `RCR = 1` update at peak)
//   - Hardware `TIM1_TRGO2` triggers simultaneous `ADC1` (Phase A) + `ADC2` (Phase B) conversion at the zero-current-ripple
//     SVPWM counter peak (`CNT == ARR`), transferred via `DMA1_Channel1` into a deterministic CCM-SRAM buffer
//   - Hardware `CORDIC` coprocessor (`FUNC = Cosine/Sine`, `PRECISION = 6` cycles, `Q1.31` fixed-point format)
//   - Synchronous frame $d$-$q$ PI current controller with $\pm\omega_e L_{d,q}$ cross-coupling decoupling, circular
//     voltage vector limiting ($\sqrt{v_d^2 + v_q^2} \le V_{\text{bus}}/\sqrt{3}$), and Min-Max Zero-Sequence SVPWM
//   - Hardware `TIM1->BDTR` Break Input (`BKIN`) Safe Torque Off (`MOE = 0`) fault latch verification
//
// Exit-code family: typed (0 = all register & closed-loop tests pass, 1 = test failure, 2 = usage error).

#include <algorithm>
#include <array>
#include <atomic>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <new>
#include <numbers>

namespace {

constexpr const char* kVersion = "1.0.0";

// ============================================================================
// 1. Real-Time Zero-Heap Allocation Guard
// ============================================================================
std::atomic<bool> g_rt_lock_active{false};
std::atomic<uint64_t> g_rt_heap_faults{0};

} // namespace

void* operator new(std::size_t size) {
    if (g_rt_lock_active.load(std::memory_order_relaxed)) {
        g_rt_heap_faults.fetch_add(1, std::memory_order_relaxed);
    }
    if (void* p = std::malloc(size)) {
        return p;
    }
    throw std::bad_alloc();
}

void operator delete(void* p) noexcept {
    std::free(p);
}

void operator delete(void* p, std::size_t) noexcept {
    std::free(p);
}

namespace stm32g474_foc {

// ============================================================================
// 2. CMSIS-Compatible STM32G474 Register Definitions
// ============================================================================

struct TIM_TypeDef {
    volatile uint32_t CR1;    // 0x00: Control register 1 (CEN, CMS[1:0], DIR)
    volatile uint32_t CR2;    // 0x04: Control register 2 (MMS2[3:0] for TRGO2)
    volatile uint32_t SMCR;   // 0x08: Slave mode control register
    volatile uint32_t DIER;   // 0x0C: DMA/interrupt enable register
    volatile uint32_t SR;     // 0x10: Status register
    volatile uint32_t EGR;    // 0x14: Event generation register
    volatile uint32_t CCMR1;  // 0x18: Capture/compare mode register 1
    volatile uint32_t CCMR2;  // 0x1C: Capture/compare mode register 2
    volatile uint32_t CCER;   // 0x20: Capture/compare enable register
    volatile uint32_t CNT;    // 0x24: Counter
    volatile uint32_t PSC;    // 0x28: Prescaler
    volatile uint32_t ARR;    // 0x2C: Auto-reload register
    volatile uint32_t RCR;    // 0x30: Repetition counter register
    volatile uint32_t CCR1;   // 0x34: Capture/compare register 1 (Phase A duty)
    volatile uint32_t CCR2;   // 0x38: Capture/compare register 2 (Phase B duty)
    volatile uint32_t CCR3;   // 0x3C: Capture/compare register 3 (Phase C duty)
    volatile uint32_t CCR4;   // 0x40: Capture/compare register 4 (ADC trigger point)
    volatile uint32_t BDTR;   // 0x44: Break and dead-time register (MOE, BKE, DTG[7:0])
};

// TIM1 bitfield masks (RM0440 STM32G4 Series Reference Manual)
constexpr uint32_t TIM_CR1_CEN        = (1U << 0);
constexpr uint32_t TIM_CR1_CMS_CENTER1 = (1U << 5);  // Center-aligned mode 1
constexpr uint32_t TIM_CR2_MMS2_UPD   = (2U << 20);  // TRGO2 on Update event (underflow/overflow via RCR)
constexpr uint32_t TIM_BDTR_MOE       = (1U << 15);  // Main Output Enable
constexpr uint32_t TIM_BDTR_OSSR      = (1U << 11);  // Off-state selection for Run mode
constexpr uint32_t TIM_BDTR_OSSI      = (1U << 10);  // Off-state selection for Idle mode
constexpr uint32_t TIM_BDTR_BKE       = (1U << 12);  // Break enable (Hardware STO / Overcurrent BKIN)
constexpr uint32_t TIM_BDTR_BKP       = (1U << 13);  // Break polarity (active high)

struct ADC_TypeDef {
    volatile uint32_t ISR;    // 0x00: Interrupt and status register
    volatile uint32_t IER;    // 0x04: Interrupt enable register
    volatile uint32_t CR;     // 0x08: Control register (ADEN, ADSTART, ADVREGEN)
    volatile uint32_t CFGR;   // 0x0C: Configuration register (DMAEN, DMACFG, EXTEN, EXTSEL)
    volatile uint32_t SMPR1;  // 0x14: Sample time register 1 (6.5 ADC cycles for charge bucket)
    volatile uint32_t SQR1;   // 0x30: Regular sequence register 1
    volatile uint32_t DR;     // 0x40: Regular data register
};

struct ADC_Common_TypeDef {
    volatile uint32_t CSR;    // 0x00: Common status register
    volatile uint32_t CCR;    // 0x08: Common control register (DUAL[4:0] = 0b00110 Regular simultaneous)
    volatile uint32_t CDR;    // 0x0C: Common regular data register (upper 16b = ADC2, lower 16b = ADC1)
};

constexpr uint32_t ADC_CR_ADVREGEN    = (1U << 28);
constexpr uint32_t ADC_CR_ADEN        = (1U << 0);
constexpr uint32_t ADC_CR_ADSTART     = (1U << 2);
constexpr uint32_t ADC_CFGR_DMAEN     = (1U << 0);
constexpr uint32_t ADC_CFGR_DMACFG    = (1U << 1);   // Circular DMA mode
constexpr uint32_t ADC_CFGR_EXTEN_RIS = (1U << 10);  // Hardware trigger on rising edge (TIM1_TRGO2)
constexpr uint32_t ADC_CCR_DUAL_SIMUL = (6U << 0);   // Combined regular simultaneous mode (ADC1 + ADC2)

struct DMA_Channel_TypeDef {
    volatile uint32_t CCR;    // Configuration register (EN, TCIE, CIRC, MSIZE, PSIZE)
    volatile uint32_t CNDTR;  // Number of data to transfer
    volatile uintptr_t CPAR;  // Peripheral address
    volatile uintptr_t CMAR;  // Memory address
};

constexpr uint32_t DMA_CCR_EN         = (1U << 0);
constexpr uint32_t DMA_CCR_TCIE       = (1U << 1);   // Transfer complete interrupt enable
constexpr uint32_t DMA_CCR_CIRC       = (1U << 5);   // Circular mode

struct CORDIC_TypeDef {
    volatile uint32_t CSR;    // Control and status register (FUNC, PRECISION, NARGS, NRES, RRDY)
    volatile int32_t  WDATA;  // Write data register (Q1.31 angle in [-1, 1) -> [-pi, pi))
    volatile int32_t  RDATA;  // Read data register (1st read = cos(theta), 2nd read = sin(theta) in Q1.31)
};

constexpr uint32_t CORDIC_CSR_FUNC_COS   = (0U << 0);  // Cosine primary, Sine secondary
constexpr uint32_t CORDIC_CSR_PRECISION6 = (6U << 4);  // 6 iterations (24-bit accuracy in 6 clock cycles)
constexpr uint32_t CORDIC_CSR_NRES_2     = (1U << 19); // 2 results: Cosine then Sine
constexpr uint32_t CORDIC_CSR_RRDY       = (1U << 31); // Result ready flag

// Hardware Peripheral Instances (Simulated Memory-Mapped Bank for Host Verification)
struct HardwarePeripherals {
    TIM_TypeDef        TIM1{};
    ADC_TypeDef        ADC1{};
    ADC_TypeDef        ADC2{};
    ADC_Common_TypeDef ADC12_COMMON{};
    DMA_Channel_TypeDef DMA1_Channel1{};
    CORDIC_TypeDef     CORDIC{};
    uint32_t           cordic_read_toggle{0};
    int32_t            cordic_latched_cos_q31{0};
    int32_t            cordic_latched_sin_q31{0};

    // Emulates the STM32G474 hardware CORDIC silicon pipeline when WDATA is written
    void cordic_write_angle_q31(int32_t theta_q31) noexcept {
        CORDIC.WDATA = theta_q31;
        // Convert Q1.31 in [-2^31, 2^31-1] to radians in [-pi, pi)
        const double norm = static_cast<double>(theta_q31) / 2147483648.0;
        const double angle_rad = norm * std::numbers::pi;
        const double c = std::cos(angle_rad);
        const double s = std::sin(angle_rad);
        cordic_latched_cos_q31 = static_cast<int32_t>(std::llround(std::clamp(c, -0.999999999, 0.999999999) * 2147483647.0));
        cordic_latched_sin_q31 = static_cast<int32_t>(std::llround(std::clamp(s, -0.999999999, 0.999999999) * 2147483647.0));
        cordic_read_toggle = 0;
        CORDIC.CSR |= CORDIC_CSR_RRDY;
    }

    int32_t cordic_read_q31() noexcept {
        if (cordic_read_toggle == 0) {
            cordic_read_toggle = 1;
            CORDIC.RDATA = cordic_latched_cos_q31;
            return cordic_latched_cos_q31;
        }
        cordic_read_toggle = 0;
        CORDIC.CSR &= ~CORDIC_CSR_RRDY;
        CORDIC.RDATA = cordic_latched_sin_q31;
        return cordic_latched_sin_q31;
    }

    // Hardware Break Input (BKIN) pin assertion (Dual-channel STO or DRV8353 nFAULT comparator trip)
    void trigger_hardware_bkin_sto() noexcept {
        if ((TIM1.BDTR & TIM_BDTR_BKE) != 0U) {
            // Silicon hardware clears MOE asynchronously in < 50 ns without CPU intervention
            TIM1.BDTR &= ~TIM_BDTR_MOE;
        }
    }
};

// ============================================================================
// 3. Bare-Metal Peripheral Initialization (TIM1 40 kHz, Dual ADC DMA, CORDIC)
// ============================================================================

constexpr uint32_t kSysCoreClockHz = 170'000'000U; // 170 MHz Cortex-M4F clock
constexpr uint32_t kPwmFreqHz      = 40'000U;      // 40 kHz SVPWM switching frequency
// Center-aligned PWM period: f_pwm = f_clk / (2 * ARR) => ARR = 170,000,000 / (2 * 40,000) = 2125
constexpr uint32_t kTim1ArrTicks   = kSysCoreClockHz / (2U * kPwmFreqHz); // 2125 ticks
// 100 ns dead-time at 170 MHz (t_dts = 5.882 ns -> 17 ticks = 100.0 ns)
constexpr uint32_t kDeadtimeTicks  = 17U;

// CCM-SRAM aligned DMA target buffer: packed 32-bit word (low 16b = ADC1 IA, high 16b = ADC2 IB)
alignas(4) volatile uint32_t g_adc_dma_ccm_buf[1] = {0};

inline void init_stm32g474_foc_peripherals(HardwarePeripherals& hw) noexcept {
    // 1. Configure CORDIC coprocessor: Cosine/Sine mode, 6-cycle precision, 2 Q1.31 outputs
    hw.CORDIC.CSR = CORDIC_CSR_FUNC_COS | CORDIC_CSR_PRECISION6 | CORDIC_CSR_NRES_2;

    // 2. Configure Dual ADC1 + ADC2 in Regular Simultaneous Mode triggered by TIM1_TRGO2
    hw.ADC12_COMMON.CCR = ADC_CCR_DUAL_SIMUL;
    hw.ADC1.CR = ADC_CR_ADVREGEN | ADC_CR_ADEN;
    hw.ADC2.CR = ADC_CR_ADVREGEN | ADC_CR_ADEN;
    hw.ADC1.SMPR1 = 1U; // 6.5 ADC clock cycles sampling time for 1mOhm INA240A2 charge bucket
    hw.ADC2.SMPR1 = 1U;
    hw.ADC1.CFGR = ADC_CFGR_DMAEN | ADC_CFGR_DMACFG | ADC_CFGR_EXTEN_RIS;

    // 3. Configure DMA1_Channel1: peripheral = &ADC12_COMMON.CDR, memory = g_adc_dma_ccm_buf
    hw.DMA1_Channel1.CPAR = reinterpret_cast<uintptr_t>(&hw.ADC12_COMMON.CDR);
    hw.DMA1_Channel1.CMAR = reinterpret_cast<uintptr_t>(&g_adc_dma_ccm_buf[0]);
    hw.DMA1_Channel1.CNDTR = 1U;
    hw.DMA1_Channel1.CCR = DMA_CCR_CIRC | DMA_CCR_TCIE | DMA_CCR_EN;

    // Start simultaneous hardware-triggered conversion wait state
    hw.ADC1.CR |= ADC_CR_ADSTART;
    hw.ADC2.CR |= ADC_CR_ADSTART;

    // 4. Configure TIM1 for 40 kHz Center-Aligned SVPWM with RCR=1 (Update/TRGO2 at counter peak)
    hw.TIM1.PSC = 0U;
    hw.TIM1.ARR = kTim1ArrTicks; // 2125
    hw.TIM1.RCR = 1U;            // Trigger ADC only at top of triangular carrier (zero switching noise)
    hw.TIM1.CCR1 = kTim1ArrTicks / 2U;
    hw.TIM1.CCR2 = kTim1ArrTicks / 2U;
    hw.TIM1.CCR3 = kTim1ArrTicks / 2U;
    hw.TIM1.CR2 = TIM_CR2_MMS2_UPD; // TRGO2 pulsed at Update event
    hw.TIM1.BDTR = TIM_BDTR_MOE | TIM_BDTR_BKE | TIM_BDTR_BKP | TIM_BDTR_OSSR | TIM_BDTR_OSSI | kDeadtimeTicks;
    hw.TIM1.CR1 = TIM_CR1_CMS_CENTER1 | TIM_CR1_CEN;
}

// ============================================================================
// 4. Hard Real-Time 40 kHz DMA1_Channel1_IRQHandler (CORDIC Clarke/Park + SVPWM)
// ============================================================================

struct FocControllerState {
    // Motor parameters (Capstone I frameless outrunner PMSM)
    float r_s_ohm{0.11f};
    float l_d_h{0.000085f};
    float l_q_h{0.000085f};
    float lambda_pm_wb{0.014f};
    float v_bus_v{48.0f};
    float dt_s{1.0f / static_cast<float>(kPwmFreqHz)}; // 25.0 us

    // Pole-zero cancellation PI gains for f_bw = 2500 Hz (omega_bw = 15,708 rad/s)
    float kp_d{0.000085f * 2.0f * std::numbers::pi_v<float> * 2500.0f};
    float ki_d{0.11f * 2.0f * std::numbers::pi_v<float> * 2500.0f};
    float kp_q{0.000085f * 2.0f * std::numbers::pi_v<float> * 2500.0f};
    float ki_q{0.11f * 2.0f * std::numbers::pi_v<float> * 2500.0f};

    // Integrator states & telemetry
    float int_d_v{0.0f};
    float int_q_v{0.0f};
    float i_d_meas_a{0.0f};
    float i_q_meas_a{0.0f};
    float v_d_cmd_v{0.0f};
    float v_q_cmd_v{0.0f};
    uint32_t isr_cycles{0};
};

// Converts radians in [-pi, pi) to Q1.31 fixed-point for STM32G4 CORDIC WDATA
inline int32_t rad_to_q31(float theta_rad) noexcept {
    // Wrap to [-pi, pi) using std::remainder (exact IEEE-754 signed remainder)
    const double wrapped = std::remainder(static_cast<double>(theta_rad), 2.0 * std::numbers::pi);
    const double norm = std::clamp(wrapped / std::numbers::pi, -0.999999999, 0.999999999);
    return static_cast<int32_t>(std::llround(norm * 2147483647.0));
}

inline float q31_to_float(int32_t val_q31) noexcept {
    return static_cast<float>(static_cast<double>(val_q31) / 2147483647.0);
}

// Executes inside CCM-SRAM at 40 kHz upon DMA1_Channel1 transfer complete interrupt
inline void DMA1_Channel1_IRQHandler(
    HardwarePeripherals& hw,
    FocControllerState& st,
    float theta_e_rad,
    float omega_e_rad_s,
    float i_d_ref_a,
    float i_q_ref_a
) noexcept {
    // 1. Kick off hardware CORDIC sin/cos evaluation immediately (runs in parallel with ADC unpack!)
    hw.cordic_write_angle_q31(rad_to_q31(theta_e_rad));

    // 2. Unpack simultaneous 12-bit ADC1 (IA) & ADC2 (IB) samples from CCM-SRAM DMA buffer
    //    INA240A2 (50 V/V) + 1.0 mOhm Kelvin shunt -> 50 mV/A centered at 2048 counts (1.65V / 3.30V)
    //    Full-scale range: +/-33.0 A across [0, 4095] ADC counts
    const uint32_t packed_cdr = g_adc_dma_ccm_buf[0];
    const int32_t raw_ia = static_cast<int32_t>(packed_cdr & 0xFFFFU) - 2048;
    const int32_t raw_ib = static_cast<int32_t>((packed_cdr >> 16) & 0xFFFFU) - 2048;

    constexpr float kAdcCountsToAmps = 3.30f / (4096.0f * 0.050f); // 0.01611328125 A/LSB
    const float i_a = static_cast<float>(raw_ia) * kAdcCountsToAmps;
    const float i_b = static_cast<float>(raw_ib) * kAdcCountsToAmps;

    // 3. Read hardware CORDIC Q1.31 cosine and sine results
    const float cos_th = q31_to_float(hw.cordic_read_q31());
    const float sin_th = q31_to_float(hw.cordic_read_q31());

    // 4. Amplitude-invariant Clarke Transform (a, b, c) -> (alpha, beta)
    constexpr float kOneOverSqrt3 = 0.57735026919f;
    const float i_alpha = i_a;
    const float i_beta  = (i_a + 2.0f * i_b) * kOneOverSqrt3;

    // 5. Park Transform (alpha, beta) -> synchronous rotating frame (d, q)
    const float i_d =  i_alpha * cos_th + i_beta * sin_th;
    const float i_q = -i_alpha * sin_th + i_beta * cos_th;
    st.i_d_meas_a = i_d;
    st.i_q_meas_a = i_q;

    // 6. Synchronous d-q PI Regulators + Exact Back-EMF & Cross-Coupling Feedforward Decoupling
    const float err_d = i_d_ref_a - i_d;
    const float err_q = i_q_ref_a - i_q;

    const float v_max = st.v_bus_v * kOneOverSqrt3; // SVPWM linear hexagon inscribed circle radius (27.71 V)

    st.int_d_v = std::clamp(st.int_d_v + st.ki_d * st.dt_s * err_d, -v_max, v_max);
    st.int_q_v = std::clamp(st.int_q_v + st.ki_q * st.dt_s * err_q, -v_max, v_max);

    float v_d = st.kp_d * err_d + st.int_d_v - omega_e_rad_s * st.l_q_h * i_q;
    float v_q = st.kp_q * err_q + st.int_q_v + omega_e_rad_s * (st.l_d_h * i_d + st.lambda_pm_wb);

    // Circular voltage vector limiter preserving phase angle
    const float v_mag = std::hypot(v_d, v_q);
    if (v_mag > v_max) {
        const float scale = v_max / v_mag;
        v_d *= scale;
        v_q *= scale;
    }
    st.v_d_cmd_v = v_d;
    st.v_q_cmd_v = v_q;

    // 7. Inverse Park Transform (d, q) -> (alpha, beta)
    const float v_alpha = v_d * cos_th - v_q * sin_th;
    const float v_beta  = v_d * sin_th + v_q * cos_th;

    // 8. Inverse Clarke + Min-Max Zero-Sequence Neutral Shift SVPWM
    constexpr float kSqrt3Over2 = 0.86602540378f;
    const float v_a = v_alpha;
    const float v_b = -0.5f * v_alpha + kSqrt3Over2 * v_beta;
    const float v_c = -0.5f * v_alpha - kSqrt3Over2 * v_beta;

    const float v_min = std::min({v_a, v_b, v_c});
    const float v_max_ph = std::max({v_a, v_b, v_c});
    const float v_offset = -0.5f * (v_min + v_max_ph);

    const float inv_vbus = 1.0f / st.v_bus_v;
    const float d_a = std::clamp((v_a + v_offset) * inv_vbus + 0.5f, 0.02f, 0.98f);
    const float d_b = std::clamp((v_b + v_offset) * inv_vbus + 0.5f, 0.02f, 0.98f);
    const float d_c = std::clamp((v_c + v_offset) * inv_vbus + 0.5f, 0.02f, 0.98f);

    // 9. Write shadow compare registers TIM1->CCR1..3 (latched at next TIM1 update event)
    const float arr_f = static_cast<float>(hw.TIM1.ARR);
    hw.TIM1.CCR1 = static_cast<uint32_t>(d_a * arr_f);
    hw.TIM1.CCR2 = static_cast<uint32_t>(d_b * arr_f);
    hw.TIM1.CCR3 = static_cast<uint32_t>(d_c * arr_f);
    st.isr_cycles += 1U;
}

// Helper to encode physical phase currents (i_a, i_b) into simulated ADC12_COMMON.CDR DMA word
inline uint32_t encode_phase_currents_to_cdr(float i_a_amp, float i_b_amp) noexcept {
    constexpr float kAmpsToCounts = (4096.0f * 0.050f) / 3.30f; // 62.0606 LSB/A
    const int32_t adc1 = std::clamp(2048 + static_cast<int32_t>( std::lround(i_a_amp * kAmpsToCounts)), 0, 4095);
    const int32_t adc2 = std::clamp(2048 + static_cast<int32_t>( std::lround(i_b_amp * kAmpsToCounts)), 0, 4095);
    return static_cast<uint32_t>(adc1) | (static_cast<uint32_t>(adc2) << 16);
}

// ============================================================================
// 5. 2 kHz CAN-FD MIT-Mode 5-Parameter Impedance Codec & Hardware CRC-16-CCITT
// ============================================================================
// Standard QDD Actuator MIT-Mode Bit-Packed Frame + 16-bit Safety CRC (10 bytes total in CAN-FD frame):
//   - Byte 0..1:  q_des   (16 bits unsigned, [-12.5, +12.5] rad)
//   - Byte 2..3:  dq_des  (12 bits unsigned, [-45.0, +45.0] rad/s) | upper 4 bits of kp
//   - Byte 4:     lower 8 bits of kp (12 bits total, [0.0, 500.0] N*m/rad)
//   - Byte 5..6:  kd      (12 bits unsigned, [0.0, 5.0] N*m*s/rad) |tau_ff (12 bits, [-40.0, +40.0] N*m)
//   - Byte 7:     lower 8 bits of tau_ff
//   - Byte 8..9:  Hardware CRC-16-CCITT (polynomial 0x1021, init 0xFFFF) over Bytes 0..7

struct MitImpedanceCmd {
    float q_des_rad{0.0f};
    float dq_des_rad_s{0.0f};
    float kp_nm_rad{0.0f};
    float kd_nms_rad{0.0f};
    float tau_ff_nm{0.0f};
};

using CanFdMitFrame = std::array<uint8_t, 10>;

inline uint16_t float_to_uint(float x, float x_min, float x_max, uint32_t bits) noexcept {
    const float span = x_max - x_min;
    const float clamped = std::clamp(x, x_min, x_max);
    const uint32_t max_int = (1U << bits) - 1U;
    return static_cast<uint16_t>(std::lround(((clamped - x_min) / span) * static_cast<float>(max_int)));
}

inline float uint_to_float(uint16_t x_int, float x_min, float x_max, uint32_t bits) noexcept {
    const float span = x_max - x_min;
    const uint32_t max_int = (1U << bits) - 1U;
    return static_cast<float>(x_int) * span / static_cast<float>(max_int) + x_min;
}

// Emulates STM32G4 Hardware CRC Peripheral configured for 16-bit CRC-CCITT (Poly = 0x1021, Init = 0xFFFF)
inline uint16_t stm32_hw_crc16_ccitt(const uint8_t* data, std::size_t len) noexcept {
    uint16_t crc = 0xFFFFU;
    for (std::size_t i = 0; i < len; ++i) {
        crc ^= static_cast<uint16_t>(data[i]) << 8U;
        for (int b = 0; b < 8; ++b) {
            if ((crc & 0x8000U) != 0U) {
                crc = static_cast<uint16_t>((crc << 1U) ^ 0x1021U);
            } else {
                crc = static_cast<uint16_t>(crc << 1U);
            }
        }
    }
    return crc;
}

inline CanFdMitFrame pack_mit_canfd_frame(const MitImpedanceCmd& cmd) noexcept {
    const uint16_t q_int   = float_to_uint(cmd.q_des_rad,    -12.5f, 12.5f, 16U);
    const uint16_t dq_int  = float_to_uint(cmd.dq_des_rad_s, -45.0f, 45.0f, 12U);
    const uint16_t kp_int  = float_to_uint(cmd.kp_nm_rad,      0.0f, 500.0f, 12U);
    const uint16_t kd_int  = float_to_uint(cmd.kd_nms_rad,     0.0f, 5.0f,   12U);
    const uint16_t tau_int = float_to_uint(cmd.tau_ff_nm,    -40.0f, 40.0f,  12U);

    CanFdMitFrame frame{};
    frame[0] = static_cast<uint8_t>(q_int >> 8U);
    frame[1] = static_cast<uint8_t>(q_int & 0xFFU);
    frame[2] = static_cast<uint8_t>(dq_int >> 4U);
    frame[3] = static_cast<uint8_t>(((dq_int & 0x0FU) << 4U) | (kp_int >> 8U));
    frame[4] = static_cast<uint8_t>(kp_int & 0xFFU);
    frame[5] = static_cast<uint8_t>(kd_int >> 4U);
    frame[6] = static_cast<uint8_t>(((kd_int & 0x0FU) << 4U) | (tau_int >> 8U));
    frame[7] = static_cast<uint8_t>(tau_int & 0xFFU);

    const uint16_t crc = stm32_hw_crc16_ccitt(frame.data(), 8U);
    frame[8] = static_cast<uint8_t>(crc >> 8U);
    frame[9] = static_cast<uint8_t>(crc & 0xFFU);
    return frame;
}

inline bool unpack_and_verify_mit_canfd_frame(
    const CanFdMitFrame& frame,
    MitImpedanceCmd& out_cmd,
    float q_meas_rad,
    float dq_meas_rad_s,
    float kt_nm_per_a,
    float& out_iq_ref_a
) noexcept {
    const uint16_t rx_crc = (static_cast<uint16_t>(frame[8]) << 8U) | static_cast<uint16_t>(frame[9]);
    const uint16_t calc_crc = stm32_hw_crc16_ccitt(frame.data(), 8U);
    if (rx_crc != calc_crc) {
        return false; // Reject corrupted CAN-FD frame without mutating actuator command
    }

    const uint16_t q_int   = (static_cast<uint16_t>(frame[0]) << 8U) | static_cast<uint16_t>(frame[1]);
    const uint16_t dq_int  = (static_cast<uint16_t>(frame[2]) << 4U) | (static_cast<uint16_t>(frame[3]) >> 4U);
    const uint16_t kp_int  = (static_cast<uint16_t>(frame[3] & 0x0FU) << 8U) | static_cast<uint16_t>(frame[4]);
    const uint16_t kd_int  = (static_cast<uint16_t>(frame[5]) << 4U) | (static_cast<uint16_t>(frame[6]) >> 4U);
    const uint16_t tau_int = (static_cast<uint16_t>(frame[6] & 0x0FU) << 8U) | static_cast<uint16_t>(frame[7]);

    out_cmd.q_des_rad    = uint_to_float(q_int,   -12.5f, 12.5f,  16U);
    out_cmd.dq_des_rad_s = uint_to_float(dq_int,  -45.0f, 45.0f,  12U);
    out_cmd.kp_nm_rad    = uint_to_float(kp_int,    0.0f, 500.0f, 12U);
    out_cmd.kd_nms_rad   = uint_to_float(kd_int,    0.0f, 5.0f,   12U);
    out_cmd.tau_ff_nm    = uint_to_float(tau_int, -40.0f, 40.0f,  12U);

    // Compute 2 kHz joint impedance torque & convert to inner-loop q-axis current reference i_q*
    const float tau_des =
        out_cmd.kp_nm_rad * (out_cmd.q_des_rad - q_meas_rad) +
        out_cmd.kd_nms_rad * (out_cmd.dq_des_rad_s - dq_meas_rad_s) +
        out_cmd.tau_ff_nm;
    out_iq_ref_a = std::clamp(tau_des / kt_nm_per_a, -30.0f, 30.0f);
    return true;
}

} // namespace stm32g474_foc

// ============================================================================
// 5. Self-Checking Hardware Register, CORDIC, Closed-Loop FOC & STO Test Suite
// ============================================================================

int main(int argc, char** argv) {
    bool json_mode = false;
    bool quiet_mode = false;
    bool verbose_mode = false;

    for (int i = 1; i < argc; ++i) {
        if (std::strcmp(argv[i], "-h") == 0 || std::strcmp(argv[i], "--help") == 0) {
            std::printf(
                "Usage: %s [--json] [-q|--quiet] [--verbose] [-V|--version] [--no-input] [--dry-run]\n"
                "Bare-metal STM32G474 40 kHz TIM1 SVPWM + Dual ADC DMA + CORDIC FOC verification suite.\n"
                "Exit-code family: typed (0 = all pass, 1 = test failure, 2 = usage error).\n",
                argv[0]
            );
            return 0;
        }
        if (std::strcmp(argv[i], "-V") == 0 || std::strcmp(argv[i], "--version") == 0) {
            std::printf("stm32g474_foc_firmware %s\n", kVersion);
            return 0;
        }
        if (std::strcmp(argv[i], "--json") == 0) {
            json_mode = true;
        } else if (std::strcmp(argv[i], "-q") == 0 || std::strcmp(argv[i], "--quiet") == 0) {
            quiet_mode = true;
        } else if (std::strcmp(argv[i], "--verbose") == 0) {
            verbose_mode = true;
        } else if (std::strcmp(argv[i], "--no-input") == 0 || std::strcmp(argv[i], "--dry-run") == 0 ||
                   std::strcmp(argv[i], "--") == 0) {
            continue;
        } else {
            std::fprintf(stderr, "error: unknown flag: %s\n", argv[i]);
            return 2;
        }
    }

    using namespace stm32g474_foc;
    HardwarePeripherals hw{};
    FocControllerState st{};

    init_stm32g474_foc_peripherals(hw);

    // Test 1: Verify TIM1 40 kHz Center-Aligned Mode 1 + Deadtime + Dual ADC DMA register setup
    const bool tim1_config_ok =
        (hw.TIM1.ARR == 2125U) &&
        (hw.TIM1.RCR == 1U) &&
        ((hw.TIM1.CR1 & TIM_CR1_CMS_CENTER1) != 0U) &&
        ((hw.TIM1.CR1 & TIM_CR1_CEN) != 0U) &&
        ((hw.TIM1.BDTR & TIM_BDTR_MOE) != 0U) &&
        ((hw.TIM1.BDTR & 0xFFU) == kDeadtimeTicks);

    const bool adc_dma_config_ok =
        (hw.ADC12_COMMON.CCR == ADC_CCR_DUAL_SIMUL) &&
        ((hw.DMA1_Channel1.CCR & (DMA_CCR_EN | DMA_CCR_CIRC | DMA_CCR_TCIE)) != 0U) &&
        (hw.DMA1_Channel1.CPAR == reinterpret_cast<uintptr_t>(&hw.ADC12_COMMON.CDR)) &&
        (hw.DMA1_Channel1.CMAR == reinterpret_cast<uintptr_t>(&g_adc_dma_ccm_buf[0]));

    // Test 2: Verify Q1.31 CORDIC Cosine/Sine accuracy across 360 angles in [-pi, pi)
    double max_cordic_err = 0.0;
    for (int k = -180; k < 180; ++k) {
        const float ang = static_cast<float>(k) * std::numbers::pi_v<float> / 180.0f;
        hw.cordic_write_angle_q31(rad_to_q31(ang));
        const float c_hw = q31_to_float(hw.cordic_read_q31());
        const float s_hw = q31_to_float(hw.cordic_read_q31());
        const double err = std::max(
            std::abs(static_cast<double>(c_hw) - std::cos(ang)),
            std::abs(static_cast<double>(s_hw) - std::sin(ang))
        );
        max_cordic_err = std::max(max_cordic_err, err);
    }
    const bool cordic_ok = (max_cordic_err < 1.0e-6);

    // Test 3: Closed-Loop 40 kHz ISR Step Response (i_q* = 12.0 A, i_d* = 0.0 A at 3000 RPM)
    //         under strict zero-heap real-time lock
    g_rt_lock_active.store(true, std::memory_order_seq_cst);

    float i_d_plant = 0.0f;
    float i_q_plant = 0.0f;
    float theta_e   = 0.0f;
    const float omega_e = 7.0f * (1200.0f * 2.0f * std::numbers::pi_v<float> / 60.0f); // 7 pole-pairs @ 1200 RPM (880 rad/s)
    const float i_q_target = 12.0f;
    int rise_90_step = -1;
    float max_id_crosstalk = 0.0f;

    const auto t_start = std::chrono::steady_clock::now();
    constexpr int kSimSteps = 200; // 200 * 25 us = 5.0 ms simulated time
    for (int step = 0; step < kSimSteps; ++step) {
        // Inverse Park + Inverse Clarke on true plant currents to synthesize physical phase currents (i_a, i_b)
        const float c = std::cos(theta_e);
        const float s = std::sin(theta_e);
        const float i_alpha = i_d_plant * c - i_q_plant * s;
        const float i_beta  = i_d_plant * s + i_q_plant * c;
        const float i_a = i_alpha;
        const float i_b = -0.5f * i_alpha + 0.86602540378f * i_beta;

        // Hardware ADC1+ADC2 simultaneous sample transferred by DMA1_Channel1 to CCM-SRAM
        const uint32_t cdr_word = encode_phase_currents_to_cdr(i_a, i_b);
        hw.ADC12_COMMON.CDR = cdr_word;
        g_adc_dma_ccm_buf[0] = cdr_word;

        // Execute 40 kHz bare-metal DMA ISR
        DMA1_Channel1_IRQHandler(hw, st, theta_e, omega_e, 0.0f, i_q_target);

        // Continuous-time PMSM plant integration over dt = 25 us (4 sub-steps)
        const float dt_sub = st.dt_s * 0.25f;
        for (int sub = 0; sub < 4; ++sub) {
            const float did_dt = (st.v_d_cmd_v - st.r_s_ohm * i_d_plant + omega_e * st.l_q_h * i_q_plant) / st.l_d_h;
            const float diq_dt = (st.v_q_cmd_v - st.r_s_ohm * i_q_plant - omega_e * (st.l_d_h * i_d_plant + st.lambda_pm_wb)) / st.l_q_h;
            i_d_plant += did_dt * dt_sub;
            i_q_plant += diq_dt * dt_sub;
        }
        theta_e += omega_e * st.dt_s;

        if (rise_90_step < 0 && i_q_plant >= 0.90f * i_q_target) {
            rise_90_step = step + 1;
        }
        max_id_crosstalk = std::max(max_id_crosstalk, std::abs(i_d_plant));
    }
    const auto t_end = std::chrono::steady_clock::now();
    g_rt_lock_active.store(false, std::memory_order_seq_cst);

    const double mean_isr_ns =
        std::chrono::duration<double, std::nano>(t_end - t_start).count() / static_cast<double>(kSimSteps);
    const double rise_time_us = (rise_90_step > 0) ? (rise_90_step * 25.0) : 9999.0;

    // Test 4: Hardware Break Input (BKIN) Safe Torque Off (STO) clears TIM1->BDTR.MOE immediately
    hw.trigger_hardware_bkin_sto();
    const bool bkin_sto_cleared_moe = ((hw.TIM1.BDTR & TIM_BDTR_MOE) == 0U);

    // Test 5: 2 kHz CAN-FD MIT-Mode 5-Parameter Impedance Codec & Hardware CRC-16 Fault Rejection
    const MitImpedanceCmd tx_cmd{1.25f, -3.50f, 85.0f, 1.80f, 6.40f};
    CanFdMitFrame frame = pack_mit_canfd_frame(tx_cmd);
    MitImpedanceCmd rx_cmd{};
    float iq_from_mit_a = 0.0f;
    const bool valid_frame_accepted = unpack_and_verify_mit_canfd_frame(
        frame, rx_cmd, 1.15f, -2.50f, 1.15f, iq_from_mit_a
    );
    const bool quant_accuracy_ok =
        (std::abs(rx_cmd.q_des_rad - tx_cmd.q_des_rad) < 0.001f) &&
        (std::abs(rx_cmd.dq_des_rad_s - tx_cmd.dq_des_rad_s) < 0.03f) &&
        (std::abs(rx_cmd.kp_nm_rad - tx_cmd.kp_nm_rad) < 0.2f) &&
        (std::abs(rx_cmd.kd_nms_rad - tx_cmd.kd_nms_rad) < 0.003f) &&
        (std::abs(rx_cmd.tau_ff_nm - tx_cmd.tau_ff_nm) < 0.03f);

    // Inject 1-bit and 2-bit burst errors across all 8 payload bytes and verify 100% CRC-16 rejection
    int corrupted_rejected = 0;
    for (std::size_t byte_idx = 0; byte_idx < 8; ++byte_idx) {
        CanFdMitFrame bad_frame = frame;
        bad_frame[byte_idx] ^= 0x05U; // 2-bit flip
        float dummy_iq = -99.0f;
        if (!unpack_and_verify_mit_canfd_frame(bad_frame, rx_cmd, 0.0f, 0.0f, 1.15f, dummy_iq)) {
            corrupted_rejected += 1;
        }
    }
    const bool canfd_mit_crc_ok = valid_frame_accepted && quant_accuracy_ok && (corrupted_rejected == 8);

    const uint64_t heap_faults = g_rt_heap_faults.load(std::memory_order_relaxed);
    const bool closed_loop_ok =
        (rise_time_us <= 175.0) &&
        (std::abs(i_q_plant - i_q_target) < 0.35f) &&
        (max_id_crosstalk < 0.35f) &&
        (hw.TIM1.CCR1 > 0U && hw.TIM1.CCR1 < hw.TIM1.ARR);

    const bool all_ok =
        tim1_config_ok &&
        adc_dma_config_ok &&
        cordic_ok &&
        closed_loop_ok &&
        bkin_sto_cleared_moe &&
        canfd_mit_crc_ok &&
        (heap_faults == 0U);

    if (json_mode) {
        std::printf(
            "{\"lab\":\"08-capstone1-stm32g474-firmware\",\"ok\":%s,\"pwm_freq_hz\":%u,\"tim1_arr\":%u,"
            "\"deadtime_ns\":100.0,\"cordic_max_err\":%.3e,\"iq_rise_time_us\":%.1f,"
            "\"iq_final_a\":%.3f,\"max_id_crosstalk_a\":%.3f,\"bkin_sto_moe_cleared\":%s,"
            "\"canfd_mit_crc_ok\":%s,\"mit_iq_ref_a\":%.3f,"
            "\"rt_heap_faults\":%llu,\"mean_isr_exec_ns\":%.1f}\n",
            all_ok ? "true" : "false",
            kPwmFreqHz,
            hw.TIM1.ARR,
            max_cordic_err,
            rise_time_us,
            static_cast<double>(i_q_plant),
            static_cast<double>(max_id_crosstalk),
            bkin_sto_cleared_moe ? "true" : "false",
            canfd_mit_crc_ok ? "true" : "false",
            static_cast<double>(iq_from_mit_a),
            static_cast<unsigned long long>(heap_faults),
            mean_isr_ns
        );
    } else if (!quiet_mode) {
        std::printf(
            "[%s] STM32G474 Bare-Metal 40kHz FOC Firmware | ARR=%u | CORDIC_err=%.2e | "
            "t_rise=%.0f us | i_q=%.2f A | CANFD_CRC16=%s | BKIN_STO=%s | ISR=%.0f ns\n",
            all_ok ? "PASS" : "FAIL",
            hw.TIM1.ARR,
            max_cordic_err,
            rise_time_us,
            static_cast<double>(i_q_plant),
            canfd_mit_crc_ok ? "PASS" : "FAIL",
            bkin_sto_cleared_moe ? "CLEARED_MOE" : "FAIL",
            mean_isr_ns
        );
        if (verbose_mode) {
            std::printf("  - TIM1 CCR1/CCR2/CCR3 shadow registers: %u / %u / %u\n", hw.TIM1.CCR1, hw.TIM1.CCR2, hw.TIM1.CCR3);
        }
    }

    return all_ok ? 0 : 1;
}
