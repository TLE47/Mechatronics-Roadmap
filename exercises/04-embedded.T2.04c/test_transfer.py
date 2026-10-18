"""Transfer tests for 04-embedded.T2.04c - the same laws on the shared plant's tick.

Three claims:
  1. the exercise's 145 us mutex bound and 445 us semaphore bound are read against the plant's
     1 ms control tick: 14.5% and 44.5% of one step, both inside the deadline;
  2. the plant's own four-thread firmware image is a 5632 B static footprint, 17.19% of a 32 KiB
     part, with the queue payload counted;
  3. the priorities a control loop at 1 ms actually needs: 1 outranks the telemetry thread at 3 and
     the logger at 7, and the inheritance elevation is what keeps the medium thread out.
"""

import unittest

import harness

submission = harness.load_submission()
plant = harness.plant


class TickBudgetTests(unittest.TestCase):
    def test_the_plant_tick_is_one_millisecond(self):
        self.assertAlmostEqual(
            plant.DT * 1e6, 1000.0, delta=1e-9,
            msg="expected the plant's control tick to be 1000 us; a different figure means every "
                "response-time fraction below is measured against another deadline - check DT",
        )
        self.assertAlmostEqual(
            plant.TICKS * plant.DT, 1.0, delta=1e-12,
            msg="expected the plant's TICKS x DT to be one second of run time; another span means "
                "the tick count and the step disagree - check the pair of constants",
        )

    def test_the_mutex_bound_fits_inside_one_tick(self):
        microseconds = plant.DT * 1e6
        response = submission.worst_case_response_us(110.0, 35.0)
        self.assertLess(
            response, microseconds,
            msg="expected the 110 us compute plus 35 us critical section to fit inside one plant "
                "tick; a longer response means the mutex bound is being read against a shorter "
                "deadline than the loop really has",
        )
        self.assertAlmostEqual(
            response / microseconds, 0.145, delta=1e-12,
            msg="expected the inherited response to use 14.5 percent of the tick, 145 us of 1000; "
                "a different fraction means the compute or the blocking term changed - check "
                "110 + 35",
        )

    def test_the_semaphore_bound_also_fits_but_costs_more_than_three_times_the_mutex(self):
        microseconds = plant.DT * 1e6
        safe = submission.worst_case_response_us(110.0, 35.0)
        inverted = submission.worst_case_response_us(110.0, 35.0, 300.0)
        self.assertLess(
            inverted, microseconds,
            msg="expected even the uninherited 445 us response to stay inside the 1 ms tick, "
                "which is why the module tolerates it; a longer response means the medium "
                "thread's 300 us was counted more than once",
        )
        self.assertAlmostEqual(
            inverted / microseconds, 0.445, delta=1e-12,
            msg="expected the semaphore case to eat 44.5 percent of the tick, 445 us of 1000; a "
                "smaller fraction means the intermediate thread's compute is missing - check "
                "the third argument",
        )
        self.assertAlmostEqual(
            inverted / safe, 89.0 / 29.0, delta=1e-12,
            msg="expected the semaphore response to be 89/29 times the mutex response, since 445 "
                "over 145 reduces to that ratio; another ratio means one of the two bounds was "
                "computed with a different blocking time",
        )


class StaticImageTests(unittest.TestCase):
    def test_the_plants_four_thread_firmware(self):
        # Four stacks (2048, 1024, 1024, 512), four 128 B TCBs, one 8 x 64 B queue:
        # 4608 + 512 + 512 = 5632 B.
        total = submission.static_ram_bytes([2048, 1024, 1024, 512], 128, [(8, 64)])
        self.assertEqual(
            total, 5632,
            msg="expected the four-thread image to be 5632 B, 4608 of stacks, 512 of TCBs and "
                "512 of queue; 5120 means the queue was left out and 4608 means the TCBs were - "
                "check all three terms",
        )

    def test_the_image_leaves_most_of_a_32_kib_part_free(self):
        total = submission.static_ram_bytes([2048, 1024, 1024, 512], 128, [(8, 64)])
        self.assertLess(
            total, 32 * 1024,
            msg="expected the static image to leave most of a 32 KiB part free; a larger figure "
                "means a stack or queue was double-counted - check the argument order",
        )
        self.assertAlmostEqual(
            total / (32 * 1024), 0.171875, delta=1e-12,
            msg="expected the image to consume 17.1875 percent of the part, 5632 of 32768; "
                "another fraction means the total or the part size is wrong - check both",
        )

    def test_an_odd_stack_is_padded_rather_than_rounded_to_nearest(self):
        # 1001 B on an 8-byte grid costs 1008 (a floor would charge 1000), so the total rises by eight.
        padded = sum(submission.align_stack(size) for size in (2048, 1024, 1024, 1001))
        self.assertEqual(
            padded, 2048 + 1024 + 1024 + 1008,
            msg="expected every stack rounded up to its 8-byte boundary, so 1001 costs 1008; "
                "1001 means the alignment was skipped, 1000 means it floored - check the ceil",
        )


