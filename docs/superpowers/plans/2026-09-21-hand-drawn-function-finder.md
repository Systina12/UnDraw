# Hand-drawn Function Finder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first complete offline Hand-drawn Function Finder in Systina12/UnDraw, from Canvas pointer input through Worker-based fitting, symbolic ranking, formula rendering, and copy actions.

**Architecture:** Use a Vite + TypeScript DOM application with a dependency-free mathematical core and a dedicated module Web Worker. The main thread owns viewport/input/rendering; the core owns preprocessing, ASTs, numerical fitting, candidate ranking, beautification, and fallback approximations; the Worker streams serialized candidates back to the UI.

**Tech Stack:** Vite, TypeScript, Canvas 2D, Web Worker, KaTeX, Vitest, jsdom, typed arrays, GitHub Actions-compatible npm scripts.

**Spec:** `docs/superpowers/specs/2026-09-21-hand-drawn-function-finder-design.md`

## Global Constraints

- The initial viewport is `[-5, 5] × [-5, 5]`.
- A stroke sample is `Point { x: number; y: number; t: number }` and is stored in world coordinates.
- Function validation uses 128 x-buckets and switches to parametric mode when more than roughly 5% of valid buckets are materially multi-valued.
- Valid function data is resampled to 256 uniformly spaced x-values.
- Smoothing uses median radius 2 followed by degree-3 Savitzky–Golay filtering with a window of 9 or 11.
- Noise uses `sigmaDraw = 1.4826 * MAD(residual)`.
- Fitting runs in normalized coordinates and restores the original coordinate transform before display.
- Least squares uses Householder QR; the implementation must not form `(AᵀA)⁻¹`.
- Fast model fitting must include polynomial, sinusoid, Fourier, exponential, logarithm, absolute/hinge, rational, Gaussian, logistic, and damped sinusoid producers.
- Huber IRLS uses `delta = max(1.5 * sigmaDraw, 0.01)`.
- Symbolic search has maximum structural complexity 12, semantic deduplication, a 300-candidate level cap, and a 40–60 candidate combination beam.
- Constant beautification uses bounded integer, rational, π/e multiple, and square-root candidate sets with beam width 32.
- Simple, Balanced, and Accurate are selected from the Pareto frontier using the definitions in the design spec.
- Invalid expression evaluation must reject candidates safely and must never terminate the Worker.
- The first release performs all expensive solving in a Web Worker and remains usable offline.
- Every implementation increment ends with focused tests and a runnable page.

## Review Focus

These are the highest-risk input classes that the main feature tests must pin down:

1. A circle, loop, or vertical stroke must not be silently sorted into a false single-valued function; test the invalid message and parametric fallback.
2. A flat curve with zero variance and zero measured noise must still return a finite constant candidate and quality label.
3. Logarithm, rational, square-root, and exponential candidates must reject illegal domains, near-zero denominators, and overflow without crashing the solve.
4. A rapid second stroke must invalidate all old Worker responses, including a late progressive candidate.
5. A short, sparse, jittery stroke must return a controlled invalid result rather than indexing outside arrays or producing NaN UI state.

---

## File Map

The implementation creates the following focused units:

- `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`: build, test, and browser entry configuration.
- `src/core/types.ts`: public solver, data, viewport, candidate, and Worker protocol types.
- `src/core/preprocess.ts`, `src/core/resample.ts`, `src/core/smooth.ts`, `src/core/noise.ts`, `src/core/features.ts`: stroke validation, resampling, smoothing, noise, and feature priors.
- `src/math/vector.ts`, `src/math/matrix.ts`, `src/math/qr.ts`, `src/math/leastSquares.ts`, `src/math/brent.ts`, `src/math/lm.ts`, `src/math/robust.ts`, `src/math/fft.ts`: dependency-free numerical primitives.
- `src/expr/ast.ts`, `src/expr/evaluate.ts`, `src/expr/canonical.ts`, `src/expr/simplify.ts`, `src/expr/latex.ts`, `src/expr/plain.ts`, `src/expr/serialize.ts`: expression representation and rendering.
- `src/search/candidatePool.ts`, `src/search/scoring.ts`, `src/search/pareto.ts`, `src/search/semanticHash.ts`, `src/search/grammar.ts`, `src/search/symbolic.ts`: candidate lifecycle, ranking, deduplication, and symbolic search.
- `src/beautify/rational.ts`, `src/beautify/constants.ts`, `src/beautify/beautify.ts`: constant approximation and formula beautification.
- `src/models/*.ts`: one producer per fitted model family plus model-bank orchestration.
- `src/core/solver.ts`: preprocessing, producer orchestration, progressive callbacks, and final SolveResult.
- `src/worker/solver.worker.ts`: Worker boundary and request cancellation.
- `src/ui/viewport.ts`, `src/ui/canvas.ts`, `src/ui/plot.ts`, `src/ui/controls.ts`, `src/main.ts`, `src/styles.css`: browser interaction and presentation.
- `tests/**/*.test.ts`, `tests/fixtures/synthetic.ts`, `tests/fixtures/curves.ts`: deterministic unit, integration, and synthetic data tests.

---

### Task 1: Bootstrap the Vite project and test harness

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/main.ts`
- Create: `src/styles.css`
- Create: `tests/smoke.test.ts`
- Create: `.gitignore`

**Interfaces:**
- Produces npm scripts `dev`, `build`, `typecheck`, `test`, and `test:watch`.
- Produces a browser entry that renders a temporary app root and a test environment that can import TypeScript modules.
- Uses `katex` at runtime and `vitest` plus `jsdom` for tests.

- [ ] **Step 1: Write the failing smoke test**

~~~ts
import { describe, expect, it } from "vitest";

describe("project bootstrap", () => {
  it("exposes the application entry contract", async () => {
    const module = await import("../src/main");
    expect(typeof module.mountApp).toBe("function");
  });
});
~~~

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --run tests/smoke.test.ts`  
Expected: FAIL because the Vite project and `src/main.ts` do not exist.

