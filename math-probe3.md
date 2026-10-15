# Probe 3 — block interrupting a numbered list

### V1 current shape: multi-line $$ between items

1. **Forward Kinematics Map:**

$$
T(q) = e^{[\mathcal{S}_1]q_1} e^{[\mathcal{S}_2]q_2} \cdots e^{[\mathcal{S}_n]q_n} M \in SE(3)
$$

2. **Space Jacobian:**

prose after v1

### V2 escaped underscores between items

1. **Forward Kinematics Map:**

$$
T(q) = e^{[\mathcal{S}\_1]q_1} e^{[\mathcal{S}\_2]q_2} \cdots e^{[\mathcal{S}\_n]q_n} M \in SE(3)
$$

2. **Space Jacobian:**

prose after v2

### V3 block at the end of the item

1. **Forward Kinematics Map:**

$$
T(q) = e^{[\mathcal{S}_1]q_1} e^{[\mathcal{S}_2]q_2} M \in SE(3)
$$

   prose after v3

2. **Next item**

### V4 single-line glued dollars between items

1. **Forward Kinematics Map:**

$$T(q) = e^{[\mathcal{S}_1]q_1} e^{[\mathcal{S}_2]q_2} M \in SE(3)$$

2. **Space Jacobian:**

prose after v4

### V5 inline displaystyle paragraph between items

1. **Forward Kinematics Map:**

$\displaystyle T(q) = e^{[\mathcal{S}_1]q_1} e^{[\mathcal{S}_2]q_2} M \in SE(3)$

2. **Space Jacobian:**

prose after v5

### V6 mathstrut before each subscript, multi-line dollars

1. **Forward Kinematics Map:**

$$
T(q) = e^{[\mathcal{S}\mathstrut_1]q_1} e^{[\mathcal{S}\mathstrut_2]q_2} M \in SE(3)
$$

2. **Space Jacobian:**

prose after v6

### V7 no underscores at all, control

1. **Forward Kinematics Map:**

$$
T(q) = e^{[\mathcal{S}1]q1} e^{[\mathcal{S}2]q2} M \in SE(3)
$$

2. **Space Jacobian:**

prose after v7

### V8 html div wrapper

1. **Forward Kinematics Map:**

<div align="center">
$$T(q) = e^{[\mathcal{S}_1]q_1} e^{[\mathcal{S}_2]q_2} M \in SE(3)$$
</div>

2. **Space Jacobian:**

prose after v8

### V9 html p wrapper

1. **Forward Kinematics Map:**

<p align="center">$$T(q) = e^{[\mathcal{S}_1]q_1} e^{[\mathcal{S}_2]q_2} M \in SE(3)$$</p>

2. **Space Jacobian:**

prose after v9
