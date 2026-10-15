# Probe 7 — square brackets versus inline math

### a brackets inside math

Text with $a = [b, c]^\top$ here.

### b lbrack inside math

Text with $a = \lbrack b, c \rbrack^\top$ here.

### c bracket outside math, prose

Torque constant $K_t$ [$\text{N}\cdot\text{m/A}$] and back-EMF constant.

### d bracket outside math, mid-sentence

Text $x$ then [$\text{N}$] then $y$ more.

### e exact repo shape

**Q2:** When transforming a 6D spatial wrench $\mathcal{F}_b = [\tau_b^\top, f_b^\top]^\top$ from body frame $\{b\}$ to space frame $\{s\}$ using $T_{sb} \in SE(3)$, why?

### f real bracket, no math

A real [reference link $x_1$][ref] plus text.

[ref]: https://example.com

### g nested list bracket

- item with $\tau$ [$\text{N}\cdot\text{m}$] units and $J$ inertia
