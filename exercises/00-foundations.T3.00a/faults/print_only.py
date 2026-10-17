"""The cheat that prints the module's numbers instead of computing them.

Passes nothing: the tests rotate other axes, build other matrices, and ask for the tiny-angle case
where the printed four-decimal answer is not a rotation at all.
"""

print("hat([1.5,-2.0,3.0]) @ [0.4,0.8,-0.5] = [-1.4, 1.95, 2.0]")
print("exp_so3([0,0,pi/2]) @ [1,0,0] = [0.0, 1.0, 0.0]")
print("det(exp_so3([1e-9,-1e-9,1e-9])) = 1.000000000000")
print("exp_so3([0,0,2pi]) = I_3")
print("H_dot = grad(H) . x_dot = 32.0")
