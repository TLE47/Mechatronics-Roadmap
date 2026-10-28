# Visuals: the pictures beside the words

The reading pane is where this course keeps its walls of text: 92 pages, most of them 15–29 thousand
characters of prose, tables and code. A page that *describes* a signal chain, a control loop, a safe
bring-up sequence or a page-by-page route is read better when the same thing is drawn above it. This
page is what draws them, what a figure is allowed to be, and which checks keep it honest.

Every picture here is **app-drawn SVG**: no image files, no Mermaid runtime, no canvas library beyond
the arm. That is not purity for its own sake — it is what makes a figure cost a few hundred bytes of
data instead of a 300 kB renderer, follow the four palettes without a second asset, and carry its own
accessible name.

```mermaid
flowchart LR
    MD["A lesson page (.md)"] --> Gen["generate_lesson_pages.py"]
    MD -->|"<!-- figure: id | caption -->"| Gen
    MD -->|"```mermaid flowchart```"| Gen
    Gen --> Payload["dist/lesson-pages/*.json (v4)"]
    Payload --> Reader["LessonReader.tsx"]
    Scenes["visuals/scenes.ts<br/>73 named scenes"] --> Reader
    Reader --> Diagram["visuals/Diagram.tsx<br/>chain · loop · timing · states · bars · plot<br/>graph · matrix · bits · reach · schematic · route"]
    Hologram["visuals/Hologram.tsx<br/>the arm, draggable"] --> Home["components/home/HomeDashboard.tsx"]
```

## Three kinds of picture

| Kind | Where it comes from | How many | What it answers |
| :--- | :--- | :--- | :--- |
| **A named scene** | A line `<!-- figure: control-loop \| … -->` in the page's Markdown, naming an entry in [`app/src/visuals/scenes.ts`](../app/src/visuals/scenes.ts) | 107 figures on all 92 pages | "what is the chain, the field, the curve or the circuit this section describes?" |
| **A route** | The page's own Mermaid `flowchart`, when it is a single chain, parsed by the generator into a `route` block | 82 pages | "where does this lesson go, and what is the next checkpoint?" |
| **A graph** | The page's own Mermaid `flowchart`, when it branches: nodes and labelled arrows, drawn as the graph it is | 10 pages | "how do these lessons fit together, and what feeds what?" |

A scene is data, not drawing code: `Diagram.tsx` has one renderer per kind, so a new diagram is an
edit to a table and every figure shares the same rules. A route or a graph is not a scene at all — it
is the page's own words, laid out. A line becomes numbered steps; a fan-out becomes boxes and arrows,
because drawing a branch as a list would be a different diagram.

## The twelve kinds

| Kind | Drawn as | Used for |
| :--- | :--- | :--- |
| `chain` | a row of boxes with arrows | signal and power chains, the toolchain, unit cancellation, position→velocity→acceleration |
| `loop` | boxes on an ellipse | the closed loop, the debug loop, a for/while loop, the belt drive, the RL loop |
| `timing` | labelled curves on shared axes | step responses, quadrature edges, aliasing, loop deadlines, Bode margins, PWM/ADC timing |
| `states` | a vertical list of gates | safe bring-up, the four model checks, PLC states |
| `bars` | horizontal bars with a maximum | where a fault's cost lands, where the latency budget goes |
| `plot` | two labelled axes with real units | efficiency, gear trade-offs, three-phase currents, pole-zero maps, notch responses, the loop-inductance spike |
| `matrix` | a grid of values with row and column labels | a 4×4 transform, a state update, a stackup, a byte frame, a struct's field map |
| `bits` | a register, high bit left, fields bracketed above | bit weights, a `uint8_t` wrap, a 32-bit register map |
| `reach` | a ring with its two limits and marked radii | the arm's workspace, a datasheet's min/typ/max window |
| `schematic` | parts on a wire, with an optional shunt to ground | the RC charge, the brake chopper |
| `graph` | boxes and labelled arrows, layered from the edges | ROS 2 graphs, a devicetree, a launch tree, an autograd chain, an asset tree |
| `route` | numbered steps, top to bottom | the page's own linear flowchart |

The 73 named scenes live in `SCENES` — 13 chains, 6 loops, 8 timings, 2 states, 2 bar charts, 17 plots,
11 matrices, 3 bitfields, 1 reach dial, 2 schematics and 8 graphs. `scripts/test_visuals.mjs` checks
each kind against its own data: every arrow in a graph lands on a box the scene has, a matrix's cells
match its labels, a bitfield spans bits that exist, a plot's points and bands stay inside their axes, a
schematic's shunt hangs off a part it draws, and a reach dial has `min < max`.

## The reading pace

A picture is not decoration: it is where a beginner is allowed to stop. The generator's payloads are
committed, so the pace is a test rather than a review note — `tests/test_lesson_pages.py`'s
`ReadingPace` reads every payload and fails when:

- **a page carries no named figure** — every page has at least one;
- **a page carries no map** — its own flowchart must arrive as a `route` or a `graph`;
- **a teaching section is a wall of prose** — more than 1,400 characters of unbroken paragraphs on the
  beginner track (`track-p/`, `stage-0/`) or 2,500 in a module, ramp page or chapter.