- [ ] **Step 3: Add the minimal project configuration and entry**

Create `src/main.ts` with an exported `mountApp(root = document.querySelector("#app"))` function that inserts a temporary heading and returns the root element. Configure Vitest with `environment: "jsdom"` and Vite with a root-relative Worker-compatible TypeScript build.

- [ ] **Step 4: Install dependencies and run verification**

Run:

~~~bash
npm install
npm test -- --run tests/smoke.test.ts
npm run typecheck
npm run build
~~~

Expected: the smoke test, typecheck, and production build pass.

- [ ] **Step 5: Commit**

~~~bash
git add package.json tsconfig.json tsconfig.node.json vite.config.ts index.html src tests .gitignore
git commit -m "chore: bootstrap hand-drawn function finder"
~~~

---

### Task 2: Add shared types and mathematical viewport primitives

**Files:**
- Create: `src/core/types.ts`
- Create: `src/ui/viewport.ts`
- Create: `tests/viewport.test.ts`

**Interfaces:**
- Consumes: no product modules; uses DOM-independent numeric types.
- Produces: `Point`, `Viewport`, `SolverOptions`, `Expr` forward type, `Candidate`, `CandidateResult`, `SolveResult`, and `WorkerRequest/WorkerResponse`.
- Produces `createViewport`, `screenToWorld`, `worldToScreen`, `panViewport`, `zoomViewportAt`, and `resetViewport`.

- [ ] **Step 1: Write failing transform tests**

~~~ts
import { describe, expect, it } from "vitest";
import {
  createViewport,
  screenToWorld,
  worldToScreen,
  zoomViewportAt,
} from "../src/ui/viewport";

describe("viewport", () => {
  it("round-trips the center and corners", () => {
    const view = createViewport();
    const size = { width: 1000, height: 800 };
    const world = screenToWorld({ x: 500, y: 400 }, size, view);
    expect(world.x).toBeCloseTo(0);
    expect(world.y).toBeCloseTo(0);
    expect(worldToScreen(world, size, view)).toEqual({ x: 500, y: 400 });
  });

  it("zooms around the pointer anchor", () => {
    const view = createViewport();
    const before = screenToWorld({ x: 240, y: 180 }, { width: 800, height: 600 }, view);
    const after = zoomViewportAt(view, { x: 240, y: 180 }, { width: 800, height: 600 }, 2);
    expect(screenToWorld({ x: 240, y: 180 }, { width: 800, height: 600 }, after))
      .toEqual(expect.objectContaining({ x: expect.closeTo(before.x), y: expect.closeTo(before.y) }));
  });
});
~~~

- [ ] **Step 2: Run the tests to verify failure**

Run: `npm test -- --run tests/viewport.test.ts`  
Expected: FAIL because the viewport module and shared types are absent.

- [ ] **Step 3: Implement the types and transforms**

Use:

~~~ts
export interface Point { x: number; y: number; t: number; }
export interface Viewport { xmin: number; xmax: number; ymin: number; ymax: number; }
export const createViewport = (): Viewport => ({ xmin: -5, xmax: 5, ymin: -5, ymax: 5 });
~~~

Implement the y-axis inversion exactly as `y = ymax - py / height * (ymax - ymin)`; keep zoom anchored at the world point below the pointer.

- [ ] **Step 4: Run the tests and typecheck**

Run: `npm test -- --run tests/viewport.test.ts && npm run typecheck`  
Expected: PASS.

- [ ] **Step 5: Commit**

~~~bash
git add src/core/types.ts src/ui/viewport.ts tests/viewport.test.ts
git commit -m "feat: add shared solver types and viewport math"
~~~

---

### Task 3: Implement stroke preprocessing and deterministic synthetic fixtures

**Files:**
- Create: `src/core/resample.ts`
- Create: `src/core/smooth.ts`
- Create: `src/core/noise.ts`
- Create: `src/core/preprocess.ts`
- Create: `tests/fixtures/synthetic.ts`
- Create: `tests/preprocess.test.ts`

**Interfaces:**
- Consumes: `Point[]`, `Viewport`, and options from `src/core/types.ts`.
- Produces: `validateFunctionStroke`, `resampleFunction`, `medianFilter`, `savitzkyGolay`, `estimateNoise`, `normalizeCurve`, and `prepareCurveData`.
- `CurveData` contains raw samples, smoothed samples, normalized arrays, domain, normalization transform, and noise.
- `tests/fixtures/synthetic.ts` exports `makeStroke(fn, options)`, `makeCurveData(fn, options)`, `makeNoisyStroke(fn, options)`, `makeCircleStroke(options)`, `rawSineCandidate(amplitude, omega, phase)`, and `makeMinimalSolveResult(plain)`; each fixture uses a seeded pseudo-random generator so tests are reproducible.

- [ ] **Step 1: Write failing preprocessing tests**

~~~ts
import { describe, expect, it } from "vitest";
import { makeStroke } from "./fixtures/synthetic";
import { prepareCurveData } from "../src/core/preprocess";

describe("preprocess", () => {
  it("resamples a noisy single-valued parabola", () => {
    const result = prepareCurveData(makeStroke(x => x * x, { noise: 0.01 }), {
      bucketCount: 128,
      sampleCount: 256,
    });
    expect(result.mode).toBe("function");
    expect(result.data?.x.length).toBe(256);
    expect(result.data?.noise).toBeGreaterThan(0);
    expect(result.data?.y.every(Number.isFinite)).toBe(true);
  });

  it("does not sort a circle into a false function", () => {
    const result = prepareCurveData(makeStroke((_, t) => Math.sin(t), {
      parametric: t => ({ x: Math.cos(t), y: Math.sin(t) }),
    }), { bucketCount: 128, sampleCount: 256 });
    expect(result.mode).toBe("parametric");
  });

  it("handles a short stroke with a controlled invalid result", () => {
    const result = prepareCurveData([{ x: 0, y: 0, t: 0 }], {});
    expect(result.mode).toBe("invalid");
    expect(result.reason).toContain("points");
  });
});
~~~

