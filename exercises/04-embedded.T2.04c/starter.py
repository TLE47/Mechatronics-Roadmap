"""Exercise 04-embedded.T2.04c - the learner's file.

Seven holes that turn a Zephyr firmware image into arithmetic: the stack alignment the linker
applies, the static RAM `K_THREAD_DEFINE` + `K_MSGQ_DEFINE` reserve before `main()` runs, the
Devicetree + Kconfig readiness contract, Zephyr's priority *ordering*, the `k_mutex` inheritance
elevation, and the worst-case response time that elevation buys.

    EXERCISE_TARGET=exercises/04-embedded.T2.04c/starter.py \\
        python3 -m unittest discover -s exercises/04-embedded.T2.04c -p 'test_*.py'
"""


def align_stack(size_b, align=8):
    """Round a requested stack size up to the next `align`-byte boundary."""
    raise NotImplementedError("TODO 1: round UP with ceil, never down or to the nearest multiple")


def static_ram_bytes(stacks, tcb_bytes=128, msgq=None):
    """Aligned stacks + one TCB per thread + every static queue's payload."""
    raise NotImplementedError("TODO 2: every thread pays a TCB *and* its queue payload counts too")


def device_dt_ready(node, prj_conf):
    """True only when the node is `status = "okay"` and its Kconfig driver symbol is on."""
    raise NotImplementedError("TODO 3: two independent conditions - the status string AND the "
                              "Kconfig entry, defaulting to off when it is absent")


def binding_problems(nodes, prj_conf):
    """Sorted labels of the devicetree nodes that would not come up."""
    raise NotImplementedError("TODO 4: filter the labels through device_dt_ready, then sort them")


def outranks(priority_a, priority_b):
    """True when thread A preempts thread B - Zephyr's number that wins is the smaller one."""
    raise NotImplementedError("TODO 5: Zephyr is not FreeRTOS - compare with '<', not '>'")


def effective_priority(priority_owner, priority_waiter):
    """The owner's priority while a more urgent thread waits on its `k_mutex`."""
    raise NotImplementedError("TODO 6: min(), and a waiter that is not more urgent should have "
                              "nothing to wait for")


def worst_case_response_us(c_high, b_holder, c_intermediate=0.0):
    """Worst-case response time in microseconds."""
    raise NotImplementedError("TODO 7: add all three terms - the intermediate thread only runs "
                              "when the primitive does not inherit priority")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
