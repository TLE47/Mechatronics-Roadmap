"""Behaviour tests for 04-embedded.T2.04c.

Each test names the mistake it catches:
  * a stack aligned *down* (`1020 -> 1016`), which under-reserves the one thread whose size is not
    already a multiple of eight and overruns it at run time;
  * a static RAM total that forgets the `K_MSGQ_DEFINE` payload, reserving 4992 B where the image
    needs 6144 B;
  * a readiness check that reads the Devicetree `status` and ignores `prj.conf` (or the reverse),
    which is exactly the build that links a driver that never starts;
  * a FreeRTOS priority comparison (`>`), which lets the logging thread preempt the control loop;
  * an inheritance that takes `max()`, leaving the owner at priority 6 while the priority-2 thread
    waits - no inheritance at all;
  * a response time without the intermediate thread's compute time, reporting 145 us where a
    `k_sem`'s unbounded inversion costs 445 us.
"""

import unittest

import harness

submission = harness.load_submission()

DTS_NODES = {
    "fdcan1": {"status": "okay", "reg": 0x4000A400, "kconfig": "CONFIG_CAN"},
    "spi1": {"status": "okay", "reg": 0x40013000, "kconfig": "CONFIG_SPI"},
    "i2c2": {"status": "disabled", "reg": 0x40005800, "kconfig": "CONFIG_I2C"},
}
PRJ_CONF = {"CONFIG_CAN": True, "CONFIG_SPI": True, "CONFIG_I2C": False}


class AlignmentTests(unittest.TestCase):
    def test_the_worked_example_alignment(self):
        # 2048, 1536 and 1020 round to 2048, 1536 and 1024.
        self.assertEqual([submission.align_stack(size) for size in (2048, 1536, 1020)],
                         [2048, 1536, 1024])

    def test_an_already_aligned_stack_is_unchanged(self):
        self.assertEqual(submission.align_stack(2048), 2048)
        self.assertEqual(submission.align_stack(8), 8)

    def test_rounding_is_up_never_down(self):
        self.assertEqual(submission.align_stack(1020), 1024)
        self.assertEqual(submission.align_stack(1001), 1008)

    def test_a_single_byte_still_costs_a_full_alignment_unit(self):
        self.assertEqual(submission.align_stack(1), 8)
        self.assertEqual(submission.align_stack(1, 32), 32)

    def test_a_wider_alignment_rounds_to_its_own_grid(self):
        # A 16-byte-aligned port still leaves 1024 alone, but 1000 becomes 1008.
        self.assertEqual(submission.align_stack(1024, 16), 1024)
        self.assertEqual(submission.align_stack(1000, 16), 1008)

    def test_a_non_positive_stack_is_refused(self):
        with self.assertRaises(ValueError):
            submission.align_stack(0)
        with self.assertRaises(ValueError):
            submission.align_stack(-64)

    def test_a_non_positive_alignment_is_refused(self):
        with self.assertRaises(ValueError):
            submission.align_stack(1024, 0)


class StaticRamTests(unittest.TestCase):
    def test_the_worked_example_static_ram(self):
        # (2048 + 1536 + 1024) + 3 * 128 + 16 * 72 = 6144 B, with zero heap.
        total = submission.static_ram_bytes([2048, 1536, 1020], 128, [(16, 72)])
        self.assertEqual(total, 6144)

    def test_the_skip_test_static_ram(self):
        # (2048 + 128) + (1024 + 128) + 8 * 64 = 3840 B.
        self.assertEqual(submission.static_ram_bytes([2048, 1024], 128, [(8, 64)]), 3840)

    def test_every_thread_pays_a_control_block(self):
        # Two 512 B stacks and two 128 B TCBs: 1024 + 256 = 1280 B.
        self.assertEqual(submission.static_ram_bytes([512, 512]), 1280)

    def test_no_queue_means_no_queue_payload(self):
        self.assertEqual(submission.static_ram_bytes([512, 256]), 1024)

    def test_two_queues_both_count(self):
        total = submission.static_ram_bytes([], 128, [(8, 64), (4, 32)])
        self.assertEqual(total, 8 * 64 + 4 * 32)

    def test_a_negative_control_block_is_refused(self):
        with self.assertRaises(ValueError):
            submission.static_ram_bytes([512], -128)

    def test_a_negative_queue_is_refused(self):
        with self.assertRaises(ValueError):
            submission.static_ram_bytes([512], 128, [(-1, 64)])