- [ ] **Step 2: Run the tests to verify failure**

Run: `npm test -- --run tests/preprocess.test.ts`  
Expected: FAIL because preprocessing modules do not exist.

- [ ] **Step 3: Implement validation and resampling**

Bucket points without sorting the entire trajectory first. Compute per-bucket median and spread, classify multi-valued regions against the noise-aware threshold, interpolate only short gaps, and shrink the domain around large missing spans. For the parametric path, resample by cumulative arc length and retain x(t), y(t).

- [ ] **Step 4: Implement smoothing, MAD noise, and normalization**

Use a radius-2 median filter, a precomputed degree-3 Savitzky–Golay convolution kernel, percentile-based y scaling, and a positive epsilon fallback for constant data.

- [ ] **Step 5: Run tests and commit**

Run: `npm test -- --run tests/preprocess.test.ts`  
Expected: PASS, including the circle and sparse-stroke review-focus cases.

~~~bash
git add src/core tests/fixtures/synthetic.ts tests/preprocess.test.ts
git commit -m "feat: preprocess and normalize hand-drawn strokes"
~~~

---

### Task 4: Build the numerical foundation

**Files:**
- Create: `src/math/vector.ts`
- Create: `src/math/matrix.ts`
- Create: `src/math/qr.ts`
- Create: `src/math/leastSquares.ts`
- Create: `src/math/brent.ts`
- Create: `src/math/robust.ts`
- Create: `tests/math.test.ts`

**Interfaces:**
- Consumes: finite number arrays and design matrices.
- Produces: `dot`, `norm2`, matrix helpers, `qrLeastSquares`, `weightedLeastSquares`, `brentMinimize`, Huber weights, RMSE, and robust loss.
- All solvers return a result union with `ok: false` for singular/non-finite input.

- [ ] **Step 1: Write failing numerical tests**

~~~ts
import { describe, expect, it } from "vitest";
import { qrLeastSquares } from "../src/math/leastSquares";
import { brentMinimize } from "../src/math/brent";

describe("math core", () => {
  it("solves a small least-squares system without normal equations", () => {
    const result = qrLeastSquares(
      [[1, 0], [1, 1], [1, 2], [1, 3]],
      [2, 5, 8, 11],
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.x).toEqual([2, 3]);
  });

  it("refines a one-dimensional minimum", () => {
    const result = brentMinimize(x => (x - 1.75) ** 2, -4, 4);
    expect(result.x).toBeCloseTo(1.75, 5);
  });
});
~~~

- [ ] **Step 2: Run the tests to verify failure**

Run: `npm test -- --run tests/math.test.ts`  
Expected: FAIL because numerical modules do not exist.

- [ ] **Step 3: Implement vector, matrix, and Householder QR**

Store matrices row-major. Apply Householder reflections to solve least squares and expose residual norm. Detect rank deficiency using a relative diagonal threshold and reject non-finite inputs.

- [ ] **Step 4: Implement weighted least squares, Brent, and robust helpers**

Scale rows by square-root weights before QR. Implement bounded Brent minimization with a deterministic iteration limit. Implement Huber weights and loss with `delta = max(1.5 * sigma, 0.01)`.

- [ ] **Step 5: Run focused and full math tests**

Run: `npm test -- --run tests/math.test.ts && npm run typecheck`  
Expected: PASS with no normal-equation inversion code.

- [ ] **Step 6: Commit**

~~~bash
git add src/math tests/math.test.ts
git commit -m "feat: add QR fitting and robust numerical primitives"
~~~

---

### Task 5: Implement the expression AST and safe renderers

**Files:**
- Create: `src/expr/ast.ts`
- Create: `src/expr/evaluate.ts`
- Create: `src/expr/canonical.ts`
- Create: `src/expr/simplify.ts`
- Create: `src/expr/latex.ts`
- Create: `src/expr/plain.ts`
- Create: `src/expr/serialize.ts`
- Create: `tests/expr.test.ts`

**Interfaces:**
- Consumes: AST constructors and numeric environments.
- Produces: `Expr`, `evaluateExpr`, `canonicalize`, `simplify`, `toLatex`, `toPlain`, `structuralHash`, and JSON-safe serialization.
- Public final expressions use constants; internal `param` nodes are materialized before serialization.

- [ ] **Step 1: Write failing AST tests**

~~~ts
import { describe, expect, it } from "vitest";
import {
  add, constant, mul, sin, variable,
} from "../src/expr/ast";
import { evaluateExpr } from "../src/expr/evaluate";
import { simplify } from "../src/expr/simplify";
import { toLatex } from "../src/expr/latex";

describe("expression AST", () => {
  it("canonicalizes commutative and neutral operations", () => {
    const expr = simplify(add(mul(constant(1), variable()), constant(0)));
    expect(toLatex(expr)).toBe("x");
  });

  it("evaluates invalid domains safely", () => {
    expect(evaluateExpr({ kind: "log", arg: constant(-1) }, 0)).toBeNaN();
    expect(evaluateExpr({ kind: "div", a: constant(1), b: constant(0) }, 0)).toBeNaN();
  });

  it("renders a trigonometric formula", () => {
    expect(toLatex(mul(constant(2), sin(variable())))).toContain("\\\\sin");
  });
});
~~~

- [ ] **Step 2: Run the tests to verify failure**

Run: `npm test -- --run tests/expr.test.ts`  
Expected: FAIL because the AST modules do not exist.

- [ ] **Step 3: Implement constructors, evaluator, and serialization**

Represent n-ary add/mul nodes so flattening is straightforward. Evaluating log, sqrt, division, and exp must return NaN on invalid input; a helper evaluates arrays and returns an invalid fraction.

- [ ] **Step 4: Implement canonicalization and simplification**

Sort commutative operands by structural hash, flatten nested associative nodes, fold numeric constants, remove 0/1, combine repeated terms, normalize negative sin/cos arguments, and rewrite simple polynomial powers.

