# Probe 2 — underscore emphasis pairing

### 1 pairing, top-level paragraph

$$\text{ADC}_{\text{code}} = \left\lfloor 4095 \cdot \frac{V_{\text{in}}}{3.3\text{ V}} \right\rfloor$$

prose after 1

### 2 pairing, inside a numbered list item

1. **lead-in line**

$$\text{ADC}_{\text{code}} = \left\lfloor 4095 \cdot \frac{V_{\text{in}}}{3.3\text{ V}} \right\rfloor$$

   prose after 2

### 3 pairing broken with s-b

$$\text{ADC}\sb{\text{code}} = \left\lfloor 4095 \cdot \frac{V\sb{\text{in}}}{3.3\text{ V}} \right\rfloor$$

prose after 3

### 4 pairing broken with escaped underscore

$$\text{ADC}\_{\text{code}} = \left\lfloor 4095 \cdot \frac{V\_{\text{in}}}{3.3\text{ V}} \right\rfloor$$

prose after 4

### 5 pairing broken with relax

$$\text{ADC}\relax_{\text{code}} = \left\lfloor 4095 \cdot \frac{V_{\text{in}}}{3.3\text{ V}} \right\rfloor$$

prose after 5

### 6 intraword underscores only, control

$$a_b + c_d = e_f$$

prose after 6

### 7 opener only, no closer, control

$$\text{ADC}_{\text{code}} + 5$$

prose after 7

### 8 inline math with two intraword subscripts

Inline $x_{1}$ then $y_{2}$ and a matrix $\begin{bmatrix} a & b \\ c & d \end{bmatrix}$ here.

### 9 inline math, punctuation-adjacent opener

Inline $\text{ADC}_{\text{code}} = 5$ here.

### 10 real rotation block with relax

1. **The Rotation Group $SO(3)$ and Lie Algebra $\mathfrak{so}(3)$:**

$$\mathfrak{so}(3) = \{ [\omega]\relax_\times \in \mathbb{R}^{3\times 3} \mid [\omega]\relax_\times^\top = -[\omega]\relax_\times \}$$

   prose after 10

### 11 real quaternion block with relax

1. **Quaternions:**

$$q_{k+1} = \text{normalize}\!\left(q_k + \frac{\Delta t}{2}\,q\relax_k \otimes \begin{bmatrix}0\\\omega_b\end{bmatrix}\right), \qquad q\relax_{\text{err}} = q\relax_{\text{des}}^{-1} \otimes q\relax_{\text{meas}}$$

   prose after 11