class PriorityAgainstTheLoopTests(unittest.TestCase):
    def test_the_control_loop_outranks_telemetry_and_logging(self):
        # Zephyr: control p = 1, telemetry p = 3, logging p = 7, all preemptible.
        self.assertIs(
            submission.outranks(1, 3), True,
            msg="expected priority 1 to outrank 3, since Zephyr's smaller number preempts; False "
                "means the comparison was inverted - check the direction",
        )
        self.assertIs(
            submission.outranks(1, 7), True,
            msg="expected the control loop at 1 to outrank the logger at 7; False means the "
                "urgency order was read like a Linux nice value",
        )
        self.assertIs(
            submission.outranks(3, 7), True,
            msg="expected telemetry at 3 to outrank logging at 7, the module's own layering; "
                "False means the threads were assumed to share a priority",
        )
        self.assertIs(
            submission.outranks(7, 1), False,
            msg="expected the logger never to outrank the control loop; True means the "
                "comparison treats the larger number as more urgent",
        )

    def test_the_logger_serving_the_loop_runs_at_the_loops_priority(self):
        elevated = submission.effective_priority(7, 1)
        self.assertEqual(
            elevated, 1,
            msg="expected a logger holding a lock the priority-1 thread wants to be elevated to 1 "
                "while it holds it; 7 means no inheritance happened and the medium thread can "
                "preempt the owner",
        )
        self.assertIs(
            submission.outranks(elevated, 3), True,
            msg="expected the elevated logger to outrank the priority-3 telemetry thread, which "
                "is the whole point of the elevation; False means the medium thread still gets in",
        )

    def test_the_elevation_is_what_bounds_the_loop(self):
        inherited = submission.worst_case_response_us(110.0, 35.0)
        uninherited = submission.worst_case_response_us(110.0, 35.0, 300.0)
        self.assertLess(
            inherited, uninherited,
            msg="expected priority inheritance to give the shorter response of the pair, so the "
                "mutex is strictly better than the semaphore; a reversed comparison means the "
                "medium thread was added in both cases",
        )
        self.assertAlmostEqual(
            uninherited - inherited, 300.0, delta=1e-12,
            msg="expected the two responses to differ by exactly the medium thread's 300 us; a "
                "smaller gap means it was scaled or halved - check the third argument is added "
                "once",
        )


class BindingAgainstThePlantTests(unittest.TestCase):
    def test_the_plants_can_node_needs_both_its_overlay_and_its_driver(self):
        can = {"status": "okay", "kconfig": "CONFIG_CAN"}
        self.assertIs(
            submission.device_dt_ready(can, {"CONFIG_CAN": True}), True,
            msg="expected an okay-status node with its driver enabled to be ready; False means "
                "the Kconfig lookup or the status string was misread - check both halves of the "
                "contract",
        )
        offline = submission.binding_problems({"fdcan1": can}, {"CONFIG_CAN": False})
        self.assertEqual(
            offline, ["fdcan1"],
            msg="expected the node whose driver is off to be reported as the one problem; an "
                "empty list means the Kconfig flag was ignored, so the firmware would boot with "
                "a dead peripheral",
        )

    def test_a_three_peripheral_overlay_reports_only_the_missing_driver(self):
        nodes = {
            "fdcan1": {"status": "okay", "kconfig": "CONFIG_CAN"},
            "spi1": {"status": "okay", "kconfig": "CONFIG_SPI"},
            "i2c2": {"status": "okay", "kconfig": "CONFIG_I2C"},
        }
        self.assertEqual(
            submission.binding_problems(nodes, {"CONFIG_CAN": True, "CONFIG_SPI": True}),
            ["i2c2"],
            msg="expected only the I2C node to be reported, since its driver is the one left "
                "out; a longer list means the enabled drivers were flagged too - check the "
                "lookup is per node",
        )


if __name__ == "__main__":
    unittest.main()
