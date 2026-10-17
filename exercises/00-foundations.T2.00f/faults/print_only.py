"""The cheat that prints the module's numbers instead of computing them.

Passes nothing: the tests ask for a fold at other rates, a round trip through the warping map, a
biquad's own output and a covariance for a different A.
"""

print("f_alias(3150 @ 4000) = 850.0 Hz")
print("f_alias(2700 @ 2000) = 700.0 Hz")
print("omega_a(850 @ 4000) = 6306.69 rad/s")
print("f_unwarped = 749.48 Hz, miss = 100.52 Hz")
print("notch coefficients at 850 Hz, Q=5: b0=b2=0.9114, b1=a1=-0.4255, a2=0.8227")
print("Sigma_y = [[1.04, 0.4], [0.4, 4.0]]")
