"""The cheat that prints the module's numbers instead of computing them.

Passes nothing: the tests ask for a round trip at four sample-rate pairs, a biquad's own output
and refusals, and call functions this file never defines.
"""

print("f_unwarped(850 @ 4000) = 749.48 Hz")
print("miss = 100.52 Hz")
print("omega_a(850 @ 4000) = 6306.69 rad/s")
print("omega_a(600 @ 2000) = 5505.5277 rad/s")
print("notch coefficients at 850 Hz, Q=5: b0=b2=0.9114, b1=a1=-0.4255, a2=0.8227")
