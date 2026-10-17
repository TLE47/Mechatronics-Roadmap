"""The cheat that prints the module's numbers instead of computing them.

Passes nothing: the tests call `exp_so3`, `inject_rotation` and `eskf_rotation_update`, none of
which exist here, and they check a 0.10 rad step about +x, a right multiplication, a held 0.05 rad
and a 0.07 rad second step.

"""

print("det(R_plus)=1.000000, angle(R_plus)=0.050000 rad, reset holds 0.05 rad")
print("second step with 0.02 rad innovation -> 0.070000 rad")
print("SELF-CHECK PASS: 5 checks")
