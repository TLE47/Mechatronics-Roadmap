/**
 * The grapher's drawing engine (`app/src/grapher/renderer.ts`).
 *
 * Two surfaces share one coordinate system:
 *
 *  - a 2D canvas draws the paper, the explicit curves and the points a Python run pushed;
 *  - a transparent WebGL2 canvas above it draws implicit curves from a fragment shader.
 *
 * The viewport arithmetic and the grid are pure functions, so panning is a `setState` and a redraw
 * rather than a re-derivation of ticks. Explicit curves are sampled adaptively: a uniform screen
 * step, then a midpoint is inserted wherever the chord misses the real curve by more than a pixel.
 * That is what keeps `sin(1/x)` from turning into a polygon while keeping a straight line cheap.
 *
 * A break in the stroke is a fact about the function, not a drawing accident: a non-finite value, or
 * a jump through a sign inversion, ends the current path. `tan(x)` and `1/x` therefore never get the
 * vertical line a naive `moveTo`/`lineTo` would invent across an asymptote.
 */

export interface Viewport {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export interface GraphPoint {
  x: number;
  y: number;
}

export interface ExplicitCurve {
  id: string;
  color: string;
  evaluate: (x: number) => number;
}

export interface ImplicitCurve {
  id: string;
  color: string;
  /** The compiled GLSL expression for `F(x, y)`. */
  expression: string;
  parameters: { name: string; uniform: string }[];
  values: Record<string, number>;
}

export interface HoverPoint extends GraphPoint {
  px: number;
  py: number;
  color: string;
}

const GRID_MINOR = 'rgba(148, 163, 184, 0.06)';
const GRID_MAJOR = 'rgba(148, 163, 184, 0.15)';
const AXIS_INK = 'rgba(203, 213, 225, 0.58)';
const LABEL_INK = 'rgba(148, 163, 184, 0.94)';
const PLOT_INK = '#070a12';
const LABEL_FONT = '11px ui-monospace, SFMono-Regular, Menlo, monospace';

export function viewportFor(width: number, height: number, halfWidth = 10): Viewport {
  const w = width > 0 ? width : 640;
  const h = height > 0 ? height : 420;
  const halfX = halfWidth > 0 ? halfWidth : 10;
  const halfY = (halfX * h) / w;
  return { xMin: -halfX, xMax: halfX, yMin: -halfY, yMax: halfY };
}

/** Keep the x window and make one unit the same number of pixels on both axes. */
export function fitViewport(view: Viewport, width: number, height: number): Viewport {
  if (!(width > 0) || !(height > 0)) return view;
  const xSpan = view.xMax - view.xMin;
  if (!(xSpan > 0)) return viewportFor(width, height);
  const centre = (view.yMin + view.yMax) / 2;
  const halfY = (xSpan * height) / (width * 2);
  return { ...view, yMin: centre - halfY, yMax: centre + halfY };
}

/**
 * A 1–2–5 step near `span / target`. The target is in pixels, so a wider plot gets more labels
 * rather than longer numbers.
 */
export function tickStep(span: number, target = 10): number {
  if (!(span > 0) || !Number.isFinite(span)) return 1;
  const raw = span / Math.max(1, target);
  const power = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / power;
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return factor * power;
}

export function ticksBetween(min: number, max: number, step: number): number[] {
  if (!(step > 0) || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [];
  const first = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let value = first; value <= max + step * 1e-6 && ticks.length < 240; value += step) {
    const decimals = Math.max(0, Math.min(10, -Math.floor(Math.log10(step)) + 1));
    ticks.push(Number(value.toFixed(decimals)));
  }
  return ticks;
}

export function tickLabel(value: number, step: number): string {
  if (value === 0 || Object.is(value, -0)) return '0';
  const magnitude = Math.abs(value);
  if (magnitude >= 1e6 || magnitude < 1e-4) {
    return value.toExponential(1).replace('e+', 'e');
  }
  const decimals = Math.max(0, Math.min(8, -Math.floor(Math.log10(step))));
  return Number(value.toFixed(decimals)).toString();
}

export function zoomViewport(view: Viewport, factor: number, anchor?: GraphPoint): Viewport {
  if (!(factor > 0) || !Number.isFinite(factor)) return view;
  const x = anchor?.x ?? (view.xMin + view.xMax) / 2;
  const y = anchor?.y ?? (view.yMin + view.yMax) / 2;
  return {
    xMin: x + (view.xMin - x) * factor,
    xMax: x + (view.xMax - x) * factor,
    yMin: y + (view.yMin - y) * factor,
    yMax: y + (view.yMax - y) * factor,
  };
}

export function panViewport(
  view: Viewport,
  dxPixels: number,
  dyPixels: number,
  width: number,
  height: number
): Viewport {
  if (!(width > 0) || !(height > 0)) return view;
  const dx = (dxPixels / width) * (view.xMax - view.xMin);
  const dy = (dyPixels / height) * (view.yMax - view.yMin);
  return {
    xMin: view.xMin - dx,
    xMax: view.xMax - dx,
    yMin: view.yMin + dy,
    yMax: view.yMax + dy,
  };
}

export function pointAt(
  view: Viewport,
  px: number,
  py: number,
  width: number,
  height: number
): GraphPoint {
  if (!(width > 0) || !(height > 0)) return { x: 0, y: 0 };
  return {
    x: view.xMin + (px / width) * (view.xMax - view.xMin),
    y: view.yMax - (py / height) * (view.yMax - view.yMin),
  };
}

export function pixelAt(view: Viewport, point: GraphPoint, width: number, height: number): GraphPoint {
  return {
    x: ((point.x - view.xMin) / (view.xMax - view.xMin)) * width,
    y: height - ((point.y - view.yMin) / (view.yMax - view.yMin)) * height,
  };
}

export interface SampleOptions {
  /** Pixels between the initial samples. Four is smooth enough to start from; refinement adds more. */
  stepPx?: number;
  maxDepth?: number;
  /** How far, in pixels, a midpoint may sit from the chord before the interval is split. */
  tolerancePx?: number;
}

function finite(value: number): boolean {
  return Number.isFinite(value);
}

/**
 * Sample a function with midpoint subdivision.
 *
 * The first pass is uniform in screen space (four pixels by default). Each interval asks whether its
 * midpoint lies on the chord; if it does not, the interval is bisected and both halves are asked
 * again. The recursion is bounded by depth and by a minimum width, so a true asymptote becomes a gap
 * without turning a pointer move into an unbounded loop.
 */
export function sampleExplicit(
  evaluate: (x: number) => number,
  view: Viewport,
  width: number,
  options: SampleOptions = {}
): GraphPoint[][] {
  const xSpan = view.xMax - view.xMin;
  if (!(xSpan > 0) || !(width > 0)) return [];
  const ySpan = view.yMax - view.yMin;
  if (!(ySpan > 0)) return [];
  const stepPx = options.stepPx ?? 4;
  const maxDepth = options.maxDepth ?? 9;
  const tolerance = options.tolerancePx ?? 0.55;
  const intervals = Math.max(2, Math.min(2400, Math.ceil(width / Math.max(1, stepPx))));
  const path: GraphPoint[] = [];

  const read = (x: number): number => {
    try {
      return evaluate(x);
    } catch {
      return Number.NaN;
    }
  };

  // The viewport keeps square units in normal use, so this is the plot's real pixel height; using it
  // here keeps the tolerance in pixels instead of in an arbitrary part of the y span.
  const heightGuess = Math.max(1, width * (ySpan / xSpan));
  const screenY = (y: number) => ((view.yMax - y) / ySpan) * heightGuess;

  const needsSplit = (x0: number, y0: number, x1: number, y1: number, xm: number, ym: number): boolean => {
    if (!finite(y0) || !finite(y1) || !finite(ym)) return true;
    const p0 = screenY(y0);
    const p1 = screenY(y1);
    const pm = screenY(ym);
    const chord = (p0 + p1) / 2;
    if (Math.abs(pm - chord) > tolerance) return true;
    // A jump that crosses the axis can be an asymptote even when the midpoint happens to land on the
    // chord. Keep bisecting so the break lands near the real singularity rather than at the first
    // coarse sample.
    const jump = Math.abs(y1 - y0);
    const signFlip = Math.sign(y0) !== Math.sign(y1);
    if (jump > ySpan * 4 && signFlip) return true;
    // A tight corner can be missed by the chord test when both arms are steep; compare the direction
    // of the two halves on screen as well.
    const left = { x: x0, y: p0 };
    const middle = { x: xm, y: pm };
    const right = { x: x1, y: p1 };
    const a = { x: middle.x - left.x, y: middle.y - left.y };
    const b = { x: right.x - middle.x, y: right.y - middle.y };
    const lengthA = Math.hypot(a.x, a.y);
    const lengthB = Math.hypot(b.x, b.y);
    if (lengthA > 0.001 && lengthB > 0.001) {
      const cosine = (a.x * b.x + a.y * b.y) / (lengthA * lengthB);
      if (cosine < 0.35 && Math.max(lengthA, lengthB) > 18) return true;
    }
    return false;
  };

  const refine = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    depth: number
  ): void => {
    if (depth >= maxDepth || x1 - x0 <= xSpan * 1e-7) return;
    const xm = (x0 + x1) / 2;
    const ym = read(xm);
    if (!needsSplit(x0, y0, x1, y1, xm, ym)) return;
    refine(x0, y0, xm, ym, depth + 1);
    path.push({ x: xm, y: ym });
    refine(xm, ym, x1, y1, depth + 1);
  };

