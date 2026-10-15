# Probe 5 — escapes from italic and link-label leaks

1 split-italic: *Clear guide to* $V_{IH}$, $V_{IL}$ *threshold voltages* end.

2 bold-instead: **Clear guide to $V_{IH}$, $V_{IL}$ threshold voltages** end.

3 underscore-italic: _Clear guide to $V_{IH}$ threshold voltages_ end.

4 html-em: <em>Clear guide to $V_{IH}$ threshold voltages</em> end.

5 label-unicode: [PulseView guide for 15 USB logic analyzers](https://example.com) end.

6 label-math-moved: [PulseView and sigrok manual](https://example.com) $\to$ next.

7 heading-math-outside: ### [1.2 Coordinate Frames](https://example.com) ($SO(2)$)

8 italic-multi: *Note with $a_1$, $b_2$ and $\omega_n$ inside* end.