- [ ] **Step 5: Implement LaTeX/plain renderers**

Emit KaTeX-safe strings for fractions, powers, roots, trig, logarithms, and absolute values. Keep plain text unambiguous with parentheses and explicit multiplication.

- [ ] **Step 6: Run tests and commit**

Run: `npm test -- --run tests/expr.test.ts && npm run typecheck`  
Expected: PASS.

~~~bash
git add src/expr tests/expr.test.ts
git commit -m "feat: add safe expression AST and renderers"
~~~

---

### Task 6: Add candidate scoring, Pareto selection, and semantic deduplication

**Files:**
- Create: `src/search/scoring.ts`
- Create: `src/search/candidatePool.ts`
- Create: `src/search/pareto.ts`
- Create: `src/search/semanticHash.ts`
- Create: `tests/search.test.ts`

**Interfaces:**
- Consumes: materialized Expr values, normalized data, noise, and model metrics.
- Produces: `scoreCandidate`, `semanticSignature`, `deduplicateCandidates`, `paretoFrontier`, and `selectPresentationCandidates`.
- Candidate selection returns `simple`, `balanced`, and `accurate` even when the frontier is short.

- [ ] **Step 1: Write failing ranking tests**

~~~ts
import { describe, expect, it } from "vitest";
import type { Candidate } from "../src/core/types";
import { variable } from "../src/expr/ast";
import { paretoFrontier, selectPresentationCandidates } from "../src/search/pareto";

const candidate = (id: string, error: number, complexity: number): Candidate => ({
  expr: variable(),
  params: [],
  error,
  robustError: error,
  complexity,
  score: error + complexity / 100,
  signature: id,
  modelFamily: id,
});

describe("candidate ranking", () => {
  it("removes dominated candidates", () => {
    const frontier = paretoFrontier([
      { id: "simple", error: 0.2, complexity: 2 },
      { id: "dominated", error: 0.3, complexity: 3 },
      { id: "accurate", error: 0.05, complexity: 8 },
    ]);
    expect(frontier.map(x => x.id)).toEqual(["simple", "accurate"]);
  });

  it("chooses all three presentation modes deterministically", () => {
    const result = selectPresentationCandidates([
      candidate("simple", 0.02, 2),
      candidate("balanced", 0.01, 4),
      candidate("accurate", 0.001, 8),
    ], 0.02);
    expect(result.simple).toBeDefined();
    expect(result.balanced).toBeDefined();
    expect(result.accurate).toBeDefined();
  });
});
~~~

- [ ] **Step 2: Run the tests to verify failure**

Run: `npm test -- --run tests/search.test.ts`  
Expected: FAIL because ranking modules do not exist.

- [ ] **Step 3: Implement metrics and MDL/BIC scoring**

Use raw-domain RMSE for display and normalized error for comparison. Clamp MSE to `max(MSE, sigmaDraw²)`, calculate parameter/operator/constant complexity, and use deterministic tie-breaks.

- [ ] **Step 4: Implement semantic signatures and bounded candidate pools**

Evaluate on 32 fixed points over [-1, 1], normalize mean/std, quantize at 1e-3, and hash. Keep the lower-complexity candidate for equivalent signatures, then cap each pool at 300.

- [ ] **Step 5: Implement Pareto and mode selection**

Remove candidates dominated in error and complexity. Apply the exact Simple threshold, Balanced score minimum, and Accurate lowest-RMSE-with-cap rules from the design.

- [ ] **Step 6: Run tests and commit**

Run: `npm test -- --run tests/search.test.ts`  
Expected: PASS.

~~~bash
git add src/search tests/search.test.ts
git commit -m "feat: rank candidates with Pareto and MDL scoring"
~~~

---

### Task 7: Implement polynomial, FFT, sinusoid, and Fourier model producers

**Files:**
- Create: `src/math/fft.ts`
- Create: `src/models/polynomial.ts`
- Create: `src/models/sinusoid.ts`
- Create: `src/models/fourier.ts`
- Create: `tests/models-periodic.test.ts`

**Interfaces:**
- Consumes: normalized `CurveData`, numerical primitives, and AST constructors.
- Produces: `producePolynomialCandidates`, `produceSinusoidCandidates`, `produceFourierCandidates`, and FFT peak detection.
- Emits candidates with fitted metrics and model family labels.

- [ ] **Step 1: Write failing synthetic model tests**

~~~ts
import { describe, expect, it } from "vitest";
import { makeCurveData } from "./fixtures/synthetic";
import { produceSinusoidCandidates } from "../src/models/sinusoid";
import { producePolynomialCandidates } from "../src/models/polynomial";

describe("periodic and polynomial models", () => {
  it("finds the frequency and amplitude of a sine curve", () => {
    const candidates = produceSinusoidCandidates(makeCurveData(
      x => 2 * Math.sin(Math.PI * x),
    ));
    const best = candidates.sort((a, b) => a.error - b.error)[0];
    expect(best.error).toBeLessThan(0.05);
    expect(best.modelFamily).toBe("sinusoid");
  });

  it("fits a cubic without using a high-degree power basis", () => {
    const candidates = producePolynomialCandidates(makeCurveData(x => x ** 3 - x));
    const best = candidates.find(candidate => candidate.degree === 3);
    expect(best?.error).toBeLessThan(1e-3);
  });
});
~~~

- [ ] **Step 2: Run the tests to verify failure**

Run: `npm test -- --run tests/models-periodic.test.ts`  
Expected: FAIL because model modules do not exist.

- [ ] **Step 3: Implement Chebyshev polynomial fitting**

Fit degrees 0–8 in Chebyshev basis with QR, convert coefficients to ordinary polynomial AST, remove near-zero terms, and preserve the degree/model metadata.

- [ ] **Step 4: Implement FFT and sinusoid variable projection**

Detect spectral peaks, refine each angular frequency with bounded Brent search, solve linear sine/cosine/offset/trend coefficients by QR, and convert sine/cosine coefficients to non-negative amplitude plus normalized phase.