"Unbroken" is the load-bearing word: a heading, a list, a table, a formula, a code fence or a picture
ends a run. The exam sections (`Skip test`, `Gate test`, `Graded package`) are exempt — a paper is read
one question at a time, and a diagram between two questions would be a hint.

## The arm, as a hologram

`visuals/Hologram.tsx` is the one picture you can grab: a two-link arm projected from 3D, with a neck
(yaw/pitch) that orbits the view and a shoulder/elbow you can pose. It is the dashboard's top tile, and
its geometry lives in [`holoModel.ts`](../app/src/visuals/holoModel.ts) as pure functions — forward
kinematics, inverse kinematics, the orbit clamp, the projection, the phosphor trail.

Keeping the model pure is what lets the suite prove the claims the component makes: joints clamp at
their mechanical stops, IK round-trips FK inside the reach and returns `null` outside it, the demo's
figure-eight never asks for a pose the hardware could not take, the projection is deterministic, and the
trail stops growing at its limit. The SVG view is a consumer of that model; a React Three Fiber view
could be swapped in later without moving a single assertion.

It zooms: the wheel over the figure, `+`/`-`, or the tray beside **Home pose** take it between 55% and
220%, and the readout in the tray is also the way back to 100% (`0` on the keyboard). Zoom multiplies
the projection's scale and nothing else — clamping lives in `clampZoom`, so a wild value or a `NaN`
lands on a bound or on 100% rather than on a blank figure, and the joints, limits and readouts are the
same instrument at every scale.

## Reading one at its own size

The scenes are laid out on a 640-unit canvas whose smallest labels are 9.5 units, so a figure is
legible at roughly its own width and not much below it. A lesson column beside the code is narrower
than that: the split reader gave a figure 366 px at 1280 (5.4 px type), which is a small drawing rather
than a readable one, and a phone gives it 308 px. Scaling a diagram down scales its words down with it.

So the reading column keeps the whole work area until both halves work: the two-column split waits
until 1760 px, the width at which the reading half still clears 640 px, and below it the reader takes
the full 790 px at 1280 — a 728 px figure, drawn at 1.14× its own units.

Three rules follow, and each is checked in `npm run test:e2e:pages`:

- **A figure can be expanded.** The header's **Expand** button, or the drawing itself, opens the same
  SVG in a sheet over the page: `max(640 px, 90vw)` wide, 22 px type at 1440, Escape or a click on the
  scrim to leave, focus back on the button that opened it.
- **The sheet never shrinks the drawing.** Its art sits in a `min-width: 640px` strip inside a
  horizontal scroller, so a phone pans across full-size labels instead of reading quarter-size ones.
- **The inline figure does the same below 640 px.** `.figure-art` (`index.css`) keeps the 640 px width
  and scrolls, which is the bargain a wide table already makes; the page itself must never gain a
  horizontal scrollbar for it.
- **Except on the introduction**, which is a showcase rather than a lesson: `.intro-root .figure-art`
  fits the column at every width, so nothing on `?view=intro` asks a phone to swipe a diagram. The
  Expand sheet still offers the full 640 units when the labels need reading.

## What a figure may never do

