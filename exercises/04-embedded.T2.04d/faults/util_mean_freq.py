"""Planted fault: the utilisation divides the summed traffic by the number of streams.

With one stream it is exactly right, which is why the package's own single-stream tests would not
notice; with two 500 Hz streams it reports half the real load.
"""

import math

import mechalab_plant as plant  # noqa: F401  (imported so the fault matches the submission shape)


def wire_time_us(payload_bytes, xrce_bytes, bits_per_byte, bit_rate):
    if bit_rate <= 0.0:
        raise ValueError("bit rate must be positive")
    return 1e6 * bits_per_byte * (payload_bytes + xrce_bytes) / bit_rate


def link_utilization(streams, bits_per_byte, bit_rate):
    if not streams:
        return 0.0
    total = sum(f * wire_time_us(p, x, bits_per_byte, bit_rate) for f, p, x in streams)
    return total / (1e6 * len(streams))


def handle_total(n_timers, n_subs, n_srvs, n_clients):
    return n_timers + n_subs + n_srvs + n_clients


def spin_wcet_us(t_io_us, callbacks_us):
    return t_io_us + sum(callbacks_us)


def ntp_rtt_us(t1_mcu, t2_host, t3_host, t4_mcu):
    return (t4_mcu - t1_mcu) - (t3_host - t2_host)


def ntp_offset_us(t1_mcu, t2_host, t3_host, t4_mcu):
    return ((t2_host - t1_mcu) + (t3_host - t4_mcu)) / 2.0


def rtos_utilization(tasks):
    return sum(c / t for c, t in tasks)
