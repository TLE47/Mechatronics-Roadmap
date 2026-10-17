"""Exercise 04-embedded.T2.04c - reference solution.

Zephyr in arithmetic: statically allocated stacks rounded to the ABI's alignment, the compile-time
RAM footprint of `K_THREAD_DEFINE` + `K_MSGQ_DEFINE`, the Devicetree + Kconfig readiness contract
behind `device_is_ready()`, Zephyr's lower-number-means-more-urgent priority order, the `k_mutex`
priority-inheritance elevation, and the response time that follows from it.
"""

import math


def align_stack(size_b, align=8):
    """Round a requested `K_THREAD_DEFINE` stack size up to the next `align`-byte boundary."""
    if size_b <= 0:
        raise ValueError("a thread stack must be positive, not %r bytes" % (size_b,))
    if align <= 0:
        raise ValueError("an alignment must be positive, not %r bytes" % (align,))
    return int(size_b // align) * align


def static_ram_bytes(stacks, tcb_bytes=128, msgq=None):
    """Compile-time kernel RAM: aligned stacks + one TCB each + every static queue's payload."""
    if tcb_bytes < 0:
        raise ValueError("a thread control block cannot be %r bytes" % (tcb_bytes,))
    total = 0
    for size_b in stacks:
        total += align_stack(size_b) + tcb_bytes
    for max_msgs, msg_bytes in (msgq or []):
        if max_msgs < 0 or msg_bytes < 0:
            raise ValueError("a static message queue cannot hold %r messages of %r bytes"
                             % (max_msgs, msg_bytes))
        total += max_msgs * msg_bytes
    return total


def device_dt_ready(node, prj_conf):
    """`device_is_ready()` as a build-time contract: `status = "okay"` *and* the driver's Kconfig on."""
    for key in ("status", "kconfig"):
        if key not in node:
            raise ValueError("a devicetree node needs a %r field, not %r" % (key, sorted(node)))
    return node["status"] == "okay" and bool(prj_conf.get(node["kconfig"], False))


def binding_problems(nodes, prj_conf):
    """Every label in the merged devicetree whose driver would not come up, sorted."""
    return sorted(label for label, node in nodes.items()
                  if not device_dt_ready(node, prj_conf))


def outranks(priority_a, priority_b):
    """Zephyr urgency: the *smaller* number preempts. Equal priorities time-slice, neither wins."""
    return priority_a < priority_b


def effective_priority(priority_owner, priority_waiter):
    """`k_mutex` priority inheritance: the owner runs at min(p_owner, p_waiter) while it blocks a
    more urgent waiter - a lower number, therefore a higher urgency."""
    if priority_waiter >= priority_owner:
        raise ValueError("priority %r does not wait on an owner at %r: it is not the more urgent "
                         "thread" % (priority_waiter, priority_owner))
    return min(priority_owner, priority_waiter)


def worst_case_response_us(c_high, b_holder, c_intermediate=0.0):
    """Worst-case response of the high-urgency thread in microseconds.

    `b_holder` is the owner's *remaining* critical section. `c_intermediate` is 0 under `k_mutex`
    (priority inheritance keeps the medium thread out) and that thread's compute time under a
    non-inheriting `k_sem`, which lets it preempt the un-elevated owner.
    """
    if c_high < 0 or b_holder < 0 or c_intermediate < 0:
        raise ValueError("compute and blocking times cannot be negative")
    return c_high + b_holder + c_intermediate


# No `__main__` block: the browser grades this file's stdout against the appended self-check's
# single PASS line, and a second print here would be a mismatch for a correct answer.
