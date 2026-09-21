# Hand-drawn Function Finder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first complete offline Hand-drawn Function Finder in Systina12/UnDraw, from world-coordinate Canvas input through Worker-based numerical and symbolic fitting to simple, balanced, and accurate formulas.

**Architecture:** Use a Vite + TypeScript DOM application with a dependency-free mathematical core. The main thread owns input, viewport state, Canvas rendering, KaTeX, and controls; a replaceable module Worker owns preprocessing, fitting, symbolic search, ranking, beautification, and plot generation. All model families emit one Candidate shape and flow through one bounded CandidatePool.

**Tech Stack:** Vite, TypeScript, Canvas 2D, module Web Worker, KaTeX, Vitest, jsdom, Playwright Chromium, npm.

**Spec:** `docs/superpowers/specs/2026-09-21-hand-drawn-function-finder-design.md`

## Global Constraints

- Initial viewport: x and y both span [-5, 5].
- Stroke samples are world-coordinate `Point { x: number; y: number; t: number }` values.
- Function validation uses 128 x-buckets and requires a run of multi-valued buckets before rejecting y=f(x).
- Valid function data is resampled to exactly 256 uniform x positions.
- Smoothing uses a radius-2 median filter followed by degree-3 Savitzky–Golay filtering with window 9 or 11.
- Drawing noise uses `1.4826 * median(abs(r - median(r)))` with a finite epsilon floor.
- Numerical fitting runs in normalized u/v coordinates and final ASTs are restored to world x/y coordinates.
- Linear least squares uses Householder QR and never computes an inverse of A-transpose-A.
- Huber IRLS uses `delta = max(1.5 * normalizedNoise, 0.01)`.
- Levenberg–Marquardt uses central finite differences, at most 8 parameters, at most 60 iterations, and 4–8 deterministic starts.
- The model bank includes polynomial, sinusoid, Fourier, exponential, logarithm, absolute/hinge, rational, Gaussian, hyperbolic tangent, logistic, and damped sinusoid families.
- Symbolic search uses 32 semantic probes, maximum structural complexity 12, maximum 8 free parameters, 300 candidates per level, and a 48-candidate binary-combination beam.
- Constant beautification considers the original value plus at most four pretty alternatives per constant and keeps a beam of 32 combinations.
- Search stops at the noise floor, the time budget, the complexity cap, or three levels without meaningful improvement.
- Default search budgets are 1500 ms for desktop and 2000 ms for mobile; the fast stage targets its first progress result within 50 ms and must keep the complete fast model bank below 100 ms on 256 samples.
- Candidate evaluation rejects NaN, infinity, invalid log/sqrt domains, division by a value below 1e-10, and exp arguments outside the safe fitting clamp [-30, 30].
- Expensive solving runs only in a Worker. Starting a new solve terminates the old Worker instance and creates a fresh one, while request IDs provide a second stale-response guard.
- Built assets, including KaTeX fonts, are local. The already-open application continues solving after network access is disabled.
- Every task leaves the repository type-checking, tested for its current scope, and buildable.

## Review Focus

1. Circle, loop, vertical, and backtracking strokes must never be silently sorted into a false function; Task 3 and Task 20 pin function validation and parametric fallback.
2. Flat and nearly flat strokes with zero empirical noise must produce finite normalization, a constant candidate, and a quality label; Task 3 and Task 19 pin this.
3. Logarithm, rational, sqrt, and exponential paths must reject illegal domains, poles, and overflow without throwing; Tasks 6, 10, 11, and 18 pin this.
4. A second stroke submitted during a solve must terminate the old Worker and ignore every late old response; Task 21 pins both behaviors.
5. Sparse, duplicated, jittery, and partially dropped pointer samples must produce either a finite solve or a controlled invalid result; Tasks 3 and 24 pin this.

---

## File Map