class BindingTests(unittest.TestCase):
    def test_the_worked_example_readiness(self):
        self.assertIs(submission.device_dt_ready(DTS_NODES["fdcan1"], PRJ_CONF), True)
        self.assertIs(submission.device_dt_ready(DTS_NODES["spi1"], PRJ_CONF), True)
        self.assertIs(submission.device_dt_ready(DTS_NODES["i2c2"], PRJ_CONF), False)

    def test_an_okay_node_with_its_driver_off_is_not_ready(self):
        # CONFIG_SPI=n strips the driver out of the image even though the pin mux is described.
        node = {"status": "okay", "kconfig": "CONFIG_SPI"}
        self.assertIs(submission.device_dt_ready(node, {"CONFIG_SPI": False}), False)
        self.assertIs(submission.device_dt_ready(node, {}), False)

    def test_a_disabled_node_is_not_ready_even_with_its_driver_on(self):
        node = {"status": "disabled", "kconfig": "CONFIG_I2C"}
        self.assertIs(submission.device_dt_ready(node, {"CONFIG_I2C": True}), False)

    def test_an_incomplete_node_is_refused(self):
        with self.assertRaises(ValueError):
            submission.device_dt_ready({"status": "okay"}, PRJ_CONF)
        with self.assertRaises(ValueError):
            submission.device_dt_ready({"kconfig": "CONFIG_CAN"}, PRJ_CONF)

    def test_the_worked_example_binding_problems(self):
        self.assertEqual(submission.binding_problems(DTS_NODES, PRJ_CONF), ["i2c2"])

    def test_a_fully_bound_overlay_has_no_problems(self):
        nodes = {"fdcan1": DTS_NODES["fdcan1"], "spi1": DTS_NODES["spi1"]}
        self.assertEqual(submission.binding_problems(nodes, PRJ_CONF), [])


class PriorityTests(unittest.TestCase):
    def test_the_exercise_ordering(self):
        # p_fast = 2 outranks p_mid = 4, which outranks p_slow = 6.
        self.assertIs(submission.outranks(2, 4), True)
        self.assertIs(submission.outranks(4, 6), True)
        self.assertIs(submission.outranks(2, 6), True)

    def test_the_comparison_is_not_reversed(self):
        # A `>` here is the FreeRTOS habit, and it logs the control loop instead of running it.
        self.assertIs(submission.outranks(6, 2), False)
        self.assertIs(submission.outranks(5, 1), False)

    def test_equal_priorities_do_not_preempt_each_other(self):
        self.assertIs(submission.outranks(3, 3), False)

    def test_the_skip_test_top_priority(self):
        # min(5, 0, 3) = 0 is the most urgent of the three.
        self.assertIs(submission.outranks(0, 5), True)
        self.assertIs(submission.outranks(0, 3), True)
        self.assertIs(submission.outranks(5, 0), False)

    def test_cooperative_threads_outrank_every_preemptible_one(self):
        # Negative priorities are cooperative: they run to completion unless they yield.
        self.assertIs(submission.outranks(-1, 0), True)
        self.assertIs(submission.outranks(-2, -1), True)


class InheritanceTests(unittest.TestCase):
    def test_the_exercise_elevation(self):
        # p_slow = 6 inherits p_fast = 2: min(6, 2) = 2, which is below the mid thread's 4.
        elevated = submission.effective_priority(6, 2)
        self.assertEqual(elevated, 2)
        self.assertIs(submission.outranks(elevated, 4), True)

    def test_the_worked_example_elevation(self):
        self.assertEqual(submission.effective_priority(5, 1), 1)

    def test_the_skip_test_elevation(self):
        # A logger at 7 serving a priority-1 waiter runs at 1 while it holds the mutex.
        self.assertEqual(submission.effective_priority(7, 1), 1)

    def test_a_waiter_that_is_not_more_urgent_is_refused(self):
        with self.assertRaises(ValueError):
            submission.effective_priority(1, 5)
        with self.assertRaises(ValueError):
            submission.effective_priority(3, 3)


class ResponseTests(unittest.TestCase):
    def test_the_worked_example_response(self):
        # 90 us of compute plus a 30 us critical section: the medium thread never runs.
        self.assertAlmostEqual(submission.worst_case_response_us(90.0, 30.0), 120.0, delta=1e-12)

    def test_the_exercise_response_with_inheritance(self):
        self.assertAlmostEqual(submission.worst_case_response_us(110.0, 35.0), 145.0, delta=1e-12)

    def test_the_exercise_response_with_a_semaphore(self):
        # k_sem has no owner, so the 300 us medium thread preempts the un-elevated holder.
        self.assertAlmostEqual(submission.worst_case_response_us(110.0, 35.0, 300.0), 445.0,
                               delta=1e-12)

    def test_the_skip_test_response(self):
        self.assertAlmostEqual(submission.worst_case_response_us(85.0, 25.0), 110.0, delta=1e-12)

    def test_the_intermediate_term_defaults_to_zero(self):
        # A default of anything else would silently add inversion to the inheriting case.
        self.assertEqual(submission.worst_case_response_us(10.0, 5.0),
                         submission.worst_case_response_us(10.0, 5.0, 0.0))

    def test_a_negative_time_is_refused(self):
        with self.assertRaises(ValueError):
            submission.worst_case_response_us(-1.0, 35.0)
        with self.assertRaises(ValueError):
            submission.worst_case_response_us(110.0, -35.0)
        with self.assertRaises(ValueError):
            submission.worst_case_response_us(110.0, 35.0, -300.0)


if __name__ == "__main__":
    unittest.main()
