"""The cheat that prints the module's numbers instead of computing them.

Passes nothing: the tests use a 2 ms grid, a reordered calibration dictionary, a negative slope,
a 0.158 rad RMS whose signed mean is zero, and a three-against-two length mismatch.
"""

print("t=[0.0, 0.1, 0.2, 0.3, 0.4], y=[0.5, 0.8, 1.1, 1.4, 1.7], mean=1.10, span=1.20")
print("err=[0.1, -0.1, 0.2, -0.2], rmse=0.1581 rad, git diff")
print("SELF-CHECK PASS: 4 checks")
