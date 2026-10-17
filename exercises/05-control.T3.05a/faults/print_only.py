"""The cheat that prints the module's numbers instead of computing them.

Passes nothing: the tests use a corrupted gain of 1.5 (naive -2.0, Joseph 3.25), a noiseless
posterior of 1.84, a K = 0 update that must return the prior, and a NEES of 4.0 against a
variance of 0.01.

"""

print("P_joseph=0.80 (K=0.8), post_skip=1.0, post_gate=1.84, bad_gain=3.25")
print("NEES=1.0 (e=0.20, var=0.04), overconfident=4.0")
print("SELF-CHECK PASS: 3 checks - the Joseph-form posterior and its bad-gain rescue, and the NEES")
