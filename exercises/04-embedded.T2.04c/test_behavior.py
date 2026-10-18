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
        self.assertEqual(
            [submission.align_stack(size) for size in (2048, 1536, 1020)],
            [2048, 1536, 1024],
            "expected 2048, 1536 and 1024 after rounding up to 8; a 1016 in the list likely aligned "
            "down - check the rounding direction",
        )

    def test_an_already_aligned_stack_is_unchanged(self):
        self.assertEqual(
            submission.align_stack(2048), 2048,
            "expected 2048 to be returned unchanged; a 2056 likely rounded up an already-aligned "
            "size - check the remainder test",
        )
        self.assertEqual(
            submission.align_stack(8), 8,
            "expected the smallest stack (8) to stay 8; a 16 likely added a unit for a zero "
            "remainder - check the modulo branch",
        )

    def test_rounding_is_up_never_down(self):
        self.assertEqual(
            submission.align_stack(1020), 1024,
            "expected 1020 to round up to 1024; 1016 likely aligned down - check that the remainder "
            "is added, not subtracted",
        )
        self.assertEqual(
            submission.align_stack(1001), 1008,
            "expected 1001 to round up to 1008; 1001 itself likely means the remainder was ignored "
            "- check the ceil arithmetic",
        )

    def test_a_single_byte_still_costs_a_full_alignment_unit(self):
        self.assertEqual(
            submission.align_stack(1), 8,
            "expected one byte to reserve a full 8-byte unit; a 0 likely truncated the remainder "
            "- check the non-zero return",
        )
        self.assertEqual(
            submission.align_stack(1, 32), 32,
            "expected a 32-byte grid to make one byte cost 32; an 8 likely used a hard-coded "
            "alignment - check the alignment argument is the grid",
        )

    def test_a_wider_alignment_rounds_to_its_own_grid(self):
        # A 16-byte-aligned port still leaves 1024 alone, but 1000 becomes 1008.
        self.assertEqual(
            submission.align_stack(1024, 16), 1024,
            "expected a 1024-byte stack on a 16-byte grid to stay 1024; 1040 likely rounded to the "
            "wrong grid - check the alignment divisor",
        )
        self.assertEqual(
            submission.align_stack(1000, 16), 1008,
            "expected 1000 to land on 1008 on a 16-byte grid; 1024 likely used the default "
            "8-byte unit - check the alignment argument is used",
        )

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
        self.assertEqual(
            total, 6144,
            "expected 6144 B (aligned stacks + 3 TCBs + the K_MSGQ_DEFINE payload); 4992 likely "
            "dropped the queue payload - check every queue is counted",
        )

    def test_the_skip_test_static_ram(self):
        # (2048 + 128) + (1024 + 128) + 8 * 64 = 3840 B.
        self.assertEqual(
            submission.static_ram_bytes([2048, 1024], 128, [(8, 64)]), 3840,
            "expected 3840 B from (2048 + 128) + (1024 + 128) + 8 * 64; a lower total likely "
            "charged one TCB for two threads - check the control block per stack",
        )

    def test_every_thread_pays_a_control_block(self):
        # Two 512 B stacks and two 128 B TCBs: 1024 + 256 = 1280 B.
        self.assertEqual(
            submission.static_ram_bytes([512, 512]), 1280,
            "expected 1280 B: two 512 B stacks plus two 128 B TCBs; 1024 likely counted the stacks "
            "only - check every thread pays a control block",
        )

    def test_no_queue_means_no_queue_payload(self):
        self.assertEqual(
            submission.static_ram_bytes([512, 256]), 1024,
            "expected 1024 B with no queues; a larger total likely added a default queue payload "
            "- check the empty queue list contributes nothing",
        )

    def test_two_queues_both_count(self):
        total = submission.static_ram_bytes([], 128, [(8, 64), (4, 32)])
        self.assertEqual(
            total, 8 * 64 + 4 * 32,
            "expected both queue payloads (512 + 128 B) and no stacks; a 512 total likely counted "
            "only the first queue - check the loop over queues",
        )

    def test_a_negative_control_block_is_refused(self):
        with self.assertRaises(ValueError):
            submission.static_ram_bytes([512], -128)

    def test_a_negative_queue_is_refused(self):
        with self.assertRaises(ValueError):
            submission.static_ram_bytes([512], 128, [(-1, 64)])