  let previousX = view.xMin;
  let previousY = read(previousX);
  path.push({ x: previousX, y: previousY });
  for (let index = 1; index <= intervals; index += 1) {
    const x = view.xMin + (index / intervals) * xSpan;
    const y = read(x);
    refine(previousX, previousY, x, y, 0);
    path.push({ x, y });
    previousX = x;
    previousY = y;
  }

  const segments: GraphPoint[][] = [];
  let segment: GraphPoint[] = [];
  const jump = ySpan * 3;
  let last: GraphPoint | null = null;
  for (const point of path) {
    if (!finite(point.y)) {
      if (segment.length > 1) segments.push(segment);
      segment = [];
      last = null;
      continue;
    }
    if (last) {
      const delta = point.y - last.y;
      const signFlip = Math.sign(point.y) !== Math.sign(last.y);
      const offscreenGap = Math.abs(point.y) > ySpan * 2 || Math.abs(last.y) > ySpan * 2;
      if (Math.abs(delta) > jump && (signFlip || offscreenGap)) {
        if (segment.length > 1) segments.push(segment);
        segment = [];
      }
    }
    segment.push(point);
    last = point;
  }
  if (segment.length > 1) segments.push(segment);
  return segments;
}

export interface Scene {
  viewport: Viewport;
  width: number;
  height: number;
  curves: ExplicitCurve[];
  points: GraphPoint[];
  pointColor?: string;
  hover?: HoverPoint | null;
}