- [ ] **Step 5: Implement Fourier candidates**

For each promising base frequency, solve harmonics K=2…5 linearly and emit a canonical Fourier AST. Reject candidates with non-finite evaluations.

- [ ] **Step 6: Run model tests and commit**

Run: `npm test -- --run tests/models-periodic.test.ts`  
Expected: PASS for the sine and cubic fixtures.

~~~bash
git add src/math/fft.ts src/models tests/models-periodic.test.ts
git commit -m "feat: fit polynomial and periodic model families"
~~~

---

### Task 8: Implement variable-projection and nonlinear model producers

**Files:**
- Create: `src/math/lm.ts`
- Create: `src/models/exponential.ts`
- Create: `src/models/logarithm.ts`
- Create: `src/models/absolute.ts`
- Create: `src/models/rational.ts`
- Create: `src/models/gaussian.ts`
- Create: `src/models/logistic.ts`
- Create: `src/models/dampedSinusoid.ts`
- Create: `tests/models-nonlinear.test.ts`

**Interfaces:**
- Consumes: normalized CurveData, QR least squares, robust weighting, AST constructors.
- Produces: one producer function per model family and a reusable bounded LM optimizer with finite-difference Jacobians.
- LM accepts residual and parameter-bound callbacks and returns the best finite parameter vector across up to 60 iterations.

- [ ] **Step 1: Write failing nonlinear model tests**

~~~ts
import { describe, expect, it } from "vitest";
import { makeCurveData } from "./fixtures/synthetic";
import { produceExponentialCandidates } from "../src/models/exponential";
import { produceAbsoluteCandidates } from "../src/models/absolute";
import { produceGaussianCandidates } from "../src/models/gaussian";

describe("nonlinear model bank", () => {
  it("fits an exponential trend", () => {
    const best = produceExponentialCandidates(makeCurveData(x => Math.exp(0.7 * x)))
      .sort((a, b) => a.error - b.error)[0];
    expect(best.error).toBeLessThan(0.08);
  });

  it("finds an absolute-value breakpoint", () => {
    const best = produceAbsoluteCandidates(makeCurveData(x => Math.abs(x - 1)))
      .sort((a, b) => a.error - b.error)[0];
    expect(best.error).toBeLessThan(0.08);
  });

  it("fits a Gaussian bump", () => {
    const best = produceGaussianCandidates(makeCurveData(x => 2 * Math.exp(-x * x)))
      .sort((a, b) => a.error - b.error)[0];
    expect(best.error).toBeLessThan(0.12);
  });
});
~~~

- [ ] **Step 2: Run the tests to verify failure**

Run: `npm test -- --run tests/models-nonlinear.test.ts`  
Expected: FAIL because LM and nonlinear producers do not exist.

- [ ] **Step 3: Implement bounded Levenberg–Marquardt with Huber IRLS**

Use central finite differences with `h = 1e-5 * max(1, abs(theta))`, solve the weighted linear step with QR, adapt damping, clamp bounds, retain the best finite state, and stop on small improvement or 60 iterations. Run 4–8 deterministic starts for multi-parameter models.

- [ ] **Step 4: Implement exponential, logarithm, and absolute producers**

Use variable projection for exponential coefficients and legal logarithm shifts. Scan/refine absolute breakpoints and solve affine coefficients linearly. Reject any candidate with too many invalid domain samples.

- [ ] **Step 5: Implement rational, Gaussian, logistic, and damped sinusoid producers**

Initialize rational coefficients from the linearized equation yQ=P, refine against true quotient residuals, reject near-zero denominators, and use bounded multi-start LM for the remaining families. Clamp exponential arguments to [-30, 30] during fitting.

- [ ] **Step 6: Run tests and commit**

Run: `npm test -- --run tests/models-nonlinear.test.ts`  
Expected: PASS for exponential, absolute, and Gaussian fixtures; invalid-domain cases remain finite and rejected.

~~~bash
git add src/math/lm.ts src/models tests/models-nonlinear.test.ts
git commit -m "feat: add nonlinear model producers"
~~~

---

### Task 9: Add feature analysis, universal fallback, and constant beautification

**Files:**
- Create: `src/core/features.ts`
- Create: `src/models/fallback.ts`
- Create: `src/beautify/rational.ts`
- Create: `src/beautify/constants.ts`
- Create: `src/beautify/beautify.ts`
- Create: `tests/fallback-beautify.test.ts`

**Interfaces:**
- Consumes: CurveData, ASTs, QR fitting, and candidate scoring.
- Produces: feature priors, Chebyshev/Fourier fallback candidates, continued-fraction rational approximations, constant alternatives, and beautified candidate results.
- Fallback always returns at least one finite candidate for valid function data.

- [ ] **Step 1: Write failing fallback and beautification tests**

~~~ts
import { describe, expect, it } from "vitest";
import { beautifyCandidate } from "../src/beautify/beautify";
import { produceFallbackCandidates } from "../src/models/fallback";
import { makeCurveData, rawSineCandidate } from "./fixtures/synthetic";

describe("fallback and constants", () => {
  it("prefers 2 sin(pi x) over the raw fitted constants", () => {
    const result = beautifyCandidate(rawSineCandidate(1.9987, 3.1419, 0.0021));
    expect(result.plain).toMatch(/2/);
    expect(result.latex).toContain("\\\\pi");
  });

  it("always returns a finite Chebyshev approximation", () => {
    const candidates = produceFallbackCandidates(makeCurveData(x => Math.sin(x * x)));
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every(candidate => Number.isFinite(candidate.error))).toBe(true);
  });
});
~~~

- [ ] **Step 2: Run the tests to verify failure**

Run: `npm test -- --run tests/fallback-beautify.test.ts`  
Expected: FAIL because fallback and beautification modules do not exist.

- [ ] **Step 3: Implement feature extraction**

Compute derivatives, second derivatives, extrema, zero crossings, monotonicity, symmetry hints, FFT peaks, and curvature peaks. Return only priorities and initial guesses; do not make formula decisions here.

