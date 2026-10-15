# Display-math form probe (throwaway)

Same formula in ten contexts. Whichever form renders is the one the roadmap uses.

### A — indented, no blank lines around (the form currently in the roadmap)

1. **Lead-in with inline math $SO(3)$ then the block:**
   $$[\omega]_\times = \begin{bmatrix} 0 & -\omega_z & \omega_y \\ \omega_z & 0 & -\omega_x \\ -\omega_y & \omega_x & 0 \end{bmatrix}$$
   Prose after the block, same paragraph chunk.

### B — indented, blank line before and after

1. **Lead-in with inline math $SO(3)$ then the block:**

   $$[\omega]_\times = \begin{bmatrix} 0 & -\omega_z & \omega_y \\ \omega_z & 0 & -\omega_x \\ -\omega_y & \omega_x & 0 \end{bmatrix}$$

   Prose after the block, its own chunk.

### C — dedented to column 0, blank lines around

1. **Lead-in with inline math $SO(3)$ then the block:**

$$[\omega]_\times = \begin{bmatrix} 0 & -\omega_z & \omega_y \\ \omega_z & 0 & -\omega_x \\ -\omega_y & \omega_x & 0 \end{bmatrix}$$

   Prose after the block, its own chunk.

### D — multi-line dollars, indented, blank lines around

1. **Lead-in with inline math $SO(3)$ then the block:**

   $$
   [\omega]_\times = \begin{bmatrix} 0 & -\omega_z & \omega_y \\ \omega_z & 0 & -\omega_x \\ -\omega_y & \omega_x & 0 \end{bmatrix}
   $$

   Prose after the block, its own chunk.

### E — multi-line dollars at column 0, blank lines around

1. **Lead-in with inline math $SO(3)$ then the block:**

$$
[\omega]_\times = \begin{bmatrix} 0 & -\omega_z & \omega_y \\ \omega_z & 0 & -\omega_x \\ -\omega_y & \omega_x & 0 \end{bmatrix}
$$

   Prose after the block, its own chunk.

### F — inline math only, displaystyle, indented

1. **Lead-in with inline math $SO(3)$ then the block:**

   $\displaystyle [\omega]_\times = \begin{bmatrix} 0 & -\omega_z & \omega_y \\ \omega_z & 0 & -\omega_x \\ -\omega_y & \omega_x & 0 \end{bmatrix}$

   Prose after the block, its own chunk.

### G — glued aligned environment at column 0, blank lines around

1. **Lead-in with inline math $SO(3)$ then the block:**

$$\begin{aligned} \mathfrak{so}(3) &= \{ [\omega]_\times \in \mathbb{R}^{3\times 3} \mid [\omega]_\times^\top = -[\omega]_\times \} \\ [\omega]_\times &= \begin{bmatrix} 0 & -\omega_z & \omega_y \end{bmatrix} \end{aligned}$$

   Prose after the block, its own chunk.

### H — glued delimiters on one line, indented, blank lines around

1. **Lead-in with inline math $SO(3)$ then the block:**

   $$\mathfrak{so}(3) = \{ [\omega]_\times \in \mathbb{R}^{3\times 3} \mid [\omega]_\times^\top = -[\omega]_\times \}$$

   Prose after the block, its own chunk.

### I — underscore escaping inside inline math

Unescaped $[\omega]_\times$ and escaped $[\omega]\_\times$ and a matrix $\begin{bmatrix} a & b \\ c & d \end{bmatrix}$ in prose.

### J — blank line before, prose glued after the closer

1. **Lead-in with inline math $SO(3)$ then the block:**

   $$[\omega]_\times = \begin{bmatrix} 0 & -\omega_z & \omega_y \end{bmatrix}$$
   Prose after the block, glued to the closer.

### K — control, no list, blank lines around

$$[\omega]_\times = \begin{bmatrix} 0 & -\omega_z & \omega_y \\ \omega_z & 0 & -\omega_x \\ -\omega_y & \omega_x & 0 \end{bmatrix}$$
