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
        self.assertAlmostEqual(plant.DT * 1e6, 1000.0, delta=1e-9)
        self.assertAlmostEqual(plant.TICKS * plant.DT, 1.0, delta=1e-12)

    def test_the_mutex_bound_fits_inside_one_tick(self):
        microseconds = plant.DT * 1e6
        response = submission.worst_case_response_us(110.0, 35.0)
        self.assertLess(response, microseconds)
        self.assertAlmostEqual(response / microseconds, 0.145, delta=1e-12)

    def test_the_semaphore_bound_also_fits_but_costs_more_than_three_times_the_mutex(self):
        microseconds = plant.DT * 1e6
        safe = submission.worst_case_response_us(110.0, 35.0)
        inverted = submission.worst_case_response_us(110.0, 35.0, 300.0)
        self.assertLess(inverted, microseconds)
        self.assertAlmostEqual(inverted / microseconds, 0.445, delta=1e-12)
        self.assertAlmostEqual(inverted / safe, 89.0 / 29.0, delta=1e-12)


class StaticImageTests(unittest.TestCase):
    def test_the_plants_four_thread_firmware(self):
        # Four stacks (2048, 1024, 1024, 512), four 128 B TCBs, one 8 x 64 B queue:
        # 4608 + 512 + 512 = 5632 B.
        total = submission.static_ram_bytes([2048, 1024, 1024, 512], 128, [(8, 64)])
        self.assertEqual(total, 5632)

    def test_the_image_leaves_most_of_a_32_kib_part_free(self):
        total = submission.static_ram_bytes([2048, 1024, 1024, 512], 128, [(8, 64)])
        self.assertLess(total, 32 * 1024)
        self.assertAlmostEqual(total / (32 * 1024), 0.171875, delta=1e-12)

    def test_an_odd_stack_is_padded_rather_than_rounded_to_nearest(self):
        # 1001 B on an 8-byte grid costs 1008 (a floor would charge 1000), so the total rises by eight.
        padded = sum(submission.align_stack(size) for size in (2048, 1024, 1024, 1001))
        self.assertEqual(padded, 2048 + 1024 + 1024 + 1008)


class PriorityAgainstTheLoopTests(unittest.TestCase):
    def test_the_control_loop_outranks_telemetry_and_logging(self):
        # Zephyr: control p = 1, telemetry p = 3, logging p = 7, all preemptible.
        self.assertIs(submission.outranks(1, 3), True)
        self.assertIs(submission.outranks(1, 7), True)
        self.assertIs(submission.outranks(3, 7), True)
        self.assertIs(submission.outranks(7, 1), False)

    def test_the_logger_serving_the_loop_runs_at_the_loops_priority(self):
        elevated = submission.effective_priority(7, 1)
        self.assertEqual(elevated, 1)
        self.assertIs(submission.outranks(elevated, 3), True)

    def test_the_elevation_is_what_bounds_the_loop(self):
        inherited = submission.worst_case_response_us(110.0, 35.0)
        uninherited = submission.worst_case_response_us(110.0, 35.0, 300.0)
        self.assertLess(inherited, uninherited)
        self.assertAlmostEqual(uninherited - inherited, 300.0, delta=1e-12)


class BindingAgainstThePlantTests(unittest.TestCase):
    def test_the_plants_can_node_needs_both_its_overlay_and_its_driver(self):
        can = {"status": "okay", "kconfig": "CONFIG_CAN"}
        self.assertIs(submission.device_dt_ready(can, {"CONFIG_CAN": True}), True)
        offline = submission.binding_problems({"fdcan1": can}, {"CONFIG_CAN": False})
        self.assertEqual(offline, ["fdcan1"])

    def test_a_three_peripheral_overlay_reports_only_the_missing_driver(self):
        nodes = {
            "fdcan1": {"status": "okay", "kconfig": "CONFIG_CAN"},
            "spi1": {"status": "okay", "kconfig": "CONFIG_SPI"},
            "i2c2": {"status": "okay", "kconfig": "CONFIG_I2C"},
        }
        self.assertEqual(submission.binding_problems(nodes, {"CONFIG_CAN": True, "CONFIG_SPI": True}),
                         ["i2c2"])


if __name__ == "__main__":
    unittest.main()
