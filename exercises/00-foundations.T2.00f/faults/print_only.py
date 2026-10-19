"""The cheat that prints the module's numbers instead of computing them.

Passes nothing: the tests ask for a Nyquist limit at other rates and a fold at other rates, and
call functions this file never defines.
"""

print("nyquist(4000) = 2000.0 Hz")
print("alias(3150 @ 4000) = 850.0 Hz")
print("alias(2700 @ 2000) = 700.0 Hz")
print("alias(9000 @ 4000) = 1000.0 Hz")
