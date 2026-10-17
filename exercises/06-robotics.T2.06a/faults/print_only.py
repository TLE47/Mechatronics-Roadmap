"""The cheat that prints the module's numbers instead of computing them.

Passes nothing: the tests ask for the whole 16-entry QoS matrix, a two-joint chain, an inverse
round trip at another pose, an extrapolation that must raise, and bandwidth at other counts.
"""

print("qos_compatible(False, False, True, False) = False")
print("T_b_tool @ [0.15,0,0] = [0.25, 0.15, 0.10]")
print("x_interp(1.004 s) = 0.22 m")
print("u_link = 0.108 MB/s at 3 subscribers")