- [ ] **Step 4: Implement universal approximations**

Fit Chebyshev degrees 4, 6, 8, 10, 12, and 16. Add up to 8 Fourier harmonics when periodicity is plausible. Build displayable ASTs with finite coefficient checks.

- [ ] **Step 5: Implement constant alternatives and beam replacement**

Generate integer, rational, π/e multiple, and square-root alternatives using continued fractions. Replace constants with a width-32 beam, re-evaluate raw-domain error, and retain a replacement only when the total score improves or remains inside the noise-compatible tolerance.

- [ ] **Step 6: Run tests and commit**

Run: `npm test -- --run tests/fallback-beautify.test.ts`  
Expected: PASS, including the 2 sin(πx) beautification behavior.

~~~bash
git add src/core/features.ts src/models/fallback.ts src/beautify tests/fallback-beautify.test.ts
git commit -m "feat: add universal fallback and pretty constants"
~~~

---

### Task 10: Implement constrained symbolic search

**Files:**
- Create: `src/search/grammar.ts`
- Create: `src/search/symbolic.ts`
- Create: `tests/symbolic.test.ts`

**Interfaces:**
- Consumes: feature context, CurveData, CandidatePool, AST canonicalization, semantic hashing, and scoring.
- Produces: `searchSymbolic(data, context, onImprovement)` with bounded complexity, time budget, and progressive callbacks.
- Search output is a finite candidate list and never emits an invalid AST.

- [ ] **Step 1: Write failing symbolic-search tests**

~~~ts
import { describe, expect, it } from "vitest";
import { searchSymbolic } from "../src/search/symbolic";

describe("symbolic search", () => {
  it("finds a compact trigonometric shape without candidate explosion", () => {
    const improvements: number[] = [];
    const result = searchSymbolic(makeCurveData(x => 2 * Math.sin(Math.PI * x)), {
      maxComplexity: 6,
      maxCandidatesPerLevel: 300,
      timeBudgetMs: 250,
    }, candidate => improvements.push(candidate.score));
    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThanOrEqual(300);
    expect(improvements.length).toBeGreaterThan(0);
  });

  it("canonicalizes commutative duplicates before beam insertion", () => {
    const result = searchSymbolic(makeCurveData(x => x + 1), {
      maxComplexity: 4,
      maxCandidatesPerLevel: 300,
      timeBudgetMs: 100,
    });
    expect(new Set(result.map(candidate => candidate.signature)).size)
      .toBe(result.length);
  });
});
~~~

- [ ] **Step 2: Run the tests to verify failure**

Run: `npm test -- --run tests/symbolic.test.ts`  
Expected: FAIL because the grammar and search modules do not exist.

- [ ] **Step 3: Implement grammar expansion**

Start with x, constants, and normalized shape seeds. Add only the requested unary/binary operations and explicit outer affine parameter forms. Enforce maximum free parameters and structural complexity before evaluation.

- [ ] **Step 4: Implement canonical, semantic, and beam pruning**

Canonicalize every expansion, reject invalid probe evaluations, compute the normalized 32-point signature, deduplicate signatures, sort by score, and keep at most 300 candidates. Combine only the top 40–60 candidates at each binary stage.

- [ ] **Step 5: Implement time-aware progressive callbacks**

Check `performance.now()` at every level and in combination loops. Call `onImprovement` only when score improves by a meaningful threshold. Stop at the noise floor, time budget, complexity cap, or three stagnant levels.

- [ ] **Step 6: Run tests and commit**

Run: `npm test -- --run tests/symbolic.test.ts`  
Expected: PASS without unbounded candidate growth.

~~~bash
git add src/search/grammar.ts src/search/symbolic.ts tests/symbolic.test.ts
git commit -m "feat: add bounded symbolic expression search"
~~~

---

### Task 11: Integrate the solver pipeline and parametric fallback

**Files:**
- Create: `src/models/modelBank.ts`
- Create: `src/core/solver.ts`
- Modify: `src/core/types.ts`
- Create: `tests/solver.test.ts`

**Interfaces:**
- Consumes: every producer, preprocessing, scoring, beautification, and parametric resampling.
- Produces: `solveCurve(points, options)` with progressive callback support and the complete `SolveResult`.
- Provides `solveParametric(points, options)` that returns x(t), y(t) expressions plus paired plots.

- [ ] **Step 1: Write failing end-to-end solver tests**

~~~ts
import { describe, expect, it } from "vitest";
import { solveCurve } from "../src/core/solver";
import { makeNoisyStroke } from "./fixtures/synthetic";

describe("solveCurve", () => {
  it("returns three ranked candidates for a sine stroke", () => {
    const result = solveCurve(makeStroke(x => 2 * Math.sin(Math.PI * x)), {
      timeBudgetMs: 500,
    });
    expect(result.mode).toBe("function");
    expect(result.best.latex.length).toBeGreaterThan(0);
    expect(result.simple).toBeDefined();
    expect(result.balanced).toBeDefined();
    expect(result.accurate).toBeDefined();
  });

  it("returns a parametric result for a circle", () => {
    const result = solveCurve(makeCircleStroke(), { timeBudgetMs: 500 });
    expect(result.mode).toBe("parametric");
    expect(result.parametric?.x.latex).toBeTruthy();
    expect(result.parametric?.y.latex).toBeTruthy();
  });

  it("reports quality from noise ratio and score gap", () => {
    const result = solveCurve(makeStroke(x => x * x, { noise: 0.01 }), {});
    expect(["excellent", "good", "approximation", "low"]).toContain(result.quality);
  });
});
~~~

- [ ] **Step 2: Run the tests to verify failure**

Run: `npm test -- --run tests/solver.test.ts`  
Expected: FAIL because the integrated solver does not exist.

- [ ] **Step 3: Implement model-bank orchestration**

Run preprocessing, feature analysis, fast producers, fallback producers, and symbolic search in deterministic priority order. Add every finite candidate to one pool, score it, deduplicate it, and preserve producer diagnostics.