- `package.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `index.html`: build and test entry points.
- `src/core/types.ts`: geometry, preprocessing, solver, candidate, result, and Worker protocol types.
- `src/core/preprocess.ts`, `resample.ts`, `smooth.ts`, `noise.ts`, `features.ts`, `solver.ts`: input-to-result orchestration.
- `src/math/vector.ts`, `matrix.ts`, `qr.ts`, `leastSquares.ts`, `brent.ts`, `lm.ts`, `robust.ts`, `fft.ts`: dependency-free numerical core.
- `src/expr/ast.ts`, `evaluate.ts`, `canonical.ts`, `simplify.ts`, `latex.ts`, `plain.ts`, `serialize.ts`, `transform.ts`: expression representation and world-coordinate restoration.
- `src/models/shared.ts` and one file per model family: CandidateProducer implementations.
- `src/search/candidatePool.ts`, `scoring.ts`, `pareto.ts`, `semanticHash.ts`, `grammar.ts`, `fitStructure.ts`, `symbolic.ts`: bounded candidate search.
- `src/beautify/rational.ts`, `constants.ts`, `beautify.ts`: global pretty-constant search.
- `src/worker/solver.worker.ts`, `client.ts`: Worker boundary, replacement, and progressive messages.
- `src/ui/viewport.ts`, `canvas.ts`, `plot.ts`, `controls.ts`, `results.ts`, `src/main.ts`, `src/styles.css`: browser UI.
- `tests/fixtures/synthetic.ts` and `candidates.ts`: deterministic fixtures.
- `tests/*.test.ts` and `e2e/app.spec.ts`: unit, integration, acceptance, performance, and browser tests.

---

### Task 1: Bootstrap Vite, TypeScript, Vitest, and browser-test dependencies

**Files:**
- Create: `package.json`
- Create: `package-lock.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/main.ts`
- Create: `src/styles.css`
- Create: `tests/smoke.test.ts`
- Create: `.gitignore`

**Interfaces:**
- Produces npm scripts `dev`, `build`, `typecheck`, `test`, `test:watch`, and `test:e2e`.
- Runtime dependency: `katex`.
- Development dependencies: `vite`, `typescript`, `vitest`, `jsdom`, `@types/katex`, and `@playwright/test`.

- [ ] **Step 1: Write the failing entry test**

~~~ts
import { describe, expect, it } from "vitest";

describe("application entry", () => {
  it("exports mountApp", async () => {
    const module = await import("../src/main");
    expect(typeof module.mountApp).toBe("function");
  });
});
~~~

- [ ] **Step 2: Run it and confirm the missing-module failure**

Run: `npm test -- --run tests/smoke.test.ts`  
Expected: FAIL because package configuration and `src/main.ts` do not exist.

- [ ] **Step 3: Add the minimal application entry**

~~~ts
export function mountApp(root: Element | null = document.querySelector("#app")): Element {
  if (!root) throw new Error("Missing #app root");
  root.replaceChildren(Object.assign(document.createElement("h1"), { textContent: "UnDraw" }));
  return root;
}

if (typeof document !== "undefined") {
  const root = document.querySelector("#app");
  if (root) mountApp(root);
}
~~~

Configure Vitest with jsdom and configure TypeScript with strict mode, no unchecked indexed access, DOM/WebWorker libraries, and no emit.

- [ ] **Step 4: Install, test, type-check, and build**

Run:

~~~bash
npm install
npm test -- --run tests/smoke.test.ts
npm run typecheck
npm run build
~~~

Expected: all commands pass and Vite emits `dist/index.html`.

- [ ] **Step 5: Commit**

~~~bash
git add package.json package-lock.json tsconfig.json tsconfig.node.json vite.config.ts index.html src tests .gitignore
git commit -m "chore: bootstrap UnDraw web application"
~~~

---

### Task 2: Define geometry types and viewport transforms

**Files:**
- Create: `src/core/types.ts`
- Create: `src/ui/viewport.ts`
- Create: `tests/viewport.test.ts`

**Interfaces:**

~~~ts
export interface Point { x: number; y: number; t: number; }
export interface Size { width: number; height: number; }
export interface Viewport { xmin: number; xmax: number; ymin: number; ymax: number; }
export interface SolverOptions {
  bucketCount?: number;
  sampleCount?: number;
  timeBudgetMs?: number;
  maxComplexity?: number;
  maxFreeParams?: number;
  maxCandidatesPerLevel?: number;
  mobile?: boolean;
}
~~~

Viewport exports: `createViewport()`, `screenToWorld(point, size, view)`, `worldToScreen(point, size, view)`, `panViewport(view, dx, dy)`, `zoomViewportAt(view, screenPoint, size, factor)`, and `resetViewport()`.

- [ ] **Step 1: Write failing transform tests**

~~~ts
import { describe, expect, it } from "vitest";
import { createViewport, screenToWorld, worldToScreen, zoomViewportAt } from "../src/ui/viewport";

describe("viewport", () => {
  it("round-trips a screen point", () => {
    const size = { width: 1000, height: 800 };
    const view = createViewport();
    const screen = { x: 237, y: 611 };
    const roundTrip = worldToScreen(screenToWorld(screen, size, view), size, view);
    expect(roundTrip.x).toBeCloseTo(screen.x, 10);
    expect(roundTrip.y).toBeCloseTo(screen.y, 10);
  });

  it("keeps the zoom anchor fixed", () => {
    const size = { width: 800, height: 600 };
    const anchor = { x: 240, y: 180 };
    const before = screenToWorld(anchor, size, createViewport());
    const afterView = zoomViewportAt(createViewport(), anchor, size, 2);
    const after = screenToWorld(anchor, size, afterView);
    expect(after.x).toBeCloseTo(before.x, 10);
    expect(after.y).toBeCloseTo(before.y, 10);
  });
});
~~~

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- --run tests/viewport.test.ts`  
Expected: FAIL because the modules are absent.

- [ ] **Step 3: Implement transforms with y-axis inversion**

Use:

~~~ts
const x = view.xmin + screen.x / size.width * (view.xmax - view.xmin);
const y = view.ymax - screen.y / size.height * (view.ymax - view.ymin);
~~~

Reject zero-sized canvases and non-positive zoom factors. Keep zoom centered on the exact world point under the pointer.

- [ ] **Step 4: Verify and commit**

Run: `npm test -- --run tests/viewport.test.ts && npm run typecheck && npm run build`  
Expected: PASS.

~~~bash
git add src/core/types.ts src/ui/viewport.ts tests/viewport.test.ts
git commit -m "feat: add mathematical viewport transforms"
~~~

---

### Task 3: Validate, resample, smooth, and normalize strokes

**Files:**
- Create: `src/core/resample.ts`
- Create: `src/core/smooth.ts`
- Create: `src/core/noise.ts`
- Create: `src/core/preprocess.ts`
- Modify: `src/core/types.ts`
- Create: `tests/fixtures/synthetic.ts`
- Create: `tests/preprocess.test.ts`

**Interfaces:**

~~~ts
export interface Normalization { xc: number; xs: number; yc: number; ys: number; }
export interface CurveData {
  x: number[];
  y: number[];
  smoothY: number[];
  u: number[];
  v: number[];
  domain: [number, number];
  noise: number;
  normalizedNoise: number;
  normalization: Normalization;
  raw: Point[];
}
export interface ParametricSamples { t: number[]; x: number[]; y: number[]; raw: Point[]; }
export type PreprocessResult =
  | { mode: "function"; data: CurveData }
  | { mode: "parametric"; data: ParametricSamples; reason: string }
  | { mode: "invalid"; reason: string };
~~~

Exports: `prepareCurveData(points, options): PreprocessResult` and deterministic fixtures `makeStroke`, `makeNoisyStroke`, `makeCircleStroke`, `makeVerticalStroke`, and `makeCurveData`.

- [ ] **Step 1: Write failing edge-case tests**

~~~ts
import { describe, expect, it } from "vitest";
import { prepareCurveData } from "../src/core/preprocess";
import { makeCircleStroke, makeStroke, makeVerticalStroke } from "./fixtures/synthetic";

describe("preprocessing", () => {
  it("resamples a noisy function to 256 finite points", () => {
    const result = prepareCurveData(makeStroke(x => x * x, { noise: 0.01 }), {});
    expect(result.mode).toBe("function");
    if (result.mode === "function") {
      expect(result.data.x).toHaveLength(256);
      expect(result.data.y.every(Number.isFinite)).toBe(true);
      expect(result.data.normalizedNoise).toBeGreaterThan(0);
    }
  });

  it.each([makeCircleStroke(), makeVerticalStroke()])("routes multi-valued input to parametric mode", points => {
    expect(prepareCurveData(points, {}).mode).toBe("parametric");
  });

  it("keeps flat input finite", () => {
    const result = prepareCurveData(makeStroke(() => 2), {});
    expect(result.mode).toBe("function");
    if (result.mode === "function") {
      expect(result.data.normalization.ys).toBeGreaterThan(0);
      expect(result.data.v.every(Number.isFinite)).toBe(true);
    }
  });

  it("rejects a one-point stroke cleanly", () => {
    expect(prepareCurveData([{ x: 0, y: 0, t: 0 }], {})).toEqual({
      mode: "invalid",
      reason: "Draw a longer curve.",
    });
  });
});
~~~

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- --run tests/preprocess.test.ts`  
Expected: FAIL because preprocessing is absent.

- [ ] **Step 3: Implement validation and resampling**

Preserve trajectory order. Estimate preliminary noise from robust second differences, place samples into 128 x-buckets, and compute median y and y spread per bucket. Mark a bucket multi-valued when its spread exceeds `max(4 * preliminaryNoise, 0.05 * yRange)`; require at least two adjacent marked buckets and more than 5% marked valid buckets. Treat fewer than eight occupied x-buckets as parametric/vertical input. Resample valid bucket medians to 256 uniform x positions, interpolate gaps of at most eight buckets, and trim larger edge gaps.

- [ ] **Step 4: Implement smoothing, final noise, and normalization**

Use radius-2 median filtering followed by fixed degree-3 Savitzky–Golay coefficients for window 9 or 11. Compute final noise from raw-resampled minus smooth residuals. Normalize with:

~~~ts
xc = (xmin + xmax) / 2;
xs = Math.max((xmax - xmin) / 2, 1e-12);
yc = median(y);
ys = Math.max((percentile(y, 0.95) - percentile(y, 0.05)) / 2, 1e-9);
~~~

- [ ] **Step 5: Add arc-length parametric samples and deterministic fixtures**

Generate `t = cumulativeLength / totalLength` and interpolate x(t), y(t) to 256 points. The fixture generator uses a seeded LCG, supports non-uniform sampling, x jitter, dropped samples, low-frequency wobble, and isolated outliers.

- [ ] **Step 6: Verify and commit**

Run: `npm test -- --run tests/preprocess.test.ts && npm run typecheck && npm run build`  
Expected: PASS for function, circle, vertical, flat, and sparse cases.

~~~bash
git add src/core tests/fixtures tests/preprocess.test.ts
git commit -m "feat: preprocess hand-drawn curve data"
~~~

---

### Task 4: Implement stable linear algebra and one-dimensional optimization

**Files:**
- Create: `src/math/vector.ts`
- Create: `src/math/matrix.ts`
- Create: `src/math/qr.ts`
- Create: `src/math/leastSquares.ts`
- Create: `src/math/brent.ts`
- Create: `src/math/robust.ts`
- Create: `tests/math-linear.test.ts`

**Interfaces:**

~~~ts
export type LinearSolveResult = { ok: true; x: number[]; residualNorm: number }
  | { ok: false; reason: "shape" | "rank" | "non-finite" };
export function qrLeastSquares(a: number[][], b: number[], weights?: number[]): LinearSolveResult;
export function brentMinimize(
  f: (x: number) => number,
  lo: number,
  hi: number,
  tolerance?: number,
  maxIterations?: number,
): { x: number; value: number; iterations: number };
~~~

Also export dot, norm2, matrix-vector multiplication, square linear solve, Huber weights/loss, RMSE, and max absolute error.

- [ ] **Step 1: Write failing QR and Brent tests**

~~~ts
import { describe, expect, it } from "vitest";
import { qrLeastSquares } from "../src/math/leastSquares";
import { brentMinimize } from "../src/math/brent";

describe("numerical primitives", () => {
  it("solves an overdetermined line", () => {
    const result = qrLeastSquares([[1, 0], [1, 1], [1, 2], [1, 3]], [2, 5, 8, 11]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.x[0]).toBeCloseTo(2, 10);
      expect(result.x[1]).toBeCloseTo(3, 10);
    }
  });

  it("rejects rank deficiency", () => {
    expect(qrLeastSquares([[1, 1], [2, 2]], [1, 2])).toMatchObject({ ok: false, reason: "rank" });
  });

  it("finds a bounded scalar minimum", () => {
    expect(brentMinimize(x => (x - 1.75) ** 2, -4, 4).x).toBeCloseTo(1.75, 6);
  });
});
~~~

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- --run tests/math-linear.test.ts`  
Expected: FAIL because math modules are absent.

- [ ] **Step 3: Implement Householder QR**

Copy the design matrix, apply Householder reflectors column by column, transform b in the same pass, and back-substitute R. Reject mismatched shapes, non-finite entries, underdetermined systems, and relative diagonals below `1e-12 * maxDiagonal`.

- [ ] **Step 4: Implement weighted fitting, robust metrics, and Brent**

Weighted fitting scales each row and target by sqrt(weight) before QR. Brent combines inverse-parabolic steps with golden-section fallback, never evaluates outside [lo, hi], and returns the best finite point.

- [ ] **Step 5: Verify and commit**

Run: `npm test -- --run tests/math-linear.test.ts && npm run typecheck`  
Expected: PASS and `rg "A.*T.*A|inverse" src/math` finds no normal-equation implementation.

~~~bash
git add src/math tests/math-linear.test.ts
git commit -m "feat: add stable QR and scalar optimization"
~~~

---

### Task 5: Implement bounded Levenberg–Marquardt with Huber IRLS

**Files:**
- Create: `src/math/lm.ts`
- Create: `tests/lm.test.ts`

**Interfaces:**

~~~ts
export interface LMOptions {
  maxIterations?: number;
  lower?: number[];
  upper?: number[];
  huberDelta?: number;
}
export interface LMResult {
  ok: boolean;
  params: number[];
  loss: number;
  iterations: number;
}
export function levenbergMarquardt(
  residual: (params: number[]) => number[],
  initial: number[],
  options?: LMOptions,
): LMResult;
~~~

- [ ] **Step 1: Write failing convergence and safety tests**

~~~ts
import { describe, expect, it } from "vitest";
import { levenbergMarquardt } from "../src/math/lm";

describe("Levenberg-Marquardt", () => {
  it("fits two nonlinear parameters", () => {
    const x = [-1, -0.5, 0, 0.5, 1];
    const y = x.map(value => 2 * Math.exp(0.7 * value));
    const result = levenbergMarquardt(
      params => {
        const a = params[0] ?? 0;
        const b = params[1] ?? 0;
        return x.map((value, i) => a * Math.exp(b * value) - (y[i] ?? 0));
      },
      [1, 0],
      { lower: [-10, -10], upper: [10, 10], maxIterations: 60 },
    );
    expect(result.ok).toBe(true);
    expect(result.params[0]).toBeCloseTo(2, 4);
    expect(result.params[1]).toBeCloseTo(0.7, 4);
  });

  it("returns ok=false for non-finite residuals", () => {
    expect(levenbergMarquardt(() => [Number.NaN], [1]).ok).toBe(false);
  });
});
~~~

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- --run tests/lm.test.ts`  
Expected: FAIL because LM is absent.

- [ ] **Step 3: Implement central-difference Jacobians and damped QR steps**

Use `h_j = 1e-5 * max(1, abs(theta_j))`. Build the augmented least-squares system `[sqrt(W)J; sqrt(lambda)I] step = [-sqrt(W)r; 0]`, solve with QR, clamp bounds, decrease lambda after improvement, and increase it after rejection.

- [ ] **Step 4: Implement finite-state retention and stopping**

Retain the best finite parameters even if later iterations fail. Stop after relative loss improvement below 1e-9, step norm below 1e-8, or 60 iterations. Reject parameter vectors longer than eight.

- [ ] **Step 5: Verify and commit**

Run: `npm test -- --run tests/lm.test.ts && npm run typecheck`  
Expected: PASS.

~~~bash
git add src/math/lm.ts tests/lm.test.ts
git commit -m "feat: add bounded robust nonlinear optimizer"
~~~

---

### Task 6: Implement the expression AST, safety, simplification, and rendering

**Files:**
- Create: `src/expr/ast.ts`
- Create: `src/expr/evaluate.ts`
- Create: `src/expr/canonical.ts`
- Create: `src/expr/simplify.ts`
- Create: `src/expr/latex.ts`
- Create: `src/expr/plain.ts`
- Create: `src/expr/serialize.ts`
- Create: `src/expr/transform.ts`
- Create: `tests/expr.test.ts`

**Interfaces:**

~~~ts
export type Constant =
  | { kind: "float"; value: number }
  | { kind: "integer"; value: number }
  | { kind: "rational"; p: number; q: number }
  | { kind: "piMultiple"; p: number; q: number }
  | { kind: "eMultiple"; p: number; q: number }
  | { kind: "sqrtMultiple"; p: number; q: number; n: number };

export type Expr =
  | { kind: "x" }
  | { kind: "param"; index: number }
  | { kind: "const"; value: Constant }
  | { kind: "add"; args: Expr[] }
  | { kind: "mul"; args: Expr[] }
  | { kind: "div"; a: Expr; b: Expr }
  | { kind: "pow"; base: Expr; exponent: Expr }
  | { kind: "sin" | "cos" | "exp" | "log" | "abs" | "sqrt" | "tanh"; arg: Expr };
~~~

Exports constructors, `evaluateExpr(expr, x, params?)`, `canonicalize`, `simplify`, `complexity`, `structuralHash`, `toLatex`, `toPlain`, `materializeParams`, `collectConstantPaths`, `replaceConstantAtPath`, and `denormalizeExpr`.

- [ ] **Step 1: Write failing AST tests**

~~~ts
import { describe, expect, it } from "vitest";
import { add, constant, mul, sin, variable } from "../src/expr/ast";
import { evaluateExpr } from "../src/expr/evaluate";
import { simplify } from "../src/expr/simplify";
import { toLatex } from "../src/expr/latex";

describe("expression AST", () => {
  it("removes neutral operations", () => {
    expect(toLatex(simplify(add(mul(constant(1), variable()), constant(0))))).toBe("x");
  });

  it("makes illegal evaluation non-throwing", () => {
    expect(evaluateExpr({ kind: "log", arg: constant(-1) }, 0)).toBeNaN();
    expect(evaluateExpr({ kind: "div", a: constant(1), b: constant(0) }, 0)).toBeNaN();
    expect(evaluateExpr({ kind: "exp", arg: constant(1000) }, 0)).toBeNaN();
  });

  it("renders trigonometry for KaTeX", () => {
    expect(toLatex(mul(constant(2), sin(variable())))).toContain("\\\\sin");
  });
});
~~~

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- --run tests/expr.test.ts`  
Expected: FAIL because expression modules are absent.

- [ ] **Step 3: Implement constructors and total evaluation**

Resolve Constant values centrally. Return NaN for denominator magnitude below 1e-10, log input <=0, sqrt input <0, non-finite intermediates, and exp input outside [-30, 30]. Param nodes without a finite supplied value return NaN.

- [ ] **Step 4: Implement canonicalization and simplification**

Flatten and sort add/mul operands by structural hash; fold constants; remove +0, *0, *1; combine repeated terms and polynomial powers; implement sqrt(x²) to abs(x), odd/even trig rules, exp(0), and log(1). Normalize sinusoid amplitude/frequency signs and phase to (-π, π].

- [ ] **Step 5: Implement renderers and coordinate restoration**

`denormalizeExpr(expr, normalization)` returns `yc + ys * expr((x - xc) / xs)`, then simplifies again. Render fractions, powers, roots, absolute values, and special constants without injecting raw HTML.

- [ ] **Step 6: Verify and commit**

Run: `npm test -- --run tests/expr.test.ts && npm run typecheck`  
Expected: PASS.

~~~bash
git add src/expr tests/expr.test.ts
git commit -m "feat: add expression AST and safe rendering"
~~~

---

### Task 7: Define candidates, scoring, semantic deduplication, and Pareto selection

**Files:**
- Modify: `src/core/types.ts`
- Create: `src/models/shared.ts`
- Create: `src/search/scoring.ts`
- Create: `src/search/semanticHash.ts`
- Create: `src/search/candidatePool.ts`
- Create: `src/search/pareto.ts`
- Create: `tests/fixtures/candidates.ts`
- Create: `tests/search.test.ts`

**Interfaces:**

~~~ts
export interface Candidate {
  expr: Expr;
  params: number[];
  error: number; // normalized RMSE
  rmse: number;
  robustError: number;
  maxError: number;
  complexity: number;
  freeParams: number;
  score: number;
  signature: string;
  modelFamily?: string;
  meta?: Record<string, number | string>;
}
export interface SolveContext {
  options: Required<SolverOptions>;
  deadline: number;
  now: () => number;
}
export interface CandidateProducer {
  name: string;
  produce(data: CurveData, context: SolveContext): Candidate[];
}
export interface CandidateResult {
  expr: Expr;
  latex: string;
  plain: string;
  rmse: number;
  normalizedRmse: number;
  complexity: number;
  score: number;
  modelFamily?: string;
  plot: { x: number[]; y: number[] };
}
~~~

Exports `makeCandidate`, `scoreCandidate`, `semanticSignature`, `CandidatePool`, `paretoFrontier`, and `selectPresentationCandidates`.
`tests/fixtures/candidates.ts` exports `candidateFixture(signature, error, complexity)`, `sineCandidateFixture(amplitude, omega, phase, offset)`, `candidateResultFixture(plain)`, `solveResultFixture(plain)`, `bestCandidate(candidates)`, and `testContext(overrides?)`. `bestCandidate` sorts by error and throws a clear assertion error for an empty list. The context uses a deterministic clock and fills every required SolverOptions value.

- [ ] **Step 1: Write failing ranking tests**

~~~ts
import { describe, expect, it } from "vitest";
import { candidateFixture } from "./fixtures/candidates";
import { paretoFrontier, selectPresentationCandidates } from "../src/search/pareto";

describe("candidate ranking", () => {
  it("removes dominated candidates", () => {
    const candidates = [
      candidateFixture("simple", 0.2, 2),
      candidateFixture("dominated", 0.3, 3),
      candidateFixture("accurate", 0.05, 8),
    ];
    expect(paretoFrontier(candidates).map(c => c.signature)).toEqual(["simple", "accurate"]);
  });

  it("selects all three named modes", () => {
    const selected = selectPresentationCandidates([
      candidateFixture("simple", 0.02, 2),
      candidateFixture("balanced", 0.01, 4),
      candidateFixture("accurate", 0.001, 8),
    ], 0.02, 12);
    expect(selected.simple.signature).toBe("simple");
    expect(selected.accurate.signature).toBe("accurate");
    expect(selected.balanced).toBeDefined();
  });
});
~~~

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- --run tests/search.test.ts`  
Expected: FAIL because candidate search modules are absent.

- [ ] **Step 3: Implement metrics and MDL/BIC score**

Use `mseEff = max(rmse², noise²)` and `score = N * log(mseEff + 1e-12) + K * log(N)` where `K = freeParams + 0.7 * operatorComplexity + constantComplexity`. Operator weights are x=0, add=1, mul=1, div=2, pow=1, abs=1, sqrt=2, sin/cos=2, exp/log/tanh=3, and each free parameter=1. Constant costs are integer=0.1, rational/special symbolic=0.35, and arbitrary float=1.

- [ ] **Step 4: Implement semantic signatures and CandidatePool**

Evaluate at 32 fixed u probes over [-1,1], reject signatures with more than 10% invalid values, standardize mean/std, quantize by rounding value*1000, and hash. Keep the lower-complexity or lower-error representative and cap storage at 300.

- [ ] **Step 5: Implement Pareto and named selections**

Pareto dimensions are raw-domain RMSE and expression complexity. Simple chooses minimum complexity under `2.5 * max(noise, minRmse)`; Balanced chooses minimum score; Accurate chooses minimum RMSE under the configured complexity cap. Resolve ties by score then structural hash.

- [ ] **Step 6: Verify and commit**

Run: `npm test -- --run tests/search.test.ts && npm run typecheck`  
Expected: PASS.

~~~bash
git add src/core/types.ts src/models/shared.ts src/search tests/fixtures/candidates.ts tests/search.test.ts
git commit -m "feat: add unified candidate ranking"
~~~

---

### Task 8: Implement Chebyshev polynomial producers

**Files:**
- Create: `src/models/polynomial.ts`
- Create: `tests/model-polynomial.test.ts`

**Interfaces:** `PolynomialProducer.produce(data, context)` emits degrees 0–8, fits in Chebyshev basis, and stores `meta.degree`.

- [ ] **Step 1: Write failing polynomial tests**

~~~ts
import { describe, expect, it } from "vitest";
import { makeCurveData } from "./fixtures/synthetic";
import { testContext } from "./fixtures/candidates";
import { PolynomialProducer } from "../src/models/polynomial";

describe("polynomial producer", () => {
  it("recovers a cubic with a degree-3 candidate", () => {
    const candidates = new PolynomialProducer().produce(makeCurveData(x => x ** 3 - x), testContext());
    const cubic = candidates.find(c => c.meta?.degree === 3);
    expect(cubic).toBeDefined();
    expect(cubic?.error).toBeLessThan(1e-3);
  });

  it("keeps a flat curve finite", () => {
    expect(new PolynomialProducer().produce(makeCurveData(() => 2), testContext())
      .every(c => Number.isFinite(c.error))).toBe(true);
  });
});
~~~

`testContext()` is exported by `tests/fixtures/candidates.ts` with a fixed deadline and deterministic clock.

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- --run tests/model-polynomial.test.ts`  
Expected: FAIL because the producer is absent.

- [ ] **Step 3: Implement Chebyshev recurrence and fitting**

Build T0=1, T1=u, and `Tn = 2uT(n-1)-T(n-2)` without a power Vandermonde. Fit with Huber IRLS over QR, convert Chebyshev coefficients to ordinary powers, remove coefficients below `1e-10 * maxCoefficient`, and materialize a normalized-coordinate AST.

- [ ] **Step 4: Verify and commit**

Run: `npm test -- --run tests/model-polynomial.test.ts && npm run typecheck`  
Expected: PASS.

~~~bash
git add src/models/polynomial.ts tests/model-polynomial.test.ts
git commit -m "feat: add Chebyshev polynomial models"
~~~

---

### Task 9: Implement FFT, sinusoid, and Fourier producers

**Files:**
- Create: `src/math/fft.ts`
- Create: `src/models/sinusoid.ts`
- Create: `src/models/fourier.ts`
- Create: `tests/model-periodic.test.ts`

**Interfaces:** `SinusoidProducer` emits offset-only and offset-plus-linear-trend variants. `FourierProducer` emits K=2…5 harmonic variants. Both refine one base angular frequency with Brent.

- [ ] **Step 1: Write failing periodic tests**

~~~ts
import { describe, expect, it } from "vitest";
import { makeCurveData } from "./fixtures/synthetic";
import { bestCandidate, testContext } from "./fixtures/candidates";
import { SinusoidProducer } from "../src/models/sinusoid";
import { FourierProducer } from "../src/models/fourier";

describe("periodic producers", () => {
  it("recovers 2 sin(pi x)", () => {
    const best = bestCandidate(new SinusoidProducer()
      .produce(makeCurveData(x => 2 * Math.sin(Math.PI * x)), testContext()));
    expect(best.error).toBeLessThan(0.03);
  });

  it("fits two harmonics", () => {
    const best = bestCandidate(new FourierProducer()
      .produce(makeCurveData(x => Math.sin(2 * x) + 0.3 * Math.cos(4 * x)), testContext()));
    expect(best.error).toBeLessThan(0.05);
  });
});
~~~

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- --run tests/model-periodic.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement radix-2 FFT and peak proposals**

Implement iterative radix-2 complex FFT for 256 samples, remove mean and optional linear trend before the transform, ignore the zero bin, and return the strongest distinct frequency peaks plus neighboring brackets.

- [ ] **Step 4: Implement variable projection**

For each proposed frequency, use Brent to minimize robust residual while QR solves sine, cosine, offset, and optional slope coefficients. Convert a*sin+b*cos to non-negative amplitude and normalized phase. Fourier solves all harmonic coefficients linearly for each K.

- [ ] **Step 5: Verify and commit**

Run: `npm test -- --run tests/model-periodic.test.ts && npm run typecheck`  
Expected: PASS.

~~~bash
git add src/math/fft.ts src/models/sinusoid.ts src/models/fourier.ts tests/model-periodic.test.ts
git commit -m "feat: add sinusoid and Fourier models"
~~~

---

### Task 10: Implement exponential and logarithmic producers

**Files:**
- Create: `src/models/exponential.ts`
- Create: `src/models/logarithm.ts`
- Create: `tests/model-exp-log.test.ts`

**Interfaces:** `ExponentialProducer` searches normalized b in [-10,10]. `LogarithmProducer` searches both `a log(u-b)+c` and `a log(b-u)+c` with shifts outside the complete domain.

- [ ] **Step 1: Write failing model and domain tests**

~~~ts
import { describe, expect, it } from "vitest";
import { makeCurveData } from "./fixtures/synthetic";
import { bestCandidate, testContext } from "./fixtures/candidates";
import { ExponentialProducer } from "../src/models/exponential";
import { LogarithmProducer } from "../src/models/logarithm";

describe("exp/log producers", () => {
  it("fits exp(0.7x)", () => {
    const best = bestCandidate(
      new ExponentialProducer().produce(makeCurveData(x => Math.exp(0.7 * x)), testContext()),
    );
    expect(best.error).toBeLessThan(0.05);
  });

  it("fits log(x+2) on a legal domain", () => {
    const data = makeCurveData(x => Math.log(x + 2), { domain: [-1.5, 2] });
    const best = bestCandidate(new LogarithmProducer().produce(data, testContext()));
    expect(best.error).toBeLessThan(0.08);
    expect(best.expr).toBeDefined();
  });
});
~~~

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- --run tests/model-exp-log.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement exponential variable projection**

Coarsely sample 81 b values, solve a/c by Huber QR, retain the best finite brackets, and Brent-refine b. Clamp only numerical evaluation; reject a candidate whose final AST would overflow on the plotted domain.

- [ ] **Step 4: Implement legal logarithm shifts**

Parameterize shifts as a positive distance beyond the left or right domain edge so every sample remains legal. Coarsely scan the log-distance, Brent-refine, and solve a/c linearly.

- [ ] **Step 5: Verify and commit**

Run: `npm test -- --run tests/model-exp-log.test.ts && npm run typecheck`  
Expected: PASS with no thrown domain errors.

~~~bash
git add src/models/exponential.ts src/models/logarithm.ts tests/model-exp-log.test.ts
git commit -m "feat: add exponential and logarithmic models"
~~~

---

### Task 11: Implement absolute/hinge and rational producers

**Files:**
- Create: `src/models/absolute.ts`
- Create: `src/models/rational.ts`
- Create: `tests/model-absolute-rational.test.ts`

**Interfaces:** `AbsoluteProducer` emits `a|u-b|+c` and `a|u-b|+cu+d`. `RationalProducer` emits Pm/Qn for m<=3 and n<=2 with denominator constant fixed to one.

- [ ] **Step 1: Write failing breakpoint and pole-safety tests**

~~~ts
import { describe, expect, it } from "vitest";
import { makeCurveData } from "./fixtures/synthetic";
import { bestCandidate, testContext } from "./fixtures/candidates";
import { AbsoluteProducer } from "../src/models/absolute";
import { RationalProducer } from "../src/models/rational";

describe("absolute and rational producers", () => {
  it("finds the breakpoint of abs(x-1)", () => {
    const best = bestCandidate(
      new AbsoluteProducer().produce(makeCurveData(x => Math.abs(x - 1)), testContext()),
    );
    expect(best.error).toBeLessThan(0.04);
  });

  it("fits 1/(x+2) without a pole in-domain", () => {
    const data = makeCurveData(x => 1 / (x + 2), { domain: [-1.5, 2] });
    const best = bestCandidate(new RationalProducer().produce(data, testContext()));
    expect(best.error).toBeLessThan(0.08);
    expect(Number(best.meta?.minAbsDenominator)).toBeGreaterThanOrEqual(1e-5);
  });
});
~~~

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- --run tests/model-absolute-rational.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement absolute and hinge variable projection**

Scan breakpoints at sample midpoints plus a coarse grid, solve remaining coefficients by Huber QR, and Brent-refine the best breakpoints. Preserve a sharp cusp in the AST.

- [ ] **Step 4: Implement rational initialization and refinement**

Solve the linearized equation `y(1+q1u+q2u²)=P(u)`, then LM-refine true quotient residuals. Evaluate Q on every data and plot point. When `min(abs(Q)) < 1e-5`, keep the candidate only if the observed samples nearest the inferred pole grow monotonically toward it on at least one side and exceed four times the interquartile y scale; otherwise reject it.

- [ ] **Step 5: Verify and commit**

Run: `npm test -- --run tests/model-absolute-rational.test.ts && npm run typecheck`  
Expected: PASS.

~~~bash
git add src/models/absolute.ts src/models/rational.ts tests/model-absolute-rational.test.ts
git commit -m "feat: add cusp and rational models"
~~~

---

### Task 12: Implement Gaussian producer

**Files:**
- Create: `src/models/gaussian.ts`
- Create: `tests/model-gaussian.test.ts`

**Interfaces:** Fits `a exp(-((u-b)/c)^2)+d` with c represented as exp(logWidth) to keep it positive.

- [ ] **Step 1: Write failing Gaussian test**

~~~ts
import { expect, it } from "vitest";
import { bestCandidate, testContext } from "./fixtures/candidates";
import { makeCurveData } from "./fixtures/synthetic";
import { GaussianProducer } from "../src/models/gaussian";

it("fits a shifted Gaussian bump", () => {
  const data = makeCurveData(x => 2 * Math.exp(-((x - 0.4) / 0.8) ** 2) + 0.2);
  const best = bestCandidate(new GaussianProducer().produce(data, testContext()));
  expect(best.error).toBeLessThan(0.06);
});
~~~

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- --run tests/model-gaussian.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement deterministic Gaussian starts**

Use peak/trough amplitude, baseline quantiles, peak location, and widths {0.2,0.5,1,2} in normalized coordinates to form 4–8 starts. LM-refine amplitude, center, logWidth, and offset; reject widths outside [0.02,20].

- [ ] **Step 4: Verify and commit**

Run: `npm test -- --run tests/model-gaussian.test.ts && npm run typecheck`  
Expected: PASS.

~~~bash
git add src/models/gaussian.ts tests/model-gaussian.test.ts
git commit -m "feat: add Gaussian model"
~~~

---

### Task 13: Implement tanh and logistic producers

**Files:**
- Create: `src/models/tanh.ts`
- Create: `src/models/logistic.ts`
- Create: `tests/model-sigmoid.test.ts`

**Interfaces:** Fits `a tanh(bu+c)+d` and `a/(1+exp(-b(u-c)))+d` with bounded deterministic LM starts.

- [ ] **Step 1: Write failing sigmoid tests**

~~~ts
import { expect, it } from "vitest";
import { bestCandidate, testContext } from "./fixtures/candidates";
import { makeCurveData } from "./fixtures/synthetic";
import { LogisticProducer } from "../src/models/logistic";
import { TanhProducer } from "../src/models/tanh";

it.each([
  ["tanh", new TanhProducer(), (x: number) => 1.5 * Math.tanh(2 * x - 0.3) + 0.2],
  ["logistic", new LogisticProducer(), (x: number) => 2 / (1 + Math.exp(-3 * (x - 0.4))) - 1],
])("fits %s", (_name, producer, fn) => {
  const best = bestCandidate(producer.produce(makeCurveData(fn), testContext()));
  expect(best.error).toBeLessThan(0.08);
});
~~~

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- --run tests/model-sigmoid.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement sign, center, and slope starts**

Infer increasing/decreasing sign from endpoint medians, center from the half-range crossing, amplitude/offset from 5th/95th percentiles, and slopes {0.5,1,2,4}. LM-refine within finite bounds and canonicalize signs.

- [ ] **Step 4: Verify and commit**

Run: `npm test -- --run tests/model-sigmoid.test.ts && npm run typecheck`  
Expected: PASS.

~~~bash
git add src/models/tanh.ts src/models/logistic.ts tests/model-sigmoid.test.ts
git commit -m "feat: add tanh and logistic models"
~~~

---

### Task 14: Implement damped sinusoid producer

**Files:**
- Create: `src/models/dampedSinusoid.ts`
- Create: `tests/model-damped.test.ts`

**Interfaces:** Fits `exp(au)[b sin(omega u)+c cos(omega u)]+d`; frequency starts come from FFT and a/b/c/d are refined by LM.

- [ ] **Step 1: Write failing damped-wave test**

~~~ts
import { expect, it } from "vitest";
import { bestCandidate, testContext } from "./fixtures/candidates";
import { makeCurveData } from "./fixtures/synthetic";
import { DampedSinusoidProducer } from "../src/models/dampedSinusoid";

it("fits an exponentially damped sinusoid", () => {
  const data = makeCurveData(x => Math.exp(-0.2 * x) * Math.sin(4 * x));
  const best = bestCandidate(new DampedSinusoidProducer().produce(data, testContext()));
  expect(best.error).toBeLessThan(0.1);
});
~~~

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- --run tests/model-damped.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement FFT-seeded bounded refinement**

Use the top three nonzero FFT peaks, damping starts {-1,-0.2,0,0.2,1}, linear sine/cosine/offset estimates, and LM refinement. Reject candidates that exceed the safe exp clamp on the full domain.

- [ ] **Step 4: Verify and commit**

Run: `npm test -- --run tests/model-damped.test.ts && npm run typecheck`  
Expected: PASS.

~~~bash
git add src/models/dampedSinusoid.ts tests/model-damped.test.ts
git commit -m "feat: add damped sinusoid model"
~~~

---

### Task 15: Add feature priors and universal fallback

**Files:**
- Create: `src/core/features.ts`
- Create: `src/models/fallback.ts`
- Create: `tests/features-fallback.test.ts`

**Interfaces:**

~~~ts
export interface CurveFeatures {
  extrema: number;
  zeroCrossings: number;
  monotonicity: number;
  evenSymmetry: number;
  oddSymmetry: number;
  periodicity: number;
  fftPeaks: Array<{ omega: number; strength: number }>;
  cuspScore: number;
  asymptoteLocations: number[];
  producerPriority: string[];
}
~~~

`FallbackProducer` emits Chebyshev degrees 4,6,8,10,12,16 and periodic Fourier approximations up to eight harmonics.

- [ ] **Step 1: Write failing prior and fallback tests**

~~~ts
import { expect, it } from "vitest";
import { testContext } from "./fixtures/candidates";
import { makeCurveData } from "./fixtures/synthetic";
import { analyzeFeatures } from "../src/core/features";
import { FallbackProducer } from "../src/models/fallback";

it("prioritizes a clear sinusoid without making a final decision", () => {
  const features = analyzeFeatures(makeCurveData(x => Math.sin(3 * x)));
  expect(features.producerPriority.indexOf("sinusoid"))
    .toBeLessThan(features.producerPriority.indexOf("rational"));
});

it("always returns a finite approximation for sin(x^2)", () => {
  const candidates = new FallbackProducer().produce(makeCurveData(x => Math.sin(x * x)), testContext());
  expect(candidates.length).toBeGreaterThan(0);
  expect(candidates.every(c => Number.isFinite(c.error))).toBe(true);
});
~~~

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- --run tests/features-fallback.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement feature measurements**

Use central differences on smooth v, robust thresholds tied to normalized noise, mirrored interpolation for symmetry, normalized autocorrelation plus FFT for periodicity, and derivative jumps for cusps. Return priorities and starts only.

- [ ] **Step 4: Implement universal fallback**

Reuse Chebyshev and Fourier fitting, label every fallback candidate with `modelFamily: "approximation"`, and guarantee at least one finite candidate for valid CurveData by falling back to the median constant if all matrix solves fail.

- [ ] **Step 5: Verify and commit**

Run: `npm test -- --run tests/features-fallback.test.ts && npm run typecheck`  
Expected: PASS.

~~~bash
git add src/core/features.ts src/models/fallback.ts tests/features-fallback.test.ts
git commit -m "feat: add feature priors and universal fallback"
~~~

---

### Task 16: Implement global constant beautification

**Files:**
- Create: `src/beautify/rational.ts`
- Create: `src/beautify/constants.ts`
- Create: `src/beautify/beautify.ts`
- Create: `tests/beautify.test.ts`

**Interfaces:** `prettyAlternatives(value)` emits bounded integer, rational, π/e multiple, and rational sqrt alternatives. `beautifyCandidate(candidate, data)` returns a rescored Candidate.

- [ ] **Step 1: Write failing pretty-sine test**

~~~ts
import { expect, it } from "vitest";
import { sineCandidateFixture } from "./fixtures/candidates";
import { makeCurveData } from "./fixtures/synthetic";
import { beautifyCandidate } from "../src/beautify/beautify";
import { toLatex } from "../src/expr/latex";
import { toPlain } from "../src/expr/plain";

it("prefers 2 sin(pi x) at drawing-noise accuracy", () => {
  const raw = sineCandidateFixture(1.9987, 3.1419, 0.0021, 0.00018);
  const pretty = beautifyCandidate(raw, makeCurveData(x => 2 * Math.sin(Math.PI * x), { noise: 0.01 }));
  expect(toPlain(pretty.expr)).toBe("2*sin(pi*x)");
  expect(toLatex(pretty.expr)).toContain("\\\\pi");
});
~~~

`sineCandidateFixture` is defined in `tests/fixtures/candidates.ts` using the production AST constructors.

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- --run tests/beautify.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement bounded alternatives**

Use continued fractions with denominator <=12 and numerator magnitude <=48; test integers -10…10; p/q multiples of π and e; and p/q*sqrt(n) for n=2…10. Rank by numerical distance plus constant-description cost and return the top four distinct alternatives beside the original.

- [ ] **Step 4: Implement width-32 combination search**

Replace one constant path per expansion, canonicalize, evaluate over raw-domain x, recompute RMSE and score, deduplicate by structural hash, and retain 32 states. Return the globally best score after all constant positions.

- [ ] **Step 5: Verify and commit**

Run: `npm test -- --run tests/beautify.test.ts && npm run typecheck`  
Expected: PASS with the exact concise sine expression.

~~~bash
git add src/beautify tests/beautify.test.ts
git commit -m "feat: beautify fitted constants globally"
~~~

---

### Task 17: Implement parameterized symbolic grammar and bounded search

**Files:**
- Create: `src/search/grammar.ts`
- Create: `src/search/fitStructure.ts`
- Create: `src/search/symbolic.ts`
- Create: `tests/symbolic.test.ts`

**Interfaces:**

~~~ts
export interface SymbolicShape {
  expr: Expr;
  complexity: number;
  freeParams: number;
  hash: string;
}
export function fitStructure(shape: SymbolicShape, data: CurveData, context: SolveContext): Candidate | null;
export function searchSymbolic(
  data: CurveData,
  context: SolveContext,
  onImprovement?: (candidate: Candidate, level: number) => void,
): Candidate[];
~~~

- [ ] **Step 1: Write failing grammar, fitting, and bound tests**

~~~ts
import { expect, it } from "vitest";
import { testContext } from "./fixtures/candidates";
import { makeCurveData } from "./fixtures/synthetic";
import { searchSymbolic } from "../src/search/symbolic";

it("fits the compact shape sin(x^2)", () => {
  const result = searchSymbolic(
    makeCurveData(x => Math.sin(x * x)),
    testContext({ maxComplexity: 8, timeBudgetMs: 500 }),
  );
  expect(result.some(c => c.error < 0.1 && c.complexity <= 8)).toBe(true);
});

it("never exceeds semantic or structural bounds", () => {
  const result = searchSymbolic(
    makeCurveData(x => x + 1),
    testContext({ maxComplexity: 12, maxCandidatesPerLevel: 300 }),
  );
  expect(result.length).toBeLessThanOrEqual(300);
  expect(new Set(result.map(c => c.signature)).size).toBe(result.length);
});
~~~

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- --run tests/symbolic.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement grammar and canonical generation**

Generate x; add/mul/div; powers {-3,-2,2,3,4}; and sin, cos, exp, log(abs()), abs, and sqrt(abs()). Reject abs(abs(x)), immediate inverse exp/log pairs, duplicate commutative orderings, invalid probe domains, complexity >12, and free parameters >8.

- [ ] **Step 4: Implement parameterized structure fitting**

For every shape g, fit outer `a*g+b` by Huber QR. For sin/cos input-affine shapes fit `A trig(omega*g+phi)+C` with deterministic LM starts. For binary sums fit `a*g1+b*g2+c` by QR. Materialize param nodes before scoring.

- [ ] **Step 5: Implement semantic hashing, beam pruning, and stopping**

At each complexity level canonicalize, compute the 32-probe affine-normalized signature, retain the better representative, sort by `log(error+1e-12)+0.02*complexity`, keep 300, and combine only the top 48. Check the monotonic deadline inside every expansion loop; stop at noise, budget, cap, or three stagnant levels.

- [ ] **Step 6: Verify and commit**

Run: `npm test -- --run tests/symbolic.test.ts && npm run typecheck`  
Expected: PASS with bounded candidate counts.

~~~bash
git add src/search/grammar.ts src/search/fitStructure.ts src/search/symbolic.ts tests/symbolic.test.ts
git commit -m "feat: add bounded parameterized symbolic search"
~~~

---

### Task 18: Integrate the function-mode solver and progressive stages

**Files:**
- Create: `src/models/modelBank.ts`
- Create: `src/core/solver.ts`
- Modify: `src/core/types.ts`
- Create: `tests/solver-function.test.ts`

**Interfaces:**

~~~ts
export type SolveProgress =
  | { stage: "preprocess" | "fast-models" | "symbolic"; candidate?: CandidateResult }
  | { stage: "finalize"; candidate: CandidateResult };

export interface SolveDiagnostics {
  runtimeMs: number;
  fastRuntimeMs: number;
  candidatesGenerated: number;
  candidatesFitted: number;
  maxComplexityReached: number;
}
export interface FunctionSolveResult {
  mode: "function";
  best: CandidateResult;
  simple: CandidateResult;
  balanced: CandidateResult;
  accurate: CandidateResult;
  pareto: CandidateResult[];
  domain: [number, number];
  noise: number;
  quality: "excellent" | "good" | "approximation" | "low";
  diagnostics: SolveDiagnostics;
}
export interface ParametricSolveResult {
  mode: "parametric";
  parametric: { x: CandidateResult; y: CandidateResult; t: number[] };
  domain: [number, number];
  noise: number;
  quality: "excellent" | "good" | "approximation" | "low";
  invalidReason: string;
  diagnostics: SolveDiagnostics;
}
export interface InvalidSolveResult {
  mode: "invalid";
  reason: string;
  diagnostics: SolveDiagnostics;
}
export type SolveResult = FunctionSolveResult | ParametricSolveResult;
export type SolveOutcome = SolveResult | InvalidSolveResult;
export function solveCurve(
  points: Point[],
  options?: SolverOptions,
  onProgress?: (progress: SolveProgress) => void,
): SolveOutcome;
~~~

- [ ] **Step 1: Write failing function-mode integration tests**

~~~ts
import { expect, it } from "vitest";
import { makeStroke } from "./fixtures/synthetic";
import { solveCurve } from "../src/core/solver";

it("returns Simple, Balanced, and Accurate for a sine stroke", () => {
  const progress: string[] = [];
  const result = solveCurve(makeStroke(x => 2 * Math.sin(Math.PI * x)), { timeBudgetMs: 700 },
    event => progress.push(event.stage));
  expect(result.mode).toBe("function");
  if (result.mode !== "function") throw new Error("Expected function result");
  expect(result.best.latex).toContain("\\\\sin");
  expect(result.simple).toBeDefined();
  expect(result.balanced).toBeDefined();
  expect(result.accurate).toBeDefined();
  expect(progress).toContain("fast-models");
});

it("solves a flat curve without NaN", () => {
  const result = solveCurve(makeStroke(() => 2), { timeBudgetMs: 200 });
  if (result.mode !== "function") throw new Error("Expected function result");
  expect(Number.isFinite(result.best.rmse)).toBe(true);
  expect(result.best.plot.y.every(Number.isFinite)).toBe(true);
});
~~~

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- --run tests/solver-function.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement model-bank and progressive fast stage**

Order producers from feature priors, but give every implemented family a coarse pass so no heuristic excludes a formula class; features only redistribute refinement and multi-start budget. Always run polynomial, sinusoid, and fallback even near a deadline. Emit the best fast candidate as soon as the first useful producer group completes, targeting a first progress post within 50 ms and requiring the complete fast bank median below 100 ms on the release benchmark. Track generated/fitted counts and fast runtime.

- [ ] **Step 4: Run symbolic search and finalize candidates**

Merge all finite normalized-coordinate candidates in CandidatePool and perform preliminary Pareto pruning. Restore the frontier plus top-scoring candidates to world-coordinate ASTs first, simplify them, recompute raw-domain metrics, then beautify constants, rescore, and rebuild the final Pareto frontier. Generate 256-point world plots and serialize only materialized, parameter-free ASTs.

- [ ] **Step 5: Implement quality and budgets**

Use R=RMSE/(noise+epsilon): excellent <=1.5, good <=3, approximation <=6, low above 6; downgrade one label when the top two structurally distinct scores are nearly tied. Default the deadline from mobile/desktop options without artificial waiting.

- [ ] **Step 6: Verify and commit**

Run: `npm test -- --run tests/solver-function.test.ts && npm run typecheck`  
Expected: PASS.

~~~bash
git add src/models/modelBank.ts src/core/solver.ts src/core/types.ts tests/solver-function.test.ts
git commit -m "feat: integrate progressive function solver"
~~~

---

### Task 19: Add parametric fallback without recursive validation

**Files:**
- Modify: `src/core/solver.ts`
- Modify: `src/core/types.ts`
- Create: `tests/solver-parametric.test.ts`

**Interfaces:** Add private `solveSampledSeries(independent, dependent, options, context)` that bypasses stroke validation. `solveParametric(samples, options, onProgress)` calls it once for x(t) and once for y(t).

- [ ] **Step 1: Write failing circle and vertical tests**

~~~ts
import { expect, it } from "vitest";
import { makeCircleStroke, makeVerticalStroke } from "./fixtures/synthetic";
import { solveCurve } from "../src/core/solver";

it("returns paired formulas for a circle", () => {
  const result = solveCurve(makeCircleStroke(3), { timeBudgetMs: 800 });
  expect(result.mode).toBe("parametric");
  if (result.mode !== "parametric") throw new Error("Expected parametric result");
  expect(result.parametric?.x.latex).toMatch(/cos|sin/);
  expect(result.parametric?.y.latex).toMatch(/sin|cos/);
});

it("keeps a vertical line parametric", () => {
  const result = solveCurve(makeVerticalStroke(), { timeBudgetMs: 300 });
  if (result.mode !== "parametric") throw new Error("Expected parametric result");
  expect(result.mode).toBe("parametric");
  expect(result.parametric?.x.rmse).toBeLessThan(0.05);
});
~~~

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- --run tests/solver-parametric.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement paired series solving**

Use arc-length t from Task 3, normalize each dependent series independently, run the same model bank with symbolic search sharing half the remaining budget each, and return paired plots sampled on identical t values. Keep `invalidReason = "This curve is not single-valued as y=f(x)."`.

- [ ] **Step 4: Verify and commit**

Run: `npm test -- --run tests/solver-parametric.test.ts && npm run typecheck`  
Expected: PASS without re-entering function validation.

~~~bash
git add src/core/solver.ts src/core/types.ts tests/solver-parametric.test.ts
git commit -m "feat: add parametric curve fallback"
~~~

---

### Task 20: Add Worker protocol, replacement cancellation, and stale-response guards

**Files:**
- Create: `src/worker/solver.worker.ts`
- Create: `src/worker/client.ts`
- Modify: `src/core/types.ts`
- Create: `tests/worker-client.test.ts`

**Interfaces:**

~~~ts
export type WorkerRequest = { id: number; points: Point[]; view: Viewport; options: SolverOptions };
export type WorkerResponse =
  | { type: "progress"; id: number; stage: string; candidate?: CandidateResult }
  | { type: "done"; id: number; result: SolveResult }
  | { type: "invalid"; id: number; reason: string };

export interface WorkerLike {
  postMessage(message: WorkerRequest): void;
  terminate(): void;
  addEventListener(type: "message", listener: (event: MessageEvent<WorkerResponse>) => void): void;
}
export type WorkerFactory = () => WorkerLike;
~~~

`SolverWorkerClient` accepts a WorkerFactory, creates one Worker for each active request, terminates the previous instance on submit/cancel, and still filters every response by request ID.

- [ ] **Step 1: Write failing replacement and stale-message tests**

~~~ts
import { expect, it } from "vitest";
import type { SolveResult, WorkerResponse } from "../src/core/types";
import { createViewport } from "../src/ui/viewport";
import { SolverWorkerClient } from "../src/worker/client";
import { solveResultFixture } from "./fixtures/candidates";
import { makeStroke } from "./fixtures/synthetic";

class FakeWorker {
  terminated = false;
  private listener: ((event: MessageEvent<WorkerResponse>) => void) | undefined;
  postMessage(_message: unknown): void {}
  terminate(): void { this.terminated = true; }
  addEventListener(_type: string, listener: (event: MessageEvent<WorkerResponse>) => void): void {
    this.listener = listener;
  }
  emit(data: WorkerResponse): void {
    this.listener?.({ data } as MessageEvent<WorkerResponse>);
  }
}

const doneResponse = (id: number, plain: string): WorkerResponse => ({
  type: "done",
  id,
  result: solveResultFixture(plain),
});

it("terminates the old worker and ignores its late result", () => {
  const workers: FakeWorker[] = [];
  const client = new SolverWorkerClient(() => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker;
  });
  const received: string[] = [];

  const collect = (result: SolveResult) => {
    if (result.mode === "function") received.push(result.best.plain);
  };
  client.submit(makeStroke(x => x), createViewport(), {}, collect);
  client.submit(makeStroke(x => x * x), createViewport(), {}, collect);

  const first = workers[0];
  const second = workers[1];
  if (!first || !second) throw new Error("Expected two workers");
  expect(first.terminated).toBe(true);
  first.emit(doneResponse(1, "old"));
  second.emit(doneResponse(2, "new"));
  expect(received).toEqual(["new"]);
});
~~~

The test-local FakeWorker implements exactly the WorkerFactory surface used by the client.

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- --run tests/worker-client.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement Worker serialization and progressive posts**

The Worker validates request shape, calls solveCurve with an onProgress callback, posts every improvement under the request ID, posts done once, and catches unexpected exceptions into an invalid response. Candidate/result values are structured-clone-safe plain objects.

- [ ] **Step 4: Implement deterministic replacement**

On submit: increment ID, terminate current Worker, create a new Worker, attach its listener, then post the request. On cancel: increment ID and terminate. A listener compares both Worker identity and ID before invoking callbacks.

- [ ] **Step 5: Verify the Worker bundle and commit**

Run: `npm test -- --run tests/worker-client.test.ts && npm run build`  
Expected: PASS and `dist/assets` contains a separate Worker chunk.

~~~bash
git add src/worker src/core/types.ts tests/worker-client.test.ts
git commit -m "feat: run solves in replaceable Web Workers"
~~~

---

### Task 21: Build Canvas drawing, plotting, pan, zoom, reset, clear, and undo

**Files:**
- Create: `src/ui/canvas.ts`
- Create: `src/ui/plot.ts`
- Create: `src/ui/controls.ts`
- Modify: `src/main.ts`
- Modify: `src/styles.css`
- Create: `tests/canvas-ui.test.ts`

**Interfaces:** `new CurveCanvas(root, { onStrokeComplete })` owns one canvas and exposes `setResultPlot`, `clearResult`, `undoStroke`, `clearStrokes`, `resetView`, and `getLatestStroke`. Task 21 changes `mountApp` to return an `AppController { canvas, latestStroke, destroy() }` and accepts an injected Worker client for tests.

- [ ] **Step 1: Write failing DOM structure and stroke tests**

~~~ts
import { expect, it, vi } from "vitest";
import { CurveCanvas } from "../src/ui/canvas";

function pointer(canvas: HTMLCanvasElement, type: string, x: number, y: number, buttons: number): void {
  const event = new MouseEvent(type, { clientX: x, clientY: y, buttons, bubbles: true });
  Object.defineProperty(event, "pointerId", { value: 1 });
  canvas.dispatchEvent(event);
}

it("mounts a mathematical canvas and emits world-coordinate strokes", () => {
  const root = document.createElement("div");
  const strokes: Array<Array<{ x: number; y: number; t: number }>> = [];
  const surface = new CurveCanvas(root, { onStrokeComplete: stroke => strokes.push(stroke) });
  const canvas = root.querySelector("canvas") as HTMLCanvasElement;
  canvas.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 400,
    bottom: 300, width: 400, height: 300, toJSON: () => ({}) });
  canvas.setPointerCapture = vi.fn();
  canvas.releasePointerCapture = vi.fn();
  pointer(canvas, "pointerdown", 100, 100, 1);
  pointer(canvas, "pointermove", 200, 150, 1);
  pointer(canvas, "pointerup", 300, 220, 0);
  expect(strokes).toHaveLength(1);
  expect(surface.getLatestStroke().every(point => Number.isFinite(point.x) && Number.isFinite(point.y)))
    .toBe(true);
});
~~~

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- --run tests/canvas-ui.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement high-DPI layers and input modes**

Resize the backing store by devicePixelRatio while keeping CSS dimensions. Draw grid, axes/ticks, raw stroke, and fitted plot in deterministic order. Primary pointer/touch draws; wheel zooms at cursor; Space+primary drag, middle drag, or Pan toolbar mode pans. Capture and release pointer IDs correctly. Submit solves with `mobile: matchMedia("(pointer: coarse)").matches` so the Worker receives the intended default budget.

- [ ] **Step 4: Implement history and controls**

Keep a small stroke history, solve only the latest main stroke, and make Undo remove one stroke. Clear removes strokes/results, Reset restores [-5,5] on both axes, and every viewport change redraws stored world-coordinate strokes.

- [ ] **Step 5: Verify and commit**

Run: `npm test -- --run tests/canvas-ui.test.ts && npm run typecheck && npm run build`  
Expected: PASS.

~~~bash
git add src/ui src/main.ts src/styles.css tests/canvas-ui.test.ts
git commit -m "feat: add mathematical drawing canvas"
~~~

---

### Task 22: Build progressive result UI, KaTeX, candidate tabs, and copy actions

**Files:**
- Create: `src/ui/results.ts`
- Modify: `src/ui/controls.ts`
- Modify: `src/main.ts`
- Modify: `src/styles.css`
- Create: `tests/results-ui.test.ts`

**Interfaces:** `new ResultPanel(root, { onCandidateSelected })` plus `setProgress`, `setResult`, `setInvalid`, and `clear`. Candidate tabs map exactly to result.simple, result.balanced, and result.accurate.

- [ ] **Step 1: Write failing result-panel tests**

~~~ts
import { expect, it, vi } from "vitest";
import { solveResultFixture } from "./fixtures/candidates";
import { ResultPanel } from "../src/ui/results";

it("renders three candidate modes and copy controls", () => {
  const root = document.createElement("div");
  const panel = new ResultPanel(root, { onCandidateSelected: vi.fn() });
  panel.setResult(solveResultFixture("2*sin(pi*x)"));
  expect(root.textContent).toContain("Simple");
  expect(root.textContent).toContain("Balanced");
  expect(root.textContent).toContain("Accurate");
  expect(root.textContent).toContain("Copy LaTeX");
  expect(root.textContent).toContain("Copy expression");
});
~~~

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- --run tests/results-ui.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement progressive and final states**

Render the latest progressive candidate without changing the selected tab unexpectedly. Final result defaults to Balanced. Switching tabs updates formula, fitted plot, RMSE, complexity, and model family. Map quality enums to Excellent match, Good match, Approximation, and Low confidence. Expose the selected plain formula in a visually hidden `data-testid="plain-expression"` element for accessibility and browser verification.

- [ ] **Step 4: Implement safe KaTeX and clipboard actions**

Call `katex.render(latex, element, { throwOnError: false, strict: "warn" })` with generated AST LaTeX only. Copy exact CandidateResult latex/plain fields, catch clipboard rejection, and announce success/failure through an aria-live status.

- [ ] **Step 5: Implement invalid and parametric states**

Keep the stroke visible, display “This curve is not single-valued as y=f(x).”, and render x(t) and y(t) formulas plus their paired plot when present. Add hover/focus diagnostics for RMSE, complexity, and family.

- [ ] **Step 6: Verify and commit**

Run: `npm test -- --run tests/results-ui.test.ts && npm run typecheck && npm run build`  
Expected: PASS.

~~~bash
git add src/ui/results.ts src/ui/controls.ts src/main.ts src/styles.css tests/results-ui.test.ts
git commit -m "feat: add progressive formula results"
~~~

---

### Task 23: Add complete synthetic acceptance coverage

**Files:**
- Modify: `tests/fixtures/synthetic.ts`
- Create: `tests/acceptance.test.ts`
- Create: `tests/numerical-safety.test.ts`

**Interfaces:** Uses public `solveCurve` only. Every random fixture uses an explicit seed. `tests/fixtures/synthetic.ts` exports `expressibleCases: Array<{ name: string; fn: (x: number) => number; domain: [number, number]; sigma: number }>`; every acceptance-case sigma is at least 0.02 so the 1.5-sigma criterion represents ordinary drawing noise.

- [ ] **Step 1: Add all requested truth functions and drawing distortions**

Fixtures cover 2x+1, x², x³-x, 2sin(πx), x+0.5sin(3x), exp(0.7x), log(x+2), abs(x-1), 1/(x+2), exp(-x²), tanh, logistic, exp(-0.2x)sin(4x), sin(x²), seeded Chebyshev, and seeded Fourier curves. Distortions cover Gaussian noise, low-frequency wobble, non-uniform sampling, dropped samples, isolated outliers, and x jitter.

- [ ] **Step 2: Write acceptance assertions**

~~~ts
import { expect, it } from "vitest";
import { expressibleCases, makeNoisyStroke } from "./fixtures/synthetic";
import { solveCurve } from "../src/core/solver";

it.each(expressibleCases)("$name reaches the drawing-noise target", ({ fn, domain, sigma }) => {
  const result = solveCurve(makeNoisyStroke(fn, { domain, noise: sigma, seed: 7 }), {
    timeBudgetMs: 1500,
  });
  if (result.mode !== "function") throw new Error("Expected function result");
  expect(result.best.rmse).toBeLessThanOrEqual(1.5 * sigma);
  expect(result.best.latex).not.toBe("");
});

it("ranks a concise sine above a marginally better high polynomial", () => {
  const result = solveCurve(makeNoisyStroke(x => 2 * Math.sin(Math.PI * x), {
    noise: 0.02,
    seed: 11,
  }), { timeBudgetMs: 1500 });
  if (result.mode !== "function") throw new Error("Expected function result");
  expect(result.balanced.complexity).toBeLessThan(12);
  expect(result.balanced.latex).toContain("\\\\sin");
});
~~~

- [ ] **Step 3: Add numerical-safety assertions**

Evaluate every AST operation on legal boundaries and illegal inputs; solve curves with duplicated points, huge y, tiny domains, and outliers; assert controlled invalid results or finite CandidateResults and no throws.

- [ ] **Step 4: Run and tune algorithms, not assertions**

Run: `npm test -- --run tests/acceptance.test.ts tests/numerical-safety.test.ts`  
Expected: PASS. If a model misses its documented threshold, adjust initialization/search/scoring and retain the stated assertion.

- [ ] **Step 5: Commit**

~~~bash
git add tests/fixtures/synthetic.ts tests/acceptance.test.ts tests/numerical-safety.test.ts src
git commit -m "test: add synthetic solver acceptance coverage"
~~~

---

### Task 24: Add performance, browser, offline, documentation, and CI verification

**Files:**
- Create: `tests/performance.test.ts`
- Create: `playwright.config.ts`
- Create: `e2e/app.spec.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `README.md`
- Create: `.github/workflows/ci.yml`

**Interfaces:** Browser tests use the production Vite preview server and Chromium. Performance tests call the public fast-bank and full-solver entry points on 256 samples.

- [ ] **Step 1: Add deterministic performance checks**

Run the fast bank five times after one warm-up and record the median. Assert candidate counts never exceed configured caps. Mark the 100 ms fast-bank and 1500 ms full-solve values as release targets; CI fails at 250 ms and 3000 ms respectively to accommodate shared-runner variance, while printing both measured medians.

- [ ] **Step 2: Add browser interaction and offline tests**

~~~ts
import { expect, test, type Locator, type Page } from "@playwright/test";

const curvePoints = (fn: (x: number) => number) =>
  Array.from({ length: 81 }, (_, i) => {
    const x = i / 80;
    return { x, y: 0.5 - 0.28 * fn((x - 0.5) * 2) };
  });

const circlePoints = Array.from({ length: 97 }, (_, i) => {
  const angle = 2 * Math.PI * i / 96;
  return { x: 0.5 + 0.28 * Math.cos(angle), y: 0.5 - 0.28 * Math.sin(angle) };
});

async function drawCurve(page: Page, canvas: Locator, points: Array<{ x: number; y: number }>) {
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Canvas has no bounding box");
  const first = points[0];
  if (!first) throw new Error("Curve has no points");
  await page.mouse.move(box.x + first.x * box.width, box.y + first.y * box.height);
  await page.mouse.down();
  for (const point of points.slice(1)) {
    await page.mouse.move(box.x + point.x * box.width, box.y + point.y * box.height);
  }
  await page.mouse.up();
}

test("draw, fit, switch candidates, copy, and continue offline", async ({ page, context }) => {
  await page.goto("/");
  const canvas = page.locator("canvas");
  await drawCurve(page, canvas, curvePoints(x => Math.sin(Math.PI * x)));
  await expect(page.getByText("Balanced")).toBeVisible();
  await expect(page.locator("[data-testid=formula]")).not.toBeEmpty();
  await page.getByRole("button", { name: "Accurate" }).click();
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copy expression" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).not.toBe("");
  await context.setOffline(true);
  await page.getByRole("button", { name: "Clear" }).click();
  await drawCurve(page, canvas, curvePoints(x => x * x));
  await expect(page.locator("[data-testid=formula]")).not.toBeEmpty();
});

test("shows a parametric result for a circle", async ({ page }) => {
  await page.goto("/");
  await drawCurve(page, page.locator("canvas"), circlePoints);
  await expect(page.getByText("This curve is not single-valued as y=f(x).")).toBeVisible();
  await expect(page.getByText("x(t)", { exact: false })).toBeVisible();
  await expect(page.getByText("y(t)", { exact: false })).toBeVisible();
});

test("a second stroke replaces an in-flight solve", async ({ page }) => {
  await page.goto("/");
  const canvas = page.locator("canvas");
  await drawCurve(page, canvas, curvePoints(x => Math.sin(12 * x)));
  await drawCurve(page, canvas, curvePoints(() => 0.25));
  await expect(page.locator("[data-testid=plain-expression]")).not.toContainText("sin");
});
~~~

- [ ] **Step 3: Document installation and architecture**

README includes project purpose, screenshots section, `npm install`, `npm run dev`, test/build commands, supported models, offline semantics, Worker boundary, solver API, and known limits for discontinuities and extremely short strokes.

- [ ] **Step 4: Add CI**

CI runs:

~~~bash
npm ci
npm run typecheck
npm test -- --run
npm run build
npx playwright install --with-deps chromium
npm run test:e2e
~~~

- [ ] **Step 5: Verify and commit**

Run the same five commands locally. Expected: unit, acceptance, safety, performance, build, and Chromium tests pass.

~~~bash
git add tests/performance.test.ts playwright.config.ts e2e package.json package-lock.json README.md .github/workflows/ci.yml
git commit -m "test: add browser performance and offline verification"
~~~

---

### Task 25: Final branch review and evidence-based handoff

**Files:**
- Modify only files implicated by review findings.
- Test the complete repository.

**Interfaces:** Produces a verified implementation branch and final evidence report.

- [ ] **Step 1: Run all automated gates**

~~~bash
npm run typecheck
npm test -- --run
npm run build
npm run test:e2e
~~~

Expected: every command exits zero.

- [ ] **Step 2: Inspect the application manually**

Draw a line, parabola, 2sin(πx)-like stroke, V shape, unfamiliar smooth curve, vertical line, and circle. Verify progressive display, plot alignment during pan/zoom, Simple/Balanced/Accurate behavior, copy actions, parametric formulas, rapid resubmission, and continued solving after network disable.

- [ ] **Step 3: Review safety and boundedness**

Use `rg` to confirm no normal-equation inverse, no unbounded search arrays, no DOM imports below `src/ui`/`src/main.ts`, no main-thread solver import, and no evaluator throw path for ordinary invalid domains. Inspect Chromium memory when available and confirm typical solve memory remains below 100 MB.

- [ ] **Step 4: Apply and verify review fixes**

For every finding, add or strengthen the owning regression test first, apply the smallest fix, then rerun all four automated gates.

- [ ] **Step 5: Commit review fixes when present and report**

~~~bash
git add .
git commit -m "fix: address final UnDraw review findings"
~~~

Run the commit only when Step 4 changed files; otherwise retain the already verified HEAD. Report branch, final commit SHA, exact commands, test count, measured fast/full median runtimes, browser result, and known approximation limits. Make no completion claim without fresh passing output.

## Plan self-review

- Coverage: all design sections map to Tasks 1–25, including the previously omitted tanh family, explicit parameterized symbolic fitting, parametric fallback, progressive Worker messages, offline browser behavior, and performance limits.
- Dependency order: Tasks 1–3 define geometry/data before numerical code; Tasks 4–6 define math/AST before Candidate; Task 7 defines the shared producer contract before any producer; later tasks import only already-created interfaces.
- Type consistency: Expr lives only in `src/expr/ast.ts`; Candidate and public results live in `src/core/types.ts` and import Expr as a type; every producer implements CandidateProducer; worker messages carry serialized CandidateResult/SolveResult values.
- Test consistency: all named fixture helpers are created in Task 3 or Task 7 before use. Model metadata uses Candidate.meta. Parametric solving calls solveSampledSeries and cannot recurse into stroke validation.
- Review-focus coverage: multi-valued input is pinned in Tasks 3/19; zero variance in Tasks 3/18; illegal numerical domains in Tasks 6/10/11/23; Worker replacement in Task 20; sparse/jittery/dropped input in Tasks 3/23.
- Boundedness: symbolic pool, combination beam, parameters, iterations, starts, time, and beautification beam all have explicit caps.
- Red-flag scan: the plan contains no deferred implementation markers and no unnamed production interfaces.