class BindingTests(unittest.TestCase):
    def test_the_worked_example_readiness(self):
        self.assertIs(
            submission.device_dt_ready(DTS_NODES["fdcan1"], PRJ_CONF), True,
            "expected fdcan1 ready with status=okay and CONFIG_CAN=y; False likely read only the "
            "Devicetree - check the Kconfig side too",
        )
        self.assertIs(
            submission.device_dt_ready(DTS_NODES["spi1"], PRJ_CONF), True,
            "expected spi1 ready with CONFIG_SPI=y; False likely treated the node as missing its "
            "driver - check the kconfig lookup",
        )
        self.assertIs(
            submission.device_dt_ready(DTS_NODES["i2c2"], PRJ_CONF), False,
            "expected i2c2 not ready: status=disabled and CONFIG_I2C=n; True likely checked only "
            "that the node exists - check both conditions",
        )

    def test_an_okay_node_with_its_driver_off_is_not_ready(self):
        # CONFIG_SPI=n strips the driver out of the image even though the pin mux is described.
        node = {"status": "okay", "kconfig": "CONFIG_SPI"}
        self.assertIs(
            submission.device_dt_ready(node, {"CONFIG_SPI": False}), False,
            "expected not-ready when the driver is off; True likely read status=okay alone "
            "- check the build symbol is required",
        )
        self.assertIs(
            submission.device_dt_ready(node, {}), False,
            "expected not-ready when prj.conf omits the symbol; True likely treated a missing key "
            "as enabled - check the default is False",
        )

    def test_a_disabled_node_is_not_ready_even_with_its_driver_on(self):
        node = {"status": "disabled", "kconfig": "CONFIG_I2C"}
        self.assertIs(
            submission.device_dt_ready(node, {"CONFIG_I2C": True}), False,
            "expected not-ready with status=disabled even though the driver is on; True likely "
            "checked only the Kconfig - check the Devicetree status first",
        )

    def test_an_incomplete_node_is_refused(self):
        with self.assertRaises(ValueError):
            submission.device_dt_ready({"status": "okay"}, PRJ_CONF)
        with self.assertRaises(ValueError):
            submission.device_dt_ready({"kconfig": "CONFIG_CAN"}, PRJ_CONF)

    def test_the_worked_example_binding_problems(self):
        self.assertEqual(
            submission.binding_problems(DTS_NODES, PRJ_CONF), ["i2c2"],
            "expected only i2c2 reported (disabled node with its driver off); a list of all three "
            "likely flagged every node - check the readiness test",
        )

    def test_a_fully_bound_overlay_has_no_problems(self):
        nodes = {"fdcan1": DTS_NODES["fdcan1"], "spi1": DTS_NODES["spi1"]}
        self.assertEqual(
            submission.binding_problems(nodes, PRJ_CONF), [],
            "expected no problems when every node is okay and its driver is on; a non-empty list "
            "likely counted an enabled node - check the polarity",
        )


class PriorityTests(unittest.TestCase):
    def test_the_exercise_ordering(self):
        # p_fast = 2 outranks p_mid = 4, which outranks p_slow = 6.
        self.assertIs(
            submission.outranks(2, 4), True,
            "expected priority 2 to outrank 4 (smaller number wins in Zephyr); False likely used "
            "a FreeRTOS > comparison - check the direction",
        )
        self.assertIs(
            submission.outranks(4, 6), True,
            "expected priority 4 to outrank 6; False likely treated the larger number as more "
            "urgent - check the operator",
        )
        self.assertIs(
            submission.outranks(2, 6), True,
            "expected 2 to outrank 6 across the gap; False likely compared only adjacent values "
            "- check the comparison uses the numbers",
        )

    def test_the_comparison_is_not_reversed(self):
        # A `>` here is the FreeRTOS habit, and it logs the control loop instead of running it.
        self.assertIs(
            submission.outranks(6, 2), False,
            "expected 6 not to outrank 2; True is the reversed comparison that lets a logging "
            "thread preempt the control loop - check the sign",
        )
        self.assertIs(
            submission.outranks(5, 1), False,
            "expected 5 not to outrank 1; True likely swapped the arguments - check which value "
            "is the competing priority",
        )

    def test_equal_priorities_do_not_preempt_each_other(self):
        self.assertIs(
            submission.outranks(3, 3), False,
            "expected equal priorities not to preempt each other; True likely used <= and would "
            "let a peer yield away its slice - check the strictness",
        )

    def test_the_skip_test_top_priority(self):
        # min(5, 0, 3) = 0 is the most urgent of the three.
        self.assertIs(
            submission.outranks(0, 5), True,
            "expected priority 0 to outrank 5; False likely rejected zero as a placeholder "
            "- check 0 is the most urgent number, not an empty value",
        )
        self.assertIs(
            submission.outranks(0, 3), True,
            "expected 0 to outrank 3 as well; False likely special-cased the same pair - check the "
            "comparison is uniform",
        )
        self.assertIs(
            submission.outranks(5, 0), False,
            "expected 5 not to outrank 0; True likely treated 0 as unset - check the boundary",
        )

    def test_cooperative_threads_outrank_every_preemptible_one(self):
        # Negative priorities are cooperative: they run to completion unless they yield.
        self.assertIs(
            submission.outranks(-1, 0), True,
            "expected a cooperative -1 to outrank preemptible 0; False likely clamped negative "
            "priorities to zero - check they are kept",
        )
        self.assertIs(
            submission.outranks(-2, -1), True,
            "expected -2 to outrank -1 among cooperative threads; False likely compared absolute "
            "values - check the sign is preserved",
        )