- [ ] **Step 4: Implement finalization**

Beautify candidate constants, canonicalize/simplify again after restoring world coordinates, compute plots on the effective domain, calculate confidence quality from RMSE/noise and score gap, and choose Pareto presentation candidates.

- [ ] **Step 5: Implement parametric solving**

Resample by arc length, solve x(t) and y(t) independently with the same one-dimensional producers, and serialize the pair with a paired plot. Keep the invalid reason attached to the result.

- [ ] **Step 6: Run tests and commit**

Run: `npm test -- --run tests/solver.test.ts`  
Expected: PASS for sine, circle, and quality classification.

~~~bash
git add src/core/types.ts src/core/solver.ts src/models/modelBank.ts tests/solver.test.ts
git commit -m "feat: integrate curve solver and parametric fallback"
~~~

---

### Task 12: Add the Worker boundary and stale-request cancellation

**Files:**
- Create: `src/worker/solver.worker.ts`
- Create: `src/worker/client.ts`
- Create: `tests/worker-client.test.ts`

**Interfaces:**
- Consumes: `solveCurve`, serialized types, and transferable arrays where useful.
- Produces: `SolverWorkerClient.submit(points, view, options)`, `cancel`, progress callbacks, and stale-request filtering.
- The Worker protocol uses request IDs and emits progress, candidate, done, and invalid messages.

- [ ] **Step 1: Write failing client cancellation tests**

~~~ts
import { describe, expect, it } from "vitest";
import { SolverWorkerClient } from "../src/worker/client";
import { createViewport } from "../src/ui/viewport";
import { makeMinimalSolveResult, makeStroke } from "../fixtures/synthetic";

describe("solver Worker client", () => {
  it("ignores a late response from an older request", () => {
    const worker = new FakeWorker();
    const client = new SolverWorkerClient(worker);
    const received: string[] = [];
    client.submit(makeStroke(x => x), createViewport(), {}, result => received.push(result.best.plain));
    client.submit(makeStroke(x => x * x), createViewport(), {}, result => received.push(result.best.plain));
    worker.emit({ type: "done", id: 1, result: makeMinimalSolveResult("first") });
    worker.emit({ type: "done", id: 2, result: makeMinimalSolveResult("second") });
    expect(received).toEqual(["second"]);
  });
});

class FakeWorker {
  private listeners: Array<(event: MessageEvent) => void> = [];
  postMessage(_message: unknown) {}
  addEventListener(_type: string, listener: (event: MessageEvent) => void) {
    this.listeners.push(listener);
  }
  terminate() {}
  emit(data: unknown) {
    for (const listener of this.listeners) listener({ data } as MessageEvent);
  }
}
~~~

- [ ] **Step 2: Run the tests to verify failure**

Run: `npm test -- --run tests/worker-client.test.ts`  
Expected: FAIL because the Worker client does not exist.

- [ ] **Step 3: Implement the Worker entry**

Install the Worker with `new Worker(new URL("./solver.worker.ts", import.meta.url), { type: "module" })`. Validate the message shape, run `solveCurve`, and post serialized progress/results. Catch unexpected errors and return an `invalid` response with a user-safe reason.

- [ ] **Step 4: Implement client-side request IDs and cancellation**

Increment the active ID on every submit, terminate or ignore the previous request, and check the active ID before invoking every callback. Serialize only plain data and reconstruct ASTs on the main thread.

- [ ] **Step 5: Run tests, build, and commit**

Run: `npm test -- --run tests/worker-client.test.ts && npm run build`  
Expected: PASS and Vite emits a separate Worker chunk.

~~~bash
git add src/worker tests/worker-client.test.ts
git commit -m "feat: move solving into a cancellable Web Worker"
~~~

---

### Task 13: Build the Canvas UI and progressive result panel

**Files:**
- Modify: `src/main.ts`
- Modify: `src/styles.css`
- Create: `src/ui/canvas.ts`
- Create: `src/ui/plot.ts`
- Create: `src/ui/controls.ts`
- Create: `tests/ui-smoke.test.ts`

**Interfaces:**
- Consumes: Viewport, Point, SolverWorkerClient, CandidateResult, and KaTeX.
- Produces: responsive drawing surface, toolbar actions, formula panel, candidate tabs, copy actions, and progressive plot updates.
- UI labels are Simple, Balanced, Accurate, Excellent match, Good match, Approximation, and Low confidence.

- [ ] **Step 1: Write failing DOM smoke tests**

~~~ts
import { describe, expect, it } from "vitest";
import { mountApp } from "../src/main";

describe("application UI", () => {
  it("renders the drawing surface and candidate controls", () => {
    const root = document.createElement("div");
    mountApp(root);
    expect(root.querySelector("canvas")).toBeTruthy();
    expect(root.textContent).toContain("Simple");
    expect(root.textContent).toContain("Balanced");
    expect(root.textContent).toContain("Accurate");
  });
});
~~~

- [ ] **Step 2: Run the test to verify failure**

Run: `npm test -- --run tests/ui-smoke.test.ts`  
Expected: FAIL because the final UI is not implemented.

- [ ] **Step 3: Implement Canvas rendering and pointer capture**

Scale the backing canvas by device-pixel ratio, map pointer coordinates through the viewport, retain the world-coordinate stroke, draw grid/axes/raw stroke/fitted plot in separate layers, and redraw on resize or viewport change.

- [ ] **Step 4: Implement controls and result state**

Add Undo, Clear, Reset view, zoom/pan controls, candidate tabs, quality text, diagnostics tooltip, Copy LaTeX, and Copy plain expression. Send the complete stroke on pointerup and show a progress state while the Worker runs.

- [ ] **Step 5: Integrate KaTeX and invalid/parametric states**

Render only validated LaTeX, keep the raw stroke visible for invalid input, show the function limitation message, and render paired x(t), y(t) formulas when the parametric fallback succeeds.

- [ ] **Step 6: Run tests and commit**

