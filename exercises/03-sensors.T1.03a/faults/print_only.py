"""The print-only submission: every number the module prints, and not one function.

The tests import this file and find nothing to call, so a right-looking transcript scores zero.
"""

import math

V_term = 12.0
R = 4.0
Ke = 0.06
p = 7

i_stall = V_term / R
w_noload = V_term / Ke
we_noload = p * w_noload
cpr = 4 * 1024
resolution_deg = 360.0 / 16384

print("i_stall=%.1f A" % i_stall)
print("w_noload=%.0f rad/s" % w_noload)
print("w_e=%.0f rad/s" % we_noload)
print("cpr=%d counts/rev" % cpr)
print("p=%d, one electrical cycle per %.4f deg" % (p, 360.0 / p))
print("AS5048A resolution=%.5f deg" % resolution_deg)
print("quadrature 00->10->11->01->00 counts 4 forward edges")
print("two-bit jump 00->11 is not a step: %d" % 0)
print("tau at 0.08 N*m/A and 4.5 A: %.2f N*m" % (0.08 * 4.5))
print("math.fmod(7.0, 2*pi) = %.10f" % math.fmod(7.0, 2.0 * math.pi))
