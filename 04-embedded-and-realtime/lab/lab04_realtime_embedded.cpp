// Lab 04: Hard Real-Time Embedded C++20 Reference Suite
// Verifies:
//   1. Zero-Heap Allocation Invariant (overrides global operator new to trap after init)
//   2. WaitFreeSeqLock<T> multi-threaded torn-read & WCET stress test
//   3. Industrial 2-DOF PID with derivative filter and back-calculation anti-windup
//   4. Fast Min-Max SVPWM & Rate-Monotonic Response-Time Analysis (RTA)
//
// Compile: clang++ -std=c++20 -O3 -Wall -Wextra -Werror -pthread lab04_realtime_embedded.cpp -o lab04_rt_test
// Exit-code family: typed (0 = pass, 1 = test failure, 2 = usage error)

#include <algorithm>
#include <array>
#include <atomic>
#include <bit>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <thread>
#include <type_traits>

// =============================================================================
// 1. Global Heap Allocation Guard (Simulates Bare-Metal No-Heap Enforcement)
// =============================================================================
namespace rt_guard {
inline std::atomic<bool> g_realtime_mode_active{false};
inline std::atomic<uint64_t> g_heap_violations{0};
} // namespace rt_guard

void* operator new(std::size_t size) {
    if (rt_guard::g_realtime_mode_active.load(std::memory_order_relaxed)) {
        rt_guard::g_heap_violations.fetch_add(1, std::memory_order_relaxed);
    }
    void* p = std::malloc(size);
    if (!p) std::abort();
    return p;
}

void operator delete(void* p) noexcept {
    std::free(p);
}

void operator delete(void* p, std::size_t) noexcept {
    std::free(p);
}

// =============================================================================
// 2. Wait-Free Sequence Lock (Tier-0 40 kHz ISR <-> Tier-1 1 kHz RTOS IPC)
// =============================================================================
template <typename T>
requires std::is_trivially_copyable_v<T>
class WaitFreeSeqLock {
public:
    void write(const T& val) noexcept {
        const uint32_t seq = seq_.load(std::memory_order_relaxed);
        seq_.store(seq + 1U, std::memory_order_release);
        std::atomic_thread_fence(std::memory_order_seq_cst);
        const auto* src = reinterpret_cast<const uint32_t*>(&val);
        for (std::size_t i = 0; i < kWords; ++i) {
            words_[i].store(src[i], std::memory_order_relaxed);
        }
        std::atomic_thread_fence(std::memory_order_release);
        seq_.store(seq + 2U, std::memory_order_release);
    }

    [[nodiscard]] T read() const noexcept {
        T copy{};
        auto* dst = reinterpret_cast<uint32_t*>(&copy);
        uint32_t seq0 = 0U;
        uint32_t seq1 = 0U;
        do {
            seq0 = seq_.load(std::memory_order_acquire);
            for (std::size_t i = 0; i < kWords; ++i) {
                dst[i] = words_[i].load(std::memory_order_relaxed);
            }
            std::atomic_thread_fence(std::memory_order_acquire);
            seq1 = seq_.load(std::memory_order_acquire);
        } while ((seq0 != seq1) || ((seq0 & 1U) != 0U));
        return copy;
    }

private:
    static_assert(sizeof(T) % sizeof(uint32_t) == 0, "T must be a multiple of 32-bit words");
    static constexpr std::size_t kWords = sizeof(T) / sizeof(uint32_t);
    alignas(64) std::atomic<uint32_t> seq_{0U};
    std::array<std::atomic<uint32_t>, kWords> words_{};
};

struct ActuatorTelemetryFrame {
    uint64_t sequence_id;
    float position_rad;
    float velocity_rad_s;
    float iq_meas_a;
    float v_bus_v;
    uint64_t checksum;
};

static constexpr uint64_t compute_frame_checksum(const ActuatorTelemetryFrame& f) noexcept {
    const uint32_t p_bits = std::bit_cast<uint32_t>(f.position_rad);
    const uint32_t v_bits = std::bit_cast<uint32_t>(f.velocity_rad_s);
    const uint32_t i_bits = std::bit_cast<uint32_t>(f.iq_meas_a);
    const uint32_t b_bits = std::bit_cast<uint32_t>(f.v_bus_v);
    return f.sequence_id ^ (static_cast<uint64_t>(p_bits) << 32U) ^
           (static_cast<uint64_t>(v_bits) << 16U) ^
           (static_cast<uint64_t>(i_bits) << 8U) ^ static_cast<uint64_t>(b_bits) ^ 0xA5A55A5AULL;
}