function crisp(value: number): number {
  return Math.round(value) + 0.5;
}

/** The paper: minor lines, major lines, axes and labels that follow the axes when they leave. */
export function drawGrid(
  context: CanvasRenderingContext2D,
  viewport: Viewport,
  width: number,
  height: number
): void {
  const xSpan = viewport.xMax - viewport.xMin;
  const ySpan = viewport.yMax - viewport.yMin;
  if (!(xSpan > 0) || !(ySpan > 0)) return;
  const toPixelX = (x: number) => ((x - viewport.xMin) / xSpan) * width;
  const toPixelY = (y: number) => height - ((y - viewport.yMin) / ySpan) * height;

  context.clearRect(0, 0, width, height);
  context.fillStyle = PLOT_INK;
  context.fillRect(0, 0, width, height);

  const xStep = tickStep(xSpan, Math.max(4, Math.round(width / 88)));
  const yStep = tickStep(ySpan, Math.max(3, Math.round(height / 70)));

  const lines = (step: number, ink: string) => {
    if (!(step > 0)) return;
    context.strokeStyle = ink;
    context.lineWidth = 1;
    context.beginPath();
    for (const tick of ticksBetween(viewport.xMin, viewport.xMax, step)) {
      const x = crisp(toPixelX(tick));
      if (x < 0 || x > width) continue;
      context.moveTo(x, 0);
      context.lineTo(x, height);
    }
    for (const tick of ticksBetween(viewport.yMin, viewport.yMax, step)) {
      const y = crisp(toPixelY(tick));
      if (y < 0 || y > height) continue;
      context.moveTo(0, y);
      context.lineTo(width, y);
    }
    context.stroke();
  };

  // Minor lines only when their spacing is still readable. A grid that turns into a solid tint at
  // one zoom level is worse than no minor lines at all.
  if ((xStep / 5 / xSpan) * width >= 6) lines(xStep / 5, GRID_MINOR);
  if ((yStep / 5 / ySpan) * height >= 6) lines(yStep / 5, GRID_MINOR);
  lines(xStep, GRID_MAJOR);
  lines(yStep, GRID_MAJOR);

  const axisX = toPixelY(0);
  const axisY = toPixelX(0);
  context.strokeStyle = AXIS_INK;
  context.lineWidth = 1.1;
  context.beginPath();
  if (axisX >= 0 && axisX <= height) {
    context.moveTo(0, crisp(axisX));
    context.lineTo(width, crisp(axisX));
  }
  if (axisY >= 0 && axisY <= width) {
    context.moveTo(crisp(axisY), 0);
    context.lineTo(crisp(axisY), height);
  }
  context.stroke();

  context.font = LABEL_FONT;
  context.fillStyle = LABEL_INK;
  const xLabelY = Math.max(2, Math.min(height - 14, axisX + 3));
  context.textAlign = 'center';
  context.textBaseline = 'top';
  for (const tick of ticksBetween(viewport.xMin, viewport.xMax, xStep)) {
    if (tick === 0) continue;
    const x = toPixelX(tick);
    if (x < 18 || x > width - 18) continue;
    context.fillText(tickLabel(tick, xStep), x, xLabelY);
  }
  const yLabelX = Math.max(24, Math.min(width - 6, axisY - 6));
  context.textAlign = 'right';
  context.textBaseline = 'middle';
  for (const tick of ticksBetween(viewport.yMin, viewport.yMax, yStep)) {
    if (tick === 0) continue;
    const y = toPixelY(tick);
    if (y < 12 || y > height - 12) continue;
    context.fillText(tickLabel(tick, yStep), yLabelX, y);
  }
  if (axisX >= 0 && axisX <= height && axisY >= 0 && axisY <= width) {
    context.textAlign = 'right';
    context.textBaseline = 'top';
    context.fillText('0', axisY - 4, axisX + 3);
  }
}

