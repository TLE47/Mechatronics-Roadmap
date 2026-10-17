"""Planted fault: the priority comparison uses FreeRTOS's higher-number-wins rule."""

import math


def align_stack(size_b, align=8):
    if size_b <= 0:
        raise ValueError("a thread stack must be positive, not %r bytes" % (size_b,))
    if align <= 0:
        raise ValueError("an alignment must be positive, not %r bytes" % (align,))
    return int(math.ceil(float(size_b) / align)) * align


def static_ram_bytes(stacks, tcb_bytes=128, msgq=None):
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
    for key in ("status", "kconfig"):
        if key not in node:
            raise ValueError("a devicetree node needs a %r field, not %r" % (key, sorted(node)))
    return node["status"] == "okay" and bool(prj_conf.get(node["kconfig"], False))


def binding_problems(nodes, prj_conf):
    return sorted(label for label, node in nodes.items()
                  if not device_dt_ready(node, prj_conf))


def outranks(priority_a, priority_b):
    """Fault: `>` is the FreeRTOS habit, and here it hands the CPU to the logger."""
    return priority_a > priority_b


def effective_priority(priority_owner, priority_waiter):
    if priority_waiter >= priority_owner:
        raise ValueError("priority %r does not wait on an owner at %r: it is not the more urgent "
                         "thread" % (priority_waiter, priority_owner))
    return min(priority_owner, priority_waiter)


def worst_case_response_us(c_high, b_holder, c_intermediate=0.0):
    if c_high < 0 or b_holder < 0 or c_intermediate < 0:
        raise ValueError("compute and blocking times cannot be negative")
    return c_high + b_holder + c_intermediate