Run: `npm test -- --run tests/ui-smoke.test.ts && npm run typecheck && npm run build`  
Expected: PASS; the production build contains no server dependency.

~~~bash
git add src/main.ts src/styles.css src/ui tests/ui-smoke.test.ts
git commit -m "feat: add drawing canvas and candidate UI"
~~~

---

### Task 14: Add synthetic acceptance suite, performance checks, and offline documentation

**Files:**
- Create: `tests/acceptance.test.ts`
- Create: `tests/performance.test.ts`
- Modify: `README.md`
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: public `solveCurve`, synthetic fixture generators, and npm scripts.
- Produces: deterministic acceptance coverage and CI checks for typecheck, unit tests, and production build.

- [ ] **Step 1: Write the failing acceptance assertions**

~~~ts
import { describe, expect, it } from "vitest";
import { solveCurve } from "../src/core/solver";

describe("synthetic acceptance", () => {
  it.each([
    ["line", x => 2 * x + 1],
    ["parabola", x => x * x],
    ["sine", x => 2 * Math.sin(Math.PI * x)],
    ["absolute", x => Math.abs(x - 1)],
    ["exponential", x => Math.exp(0.7 * x)],
    ["gaussian", x => Math.exp(-x * x)],
  ])("%s stays within the drawing-noise budget", (_name, fn) => {
    const result = solveCurve(makeNoisyStroke(fn), { timeBudgetMs: 1200 });
    expect(result.best.normalizedRmse).toBeLessThan(0.25);
    expect(result.best.latex.length).toBeGreaterThan(0);
  });
});
~~~

- [ ] **Step 2: Run the tests to verify the expected gaps**

Run: `npm test -- --run tests/acceptance.test.ts`  
Expected: any failures identify model/ranking gaps that must be fixed before release; do not lower assertions without recording the numerical reason in the test.

- [ ] **Step 3: Add all requested synthetic fixtures**

Generate Gaussian noise, low-frequency wobble, non-uniform sampling, dropped samples, isolated outliers, and x jitter. Include all curves from the design spec, including `sin(x²)`, damped sine, rational, random Chebyshev, and random Fourier functions.

- [ ] **Step 4: Add performance and Worker ownership checks**

Measure the fast bank and full solve on 256 samples. Assert fast-bank timing below 100 ms in the test environment, candidate pool bounds, and no main-thread solver import in UI modules. Keep timing tests tolerant enough for CI variance while preserving the target as a diagnostic.

- [ ] **Step 5: Document local/offline usage and CI**

Update README with the project purpose, development commands, architecture, supported model families, and offline behavior. Add CI steps for `npm ci`, `npm run typecheck`, `npm test -- --run`, and `npm run build`.

- [ ] **Step 6: Run the complete verification suite and commit**

Run:

~~~bash
npm run typecheck
npm test -- --run
npm run build
~~~

Expected: all tests pass and the production bundle builds offline after dependencies are installed.

~~~bash
git add tests README.md .github/workflows/ci.yml
git commit -m "test: add acceptance suite and CI verification"
~~~

---

### Task 15: Final review, branch verification, and handoff

**Files:**
- Modify only files required by review findings.
- Test: the complete repository test/build commands.

**Interfaces:**
- Consumes: all preceding tasks and the design acceptance criteria.
- Produces: a verified branch with a runnable offline application and a concise implementation report.

- [ ] **Step 1: Run the full verification commands**

~~~bash
npm run typecheck
npm test -- --run
npm run build
~~~

Expected: PASS for all commands.

- [ ] **Step 2: Inspect the generated application**

Start `npm run dev -- --host 0.0.0.0`, draw a sine curve, parabola, V shape, and circle, and verify:

- the raw stroke remains visible;
- the fitted curve updates progressively;
- formulas render through KaTeX;
- Simple, Balanced, and Accurate switch candidates;
- Copy LaTeX and Copy plain expression work;
- circle input produces a parametric explanation;
- rapidly drawing a second stroke never shows the first result.

- [ ] **Step 3: Review numerical and memory safety**

Search the source for unchecked array indexing in preprocessing, direct normal-equation inversion, unbounded candidate arrays, and evaluator paths that can throw. Confirm that old Worker responses are ignored and that no solver module is imported into the main-thread canvas renderer.

- [ ] **Step 4: Commit any review fixes**

~~~bash
git add .
git commit -m "fix: harden first release verification findings"
~~~

Run the complete verification commands again after any fix.

- [ ] **Step 5: Report the final branch and verification evidence**

Report the branch name, final commit SHA, commands run, test count, build status, and known approximation limits. Do not describe the application as complete until the commands and manual smoke checks have passed.

## Plan self-review

- Spec coverage: Tasks 1–3 cover project shell, coordinates, stroke capture, validation, resampling, smoothing, noise, normalization, and sparse/parametric inputs. Tasks 4–8 cover QR, Brent, LM, Huber, FFT, and every requested model family. Tasks 5–10 cover AST, simplification, semantic hashing, symbolic search, fallback, beautification, Pareto, and MDL. Tasks 11–13 cover public solving, parametric fallback, Worker cancellation, progressive results, Canvas, KaTeX, and controls. Tasks 14–15 cover synthetic acceptance, performance, offline operation, CI, and manual verification.
- Placeholder scan: no task depends on a future unspecified interface; every listed module has a responsibility, an input/output contract, a test target, and a verification command.
- Type consistency: `Point`, `Viewport`, `Candidate`, `CandidateResult`, `SolveResult`, and Worker messages originate in `src/core/types.ts`; later tasks consume those names. Internal `param` nodes are materialized before public serialization.
- Review focus coverage: circle/vertical handling is tested in Task 3 and Task 11; flat/zero-noise handling is tested in Task 3 and Task 11; invalid domains are tested in Task 5 and Task 8; stale Worker results are tested in Task 12; sparse input is tested in Task 3.
- Execution order: every task leaves a runnable project and ends with an independently executable test/build/commit cycle.