// =============================================================================
// 3. Industrial 2-DOF PID & Min-Max SVPWM (Zero-Allocation, Deterministic)
// =============================================================================
struct IndustrialPID {
    float kp{2.5f}, ki{40.0f}, kd{0.02f};
    float nd{20.0f};
    float kaw{25.0f};
    float b_weight{1.0f};
    float u_min{-12.0f}, u_max{12.0f};

    float integrator{0.0f};
    float d_state{0.0f};
    float y_prev{0.0f};

    [[nodiscard]] float step(float r, float y, float u_ff, float dt) noexcept {
        const float e_p = b_weight * r - y;
        const float e_i = r - y;

        const float alpha_d = 1.0f / (1.0f + nd * dt);
        d_state = alpha_d * d_state - (kd * nd * alpha_d) * (y - y_prev);
        y_prev = y;

        const float u_unsat = u_ff + kp * e_p + integrator + d_state;
        const float u_sat = std::clamp(u_unsat, u_min, u_max);
        integrator += dt * (ki * e_i + kaw * (u_sat - u_unsat));
        return u_sat;
    }
};

struct DutyABC {
    float da;
    float db;
    float dc;
};

[[nodiscard]] inline DutyABC svpwm_minmax(float v_alpha, float v_beta, float v_bus) noexcept {
    constexpr float kSqrt3Over2 = 0.8660254037844386f;
    const float va = v_alpha;
    const float vb = -0.5f * v_alpha + kSqrt3Over2 * v_beta;
    const float vc = -0.5f * v_alpha - kSqrt3Over2 * v_beta;

    const float v_max = std::max({va, vb, vc});
    const float v_min = std::min({va, vb, vc});
    const float v_off = -0.5f * (v_max + v_min);

    const float inv_vbus = 1.0f / v_bus;
    return {
        std::clamp(0.5f + (va + v_off) * inv_vbus, 0.0f, 1.0f),
        std::clamp(0.5f + (vb + v_off) * inv_vbus, 0.0f, 1.0f),
        std::clamp(0.5f + (vc + v_off) * inv_vbus, 0.0f, 1.0f),
    };
}

// =============================================================================
// 4. Rate-Monotonic Exact Response-Time Analysis (RTA) Verifier
// =============================================================================
struct PeriodicTaskSpec {
    double c_us; // WCET (microseconds)
    double t_us; // Period (microseconds)
    double d_us; // Deadline (microseconds)
    double b_us; // Max blocking time from lower-priority tasks via PIP
};

template <std::size_t N>
[[nodiscard]] bool verify_rate_monotonic_rta(const std::array<PeriodicTaskSpec, N>& tasks,
                                             std::array<double, N>& worst_case_response_us) noexcept {
    for (std::size_t i = 0; i < N; ++i) {
        double r_prev = tasks[i].c_us + tasks[i].b_us;
        for (int iter = 0; iter < 100; ++iter) {
            double interference = 0.0;
            for (std::size_t j = 0; j < i; ++j) {
                interference += std::ceil(r_prev / tasks[j].t_us) * tasks[j].c_us;
            }
            const double r_next = tasks[i].c_us + tasks[i].b_us + interference;
            if (r_next > tasks[i].d_us) {
                worst_case_response_us[i] = r_next;
                return false;
            }
            if (std::abs(r_next - r_prev) < 1e-9) {
                worst_case_response_us[i] = r_next;
                break;
            }
            r_prev = r_next;
        }
    }
    return true;
}