- **A lesson figure moves only as much as it needs to, and only while it is read.** `Diagram` takes
  `live`, which lets `visuals/liveFigure.ts` annotate the drawing it already emitted — one packet per
  connector on a `chain`, `loop`, `graph` or `states`, one cursor on the longest solid curve of a
  `timing` or `plot`. A reference figure (matrix, register, schematic, reach dial, the page's route)
  never gains a mark: it is a table, not a process. There is no glow, no state cycling and no
  chrome, so the paragraph beside the figure stays the loudest thing on the page. An
  `IntersectionObserver` starts the frame loop when the figure comes on screen and removes the marks
  when it leaves; nothing runs for a figure nobody is looking at. The expanded sheet is always a
  still, because it exists to read the labels.
- **One switch, and it is also the cheap setting.** The header's **Motion** button and the
  introduction's Play/Pause are the same remembered preference (`motionPrefs.ts`), so the two can
  never disagree. A first visit is **on**: the page opens on its drawings, and the switch at the top of
  the header is what asks for stillness, remembered on every surface. (The surfaces that animate CSS
  rather than a canvas — the launch arm, the tour — still read `prefers-reduced-motion` themselves.)
  Off stops every frame loop — lesson and introduction alike — so turning it off is how a reader on a
  slow machine makes the app do less work; on starts them again.
- **The introduction is the show.** `LiveFigure` (`components/intro/IntroPage.tsx`) animates the
  *same* SVGs after mount — boxes change state in a workflow, a cursor rides a plot, a periodic wave
  rolls through its own period — by annotating the emitted drawing, so there is no second copy to
  drift from the lesson's. The page's own chrome follows the same rule: the section chips light the
  one you are reading, the six lesson moves change state in order, each lab carries its ready
  beacon, and the stat cards, "your work" cards and closing panel sweep. Pause on the section row or
  the header stills every half at once. An off-screen figure stops its frame loop either way.
- **A moving thing moves by the clock, not by the frame.** The launch arm (`components/HeroArm.tsx`)
  advances by elapsed time — capped at 50 ms a step — so a 120 Hz screen runs the same loop as a 60 Hz
  one and a stalled frame is one normal step instead of a jump. Its figure-eight is *lifted above the
  base* (`heroArmModel.ts`): centred on the base it passed through it twice a loop, where a two-link
  solution has no defined joint angle and the elbow whipped 359° in one frame, which reads as the arm
  skipping between its left and right poses. Lifted, the target stays inside the reach and outside the
  folded arm, every frame moves a joint under 3°, and the dashed preview is the same function the
  target follows — so it cannot drift from the arm. The canvas also measures **its own box** with a
  `ResizeObserver`, not only the window: the introduction sizes it on `dvh`, so a late box change that
  arrives with no `resize` event used to leave the backing store at the old height and stretch the
  drawing (round joints became ellipses). A size change drops the trail rather than drawing points from
  the old space, and `e2e_home` sets a late 264 px box and insists the backing follows, then restores it.
- **No hard-coded colour.** Every stroke and fill is a CSS custom property the palettes define
  (`--ink`, `--body`, `--muted`, `--line`, `--line-soft`, `--accent`, `--canvas`), so dark, light, paper
  and high contrast need no special case.
- **A connector is a run, and a label is never painted over.** A chain leaves a 30-unit shaft
  between boxes (it was 14, which the arrowhead mostly filled); a graph's gap grows with the longest
  edge label it carries, and those labels are drawn *after* the boxes, clear of their arrow and with
  a canvas-coloured halo. That is the fix for `/target` disappearing under the box beside it, or
  being cut in half by the wire it names.
- **No unlabelled picture.** Each figure is `role="img"` with an `aria-label` built from its title and
  caption, and its caption is a `<figcaption>` — it belongs to the picture in the accessibility tree and
  cannot be mistaken for the next paragraph.
- **No silent blank.** A `figure` id this build does not know renders a visible "this build has no
  figure called …" note, because a diagram that vanishes reads as a page that never had one.
- **No invented graph.** A page's branchy flowchart keeps its own nodes and labels; it is never
  re-shaped to fit a layout. A Mermaid diagram that is not a flowchart (sequence, class) is still
  dropped, and a graph past 14 boxes is left out rather than drawn as a hairball.
- **No paragraph pretending to be a figure.** A scene's caption is one sentence; the page's caption is
  one sentence; the paragraph stays in the prose.
- **No shrinking below its canvas.** A figure rendered narrower than 640 px without a way to pan or
  expand it is a figure with unreadable labels; the sheet and the phone strip exist for that.

## Adding one

A lesson figure is one line, at the point in the page where it belongs:

```markdown
## Learn

<!-- figure: control-loop | The whole lesson tunes these four arrows. -->
```

The comment form is deliberate: GitHub hides it, so the page still reads as prose in the repository,
and the workbench shows the diagram. The id must be a scene this build draws (`SCENES`), and the caption
is the sentence under the picture. A new scene is a new entry in `scenes.ts`; if it is a new *kind* of
picture, that is one branch in `Diagram.tsx` and one assertion in `test_visuals.mjs`.

## What it costs

| Metric | Measured | Ceiling | Why |
| :--- | :--- | :--- | :--- |
| `entry_gzip` | 522.3 kB | 530 kB | the figures are app code on the first-screen chunk: the reader draws them beside the text |
| `largest_js_gzip` | 338.5 kB | 344 kB | the runner chunk carries the kit |
| `reader_gzip` | 685.8 kB | 720 kB | 107 figures, 82 routes and 10 graphs later; still fetched one page at a time |

No audio file, no image, no font. The whole visual kit — 73 scenes, twelve renderers, the arm model, the
hologram — is 11.7 kB gzipped on chunks that already existed.

## The checks

| Claim | Command |
| :--- | :--- |
| A scene is drawable, each kind's data is consistent, an unknown id is refused, the arm obeys its own limits, and every committed page's figures, routes and graphs validate | `npm run test:visuals` |
| The landing arm is continuous (no frame moves a joint 3°), its target stays inside the workspace, its preview is the path the tip follows, and its loop advances by time at any frame rate | `npm run test:arm` |
| The generator turns a single-chain flowchart into a route and a branching one into a graph, refuses a graph too large to read, and never copies Mermaid source into a payload | `python3 -m unittest tests.test_lesson_pages` |
| Every page carries a figure and a map, and no teaching section is a wall of prose | `python3 -m unittest tests.test_lesson_pages` (`ReadingPace`) |
| The built bundle draws a named figure, the page's route and a branching page's graph in the reading pane, each with a name and a caption | `npm run test:e2e:pages` |
| The pane's structure did not move in any palette | `npm run check:snapshot` |
| Nothing added is a serious or critical accessibility violation | `npm run check:axe` |
| What all of it costs | `npm run check:weight` |
