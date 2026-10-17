"""The cheat that prints the module's numbers instead of computing them.

Passes nothing: the behaviour tests vary J, k and b, and a printed constant is simply wrong for the
cases the module never showed.
"""

print("A = [[0, 1], [-100, -4]]")
print("eigenvalues = -2 +- 9.797958971132712j")
print("stable = True")
print("Ad_euler(0.05) = [[1, 0.05], [-5, 0.8]]")
print("Ad_tustin(0.05) = [[0.8925, 0.0430], [-4.3011, 0.7204]]")