class InheritanceTests(unittest.TestCase):
    def test_the_exercise_elevation(self):
        # p_slow = 6 inherits p_fast = 2: min(6, 2) = 2, which is below the mid thread's 4.
        elevated = submission.effective_priority(6, 2)
        self.assertEqual(
            elevated, 2,
            "expected the holder to be raised to the waiter's 2; 6 likely returned the owner "
            "unchanged - check inheritance takes the minimum",
        )
        self.assertIs(
            submission.outranks(elevated, 4), True,
            "expected the elevated 2 to outrank the mid thread at 4; False likely inherited with "
            "max(), leaving 6 and no inheritance at all - check the direction",
        )

    def test_the_worked_example_elevation(self):
        self.assertEqual(
            submission.effective_priority(5, 1), 1,
            "expected the priority-5 holder serving a 1 to run at 1; 5 likely ignored the waiter "
            "- check the minimum of the two",
        )

    def test_the_skip_test_elevation(self):
        # A logger at 7 serving a priority-1 waiter runs at 1 while it holds the mutex.
        self.assertEqual(
            submission.effective_priority(7, 1), 1,
            "expected the logger at 7 to run at 1 while it holds the mutex; 7 likely means no "
            "inheritance - check the waiter's priority is applied",
        )

    def test_a_waiter_that_is_not_more_urgent_is_refused(self):
        with self.assertRaises(ValueError):
            submission.effective_priority(1, 5)
        with self.assertRaises(ValueError):
            submission.effective_priority(3, 3)


class ResponseTests(unittest.TestCase):
    def test_the_worked_example_response(self):
        # 90 us of compute plus a 30 us critical section: the medium thread never runs.
        self.assertAlmostEqual(
            submission.worst_case_response_us(90.0, 30.0), 120.0, delta=1e-12,
            msg="expected 120 us (90 compute + 30 critical section); a different total likely "
            "dropped a term - check both are added",
        )

    def test_the_exercise_response_with_inheritance(self):
        self.assertAlmostEqual(
            submission.worst_case_response_us(110.0, 35.0), 145.0, delta=1e-12,
            msg="expected 145 us with inheritance; 145 +/- a medium thread instead likely added "
            "inversion where the holder is elevated - check the third argument stays 0",
        )

    def test_the_exercise_response_with_a_semaphore(self):
        # k_sem has no owner, so the 300 us medium thread preempts the un-elevated holder.
        self.assertAlmostEqual(
            submission.worst_case_response_us(110.0, 35.0, 300.0), 445.0, delta=1e-12,
            msg="expected 445 us for a k_sem (no owner, so the 300 us medium thread preempts); "
            "145 likely ignored the inversion - check the third term is added",
        )

    def test_the_skip_test_response(self):
        self.assertAlmostEqual(
            submission.worst_case_response_us(85.0, 25.0), 110.0, delta=1e-12,
            msg="expected 110 us (85 + 25) on the inheriting path; a different total likely "
            "charged the default medium term - check the default is zero",
        )

    def test_the_intermediate_term_defaults_to_zero(self):
        # A default of anything else would silently add inversion to the inheriting case.
        self.assertEqual(
            submission.worst_case_response_us(10.0, 5.0),
            submission.worst_case_response_us(10.0, 5.0, 0.0),
            "expected the two-argument and explicit-zero calls to agree; a mismatch likely gave "
            "the third term a non-zero default - check the signature",
        )

    def test_a_negative_time_is_refused(self):
        with self.assertRaises(ValueError):
            submission.worst_case_response_us(-1.0, 35.0)
        with self.assertRaises(ValueError):
            submission.worst_case_response_us(110.0, -35.0)
        with self.assertRaises(ValueError):
            submission.worst_case_response_us(110.0, 35.0, -300.0)


if __name__ == "__main__":
    unittest.main()