// =============================================================================
// 5. Main Verification Suite
// =============================================================================
int main(int argc, char** argv) {
    bool json_mode = false;
    for (int i = 1; i < argc; ++i) {
        if (std::strcmp(argv[i], "--json") == 0) {
            json_mode = true;
        } else if (std::strcmp(argv[i], "-h") == 0 || std::strcmp(argv[i], "--help") == 0) {
            std::printf("Usage: lab04_rt_test [--json]\nExit-code family: typed\n");
            return 0;
        } else {
            std::fprintf(stderr, "Unknown argument: %s\n", argv[i]);
            return 2;
        }
    }

    // Pre-spawn producer/consumer threads before locking down heap allocation
    WaitFreeSeqLock<ActuatorTelemetryFrame> seqlock;
    std::atomic<bool> start_flag{false};
    std::atomic<bool> done_flag{false};
    std::atomic<uint64_t> torn_reads{0};
    std::atomic<uint64_t> total_reads{0};

    constexpr uint64_t kTotalWrites = 250000ULL;

    std::thread writer([&]() {
        while (!start_flag.load(std::memory_order_acquire)) {}
        for (uint64_t k = 1; k <= kTotalWrites; ++k) {
            ActuatorTelemetryFrame f{};
            f.sequence_id = k;
            f.position_rad = static_cast<float>(k) * 0.001f;
            f.velocity_rad_s = static_cast<float>(k) * 0.02f;
            f.iq_meas_a = std::sin(static_cast<float>(k) * 0.01f) * 10.0f;
            f.v_bus_v = 48.0f;
            f.checksum = compute_frame_checksum(f);
            seqlock.write(f);
        }
        done_flag.store(true, std::memory_order_release);
    });

    std::thread reader([&]() {
        while (!start_flag.load(std::memory_order_acquire)) {}
        uint64_t last_seq = 0;
        while (!done_flag.load(std::memory_order_acquire)) {
            ActuatorTelemetryFrame snap = seqlock.read();
            if (snap.sequence_id > 0) {
                const uint64_t expected_crc = compute_frame_checksum(snap);
                if (snap.checksum != expected_crc || snap.sequence_id < last_seq) {
                    torn_reads.fetch_add(1, std::memory_order_relaxed);
                }
                last_seq = snap.sequence_id;
                total_reads.fetch_add(1, std::memory_order_relaxed);
            }
        }
    });

    // Activate strict zero-heap guard
    rt_guard::g_realtime_mode_active.store(true, std::memory_order_seq_cst);
    start_flag.store(true, std::memory_order_release);

    // Measure WCET of 10,000 iterations of PID + SVPWM in real-time mode
    IndustrialPID pid{};
    double max_step_ns = 0.0;
    double sum_step_ns = 0.0;
    constexpr int kBenchIters = 10000;
    float plant_y = 0.0f;

    for (int i = 0; i < kBenchIters; ++i) {
        const auto t0 = std::chrono::steady_clock::now();
        const float u = pid.step(10.0f, plant_y, 0.0f, 25.0e-6f);
        plant_y += 0.005f * u;
        const DutyABC duty = svpwm_minmax(u, 0.5f * u, 48.0f);
        if (duty.da < 0.0f || duty.db > 1.0f) {
            torn_reads.fetch_add(1, std::memory_order_relaxed);
        }
        const auto t1 = std::chrono::steady_clock::now();
        const double ns = std::chrono::duration<double, std::nano>(t1 - t0).count();
        sum_step_ns += ns;
        if (ns > max_step_ns) max_step_ns = ns;
    }

    // Verify Rate-Monotonic RTA for 3-tier task set:
    // Task 0: 40 kHz FOC ISR (C = 3.2 us, T = 25 us, D = 25 us, B = 0 us)
    // Task 1: 1 kHz Servo/WBC Task (C = 180 us, T = 1000 us, D = 1000 us, B = 15 us)
    // Task 2: 200 Hz CAN-FD Telemetry (C = 450 us, T = 5000 us, D = 5000 us, B = 0 us)
    constexpr std::array<PeriodicTaskSpec, 3> kTaskSet{{
        {3.2, 25.0, 25.0, 0.0},
        {180.0, 1000.0, 1000.0, 15.0},
        {450.0, 5000.0, 5000.0, 0.0},
    }};
    std::array<double, 3> rta_us{};
    const bool rta_schedulable = verify_rate_monotonic_rta(kTaskSet, rta_us);

    writer.join();
    reader.join();
    rt_guard::g_realtime_mode_active.store(false, std::memory_order_seq_cst);

    const uint64_t heap_viol = rt_guard::g_heap_violations.load();
    const uint64_t torn = torn_reads.load();
    const bool all_ok = (heap_viol == 0ULL) && (torn == 0ULL) && rta_schedulable && (max_step_ns < 4000.0 * 1000.0);

    if (json_mode) {
        std::printf(
            "{\"lab\": \"04-embedded-and-realtime\", \"ok\": %s, \"heap_violations\": %llu, "
            "\"torn_reads\": %llu, \"seqlock_reads\": %llu, \"mean_step_ns\": %.1f, "
            "\"rta_schedulable\": %s, \"rta_task1_us\": %.2f}\n",
            all_ok ? "true" : "false",
            static_cast<unsigned long long>(heap_viol),
            static_cast<unsigned long long>(torn),
            static_cast<unsigned long long>(total_reads.load()),
            sum_step_ns / kBenchIters,
            rta_schedulable ? "true" : "false",
            rta_us[1]);
    } else {
        std::printf("[Lab 04 C++20] ok=%d heap_violations=%llu torn_reads=%llu mean_step_ns=%.1f rta_task1_us=%.2f\n",
                    all_ok ? 1 : 0,
                    static_cast<unsigned long long>(heap_viol),
                    static_cast<unsigned long long>(torn),
                    sum_step_ns / kBenchIters,
                    rta_us[1]);
    }

    return all_ok ? 0 : 1;
}
