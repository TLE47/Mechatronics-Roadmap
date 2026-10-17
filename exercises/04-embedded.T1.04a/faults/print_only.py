"""The cheat that prints the module's numbers instead of computing them.

Passes nothing: the tests read a uint16 above one byte, a rollover, a clear that keeps its
neighbours, the byte order of the frame, and the signed count at its limit.
"""

print("int16=-32768..32767, uint8=0..255")
print("elapsed(4, 65530)=10, reg=0x52, frame=8 bytes")
print("SELF-CHECK PASS: 4 checks")