/** Draw the paper, the explicit curves, Python's points and the hover marker in one pass. */
export function drawScene(context: CanvasRenderingContext2D, scene: Scene): void {
  const { viewport, width, height } = scene;
  if (!(width > 0) || !(height > 0)) return;
  drawGrid(context, viewport, width, height);
  const xSpan = viewport.xMax - viewport.xMin;
  const ySpan = viewport.yMax - viewport.yMin;
  if (!(xSpan > 0) || !(ySpan > 0)) return;
  const toPixelX = (x: number) => ((x - viewport.xMin) / xSpan) * width;
  const toPixelY = (y: number) => height - ((y - viewport.yMin) / ySpan) * height;

  context.save();
  context.beginPath();
  context.rect(0, 0, width, height);
  context.clip();
  for (const curve of scene.curves) {
    context.strokeStyle = curve.color;
    context.lineWidth = 2;
    context.lineJoin = 'round';
    context.lineCap = 'round';
    for (const segment of sampleExplicit(curve.evaluate, viewport, width)) {
      context.beginPath();
      segment.forEach((point, index) => {
        const x = toPixelX(point.x);
        const y = toPixelY(point.y);
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.stroke();
    }
  }

  if (scene.points.length > 0) {
    const colour = scene.pointColor ?? '#f8fafc';
    for (const point of scene.points) {
      const x = toPixelX(point.x);
      const y = toPixelY(point.y);
      if (x < -8 || x > width + 8 || y < -8 || y > height + 8) continue;
      context.beginPath();
      context.arc(x, y, 3.6, 0, Math.PI * 2);
      context.fillStyle = colour;
      context.fill();
      context.lineWidth = 1.4;
      context.strokeStyle = '#f8fafc';
      context.stroke();
    }
  }

  if (scene.hover) {
    context.save();
    context.setLineDash([4, 4]);
    context.strokeStyle = 'rgba(148, 163, 184, 0.35)';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(scene.hover.px, 0);
    context.lineTo(scene.hover.px, height);
    context.stroke();
    context.setLineDash([]);
    context.beginPath();
    context.arc(scene.hover.px, scene.hover.py, 4.5, 0, Math.PI * 2);
    context.fillStyle = scene.hover.color;
    context.fill();
    context.lineWidth = 2;
    context.strokeStyle = '#f8fafc';
    context.stroke();
    context.restore();
  }
  context.restore();
}

function hexToRgb(color: string): [number, number, number] {
  const match = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return [1, 1, 1];
  const value = Number.parseInt(match[1]!, 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

const VERTEX_SHADER = `#version 300 es
in vec2 a_position;
void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
`;

interface ProgramEntry {
  program: WebGLProgram;
  color: WebGLUniformLocation | null;
  resolution: WebGLUniformLocation | null;
  view: WebGLUniformLocation | null;
  dpr: WebGLUniformLocation | null;
  parameters: Record<string, WebGLUniformLocation | null>;
}

function implicitFragment(expression: string, parameters: { name: string; uniform: string }[]): string {
  const declarations = [...new Set(parameters.map((parameter) => parameter.uniform))]
    .map((uniform) => `uniform float ${uniform};`)
    .join('\n');
  return `#version 300 es
precision highp float;
uniform vec2 u_resolution;
uniform vec4 u_view;
uniform vec3 u_color;
uniform float u_dpr;
${declarations}
out vec4 outColor;
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float x = u_view.x + uv.x * (u_view.y - u_view.x);
  float y = u_view.z + uv.y * (u_view.w - u_view.z);
  float F = ${expression};
  float gradient = length(vec2(dFdx(F), dFdy(F)));
  float distancePx = abs(F) / max(gradient, 1e-12);
  float alpha = 1.0 - smoothstep(0.45, 1.45, distancePx / max(u_dpr, 1.0));
  if (alpha <= 0.002) discard;
  outColor = vec4(u_color, alpha);
}
`;
}

/**
 * The transparent WebGL2 layer.
 *
 * Programs are cached by their GLSL expression. A parameter move writes a uniform; only a changed
 * equation text compiles a new program. The layer clears to transparent each frame so the 2D paper
 * underneath is never dimmed by an old implicit curve.
 */
export class ImplicitRenderer {
  private readonly gl: WebGL2RenderingContext | null;
  private readonly buffer: WebGLBuffer | null;
  private readonly vao: WebGLVertexArrayObject | null;
  private programs = new Map<string, ProgramEntry>();
  private failed = new Set<string>();
  private width = 0;
  private height = 0;
  private dpr = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      premultipliedAlpha: false,
      powerPreference: 'high-performance',
      // The layer is the only place implicit ink exists, so its frame has to survive compositing:
      // a screenshot of the sheet and a learner's own pixel read would both see an empty layer
      // without this. The plot is one full-screen triangle, so the copy costs nothing visible.
      preserveDrawingBuffer: true,
    });
    const gl = this.gl;
    if (!gl) {
      this.buffer = null;
      this.vao = null;
      return;
    }
    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  get available(): boolean {
    return this.gl !== null;
  }

  resize(width: number, height: number, dpr: number): void {
    this.width = Math.max(1, Math.round(width * dpr));
    this.height = Math.max(1, Math.round(height * dpr));
    this.dpr = Math.max(1, dpr);
  }

  private compile(expression: string, parameters: { name: string; uniform: string }[]): ProgramEntry | null {
    const gl = this.gl;
    if (!gl) return null;
    const key = `${expression}\u0000${parameters.map((parameter) => parameter.uniform).join(',')}`;
    const cached = this.programs.get(key);
    if (cached) return cached;
    if (this.failed.has(key)) return null;

    const vertex = gl.createShader(gl.VERTEX_SHADER);
    const fragment = gl.createShader(gl.FRAGMENT_SHADER);
    if (!vertex || !fragment) return null;
    gl.shaderSource(vertex, VERTEX_SHADER);
    gl.compileShader(vertex);
    gl.shaderSource(fragment, implicitFragment(expression, parameters));
    gl.compileShader(fragment);
    if (!gl.getShaderParameter(vertex, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(vertex) || 'vertex shader failed';
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      this.failed.add(key);
      throw new Error(`The graph shader could not compile: ${log}`);
    }
    if (!gl.getShaderParameter(fragment, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(fragment) || 'fragment shader failed';
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      this.failed.add(key);
      throw new Error(`The graph shader could not compile: ${log}`);
    }
    const program = gl.createProgram();
    if (!program) {
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      return null;
    }
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.bindAttribLocation(program, 0, 'a_position');
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program) || 'program link failed';
      gl.deleteProgram(program);
      this.failed.add(key);
      throw new Error(`The graph shader could not link: ${log}`);
    }
    const parameterLocations: Record<string, WebGLUniformLocation | null> = {};
    for (const parameter of parameters) {
      parameterLocations[parameter.uniform] = gl.getUniformLocation(program, parameter.uniform);
    }
    const entry: ProgramEntry = {
      program,
      color: gl.getUniformLocation(program, 'u_color'),
      resolution: gl.getUniformLocation(program, 'u_resolution'),
      view: gl.getUniformLocation(program, 'u_view'),
      dpr: gl.getUniformLocation(program, 'u_dpr'),
      parameters: parameterLocations,
    };
    this.programs.set(key, entry);
    return entry;
  }

  render(curves: ImplicitCurve[], viewport: Viewport): string[] {
    const gl = this.gl;
    if (!gl || !this.buffer || !this.vao || this.width <= 0 || this.height <= 0) return [];
    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (curves.length === 0) return [];

    // Every curve that compiles is drawn; every one that does not leaves its sentence here. A shader
    // failure is a fact about one line, so it must neither blank the sheet nor stay invisible.
    const failures: string[] = [];
    gl.useProgram(null);
    gl.bindVertexArray(this.vao);
    for (const curve of curves) {
      let entry: ProgramEntry | null = null;
      try {
        entry = this.compile(curve.expression, curve.parameters);
      } catch (failure) {
        failures.push(
          failure instanceof Error
            ? failure.message
            : 'An implicit curve could not be compiled'
        );
        continue;
      }
      if (!entry) continue;
      gl.useProgram(entry.program);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.uniform2f(entry.resolution, this.width, this.height);
      gl.uniform4f(entry.view, viewport.xMin, viewport.xMax, viewport.yMin, viewport.yMax);
      gl.uniform1f(entry.dpr, this.dpr);
      const [r, g, b] = hexToRgb(curve.color);
      gl.uniform3f(entry.color, r, g, b);
      for (const parameter of curve.parameters) {
        gl.uniform1f(entry.parameters[parameter.uniform] ?? null, curve.values[parameter.name] ?? 0);
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.bindVertexArray(null);
    gl.useProgram(null);
    return failures;
  }

  dispose(): void {
    const gl = this.gl;
    if (!gl) return;
    for (const entry of this.programs.values()) gl.deleteProgram(entry.program);
    this.programs.clear();
    if (this.buffer) gl.deleteBuffer(this.buffer);
    if (this.vao) gl.deleteVertexArray(this.vao);
  }
}
