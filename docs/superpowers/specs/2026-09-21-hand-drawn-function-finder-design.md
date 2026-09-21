# Hand-drawn Function Finder Design

**Date:** 2026-09-21  
**Repository:** Systina12/UnDraw  
**Status:** Design approved in conversation; implementation pending plan review

## 1. Intent and product boundary

UnDraw will become an offline-first, pure-front-end web application that turns a hand-drawn curve into a short mathematical description. The primary interaction is:

~~~text
draw in a mathematical coordinate plane
→ release pointer
→ receive progressive fitted candidates
→ compare Simple / Balanced / Accurate
→ copy LaTeX or plain text
~~~

The solver optimizes a practical minimum-description-length objective: once the residual is close to the estimated drawing noise, additional accuracy receives little reward and simpler expressions win.

The first release must provide a complete usable loop. It must recognize common polynomial, trigonometric, exponential, logarithmic, absolute-value, rational, Gaussian, logistic, and damped-periodic curves; return a stable universal approximation for curves outside the model bank; detect curves that cannot reasonably be represented as y=f(x); and keep all expensive work in a Web Worker.

The first release does not need a neural network, a server, persistent accounts, multi-user collaboration, or a full computer-algebra system. The mathematical core must remain independent of the UI so it can later move to Node.js, Electron, WASM, mobile, or a browser extension.

## 2. Design decisions

### 2.1 Application style

Use Vite and TypeScript with a small DOM-based UI. Do not introduce React for the first release: the page has one main canvas, a small control surface, and a result panel, while the solver benefits from direct ownership of data and rendering. KaTeX is the only UI-oriented runtime dependency.

### 2.2 Local computation

The main thread owns pointer events, viewport state, canvas rendering, controls, and KaTeX rendering. A dedicated module Worker owns preprocessing, numerical fitting, symbolic search, ranking, and candidate plot generation. Requests carry monotonically increasing IDs; every response with an old ID is ignored.

### 2.3 Numerical strategy

Use normalized coordinates for fitting, QR-based least squares for linear parameters, variable projection for one-dimensional nonlinear parameters, and a small Levenberg–Marquardt implementation for models with several nonlinear parameters. Robust fitting uses Huber IRLS. Evaluators are total functions: invalid domains produce NaN/invalid masks and cause candidate rejection, never Worker failure.

### 2.4 Candidate strategy

Every model producer emits the same candidate shape. Fast model producers provide immediate useful answers and good initial candidates. Symbolic search explores a constrained grammar with canonicalization, semantic signatures, beam limits, and a time budget. A Chebyshev approximation is always available for valid function data, so an unfamiliar curve still receives a useful result.

### 2.5 Formula representation

The public final AST follows the requested Expr structure. An internal param node is added for fitting and symbolic search; before a candidate reaches the UI, parameter nodes are materialized as constants. This keeps fitting explicit without leaking optimizer placeholders into copied formulas.

## 3. End-to-end data flow

~~~text
Pointer Events
  → world-coordinate raw stroke
  → function validation
  → bucket median and uniform resampling
  → median + Savitzky–Golay smoothing
  → MAD noise estimate and normalization
  → feature extraction
  → fast model bank
  → symbolic search and universal fallback
  → semantic deduplication
  → Pareto frontier
  → constant beautification
  → MDL/BIC-style score
  → final AST, LaTeX, plain text, plot
~~~

The raw curve is preserved for error evaluation. The smooth curve is used for derivatives, extrema, symmetry, periodicity, FFT peaks, and optimizer initial guesses.

## 4. Coordinate plane and stroke capture

The initial viewport is [-5, 5] × [-5, 5]. A Viewport stores xmin, xmax, ymin, and ymax, and exposes screenToWorld, worldToScreen, pan, zoomAt, and reset. Pointer samples are stored immediately in world coordinates as:

~~~ts
interface Point {
  x: number;
  y: number;
  t: number;
}
~~~

The canvas uses device-pixel-ratio scaling and redraws axes, grid, raw stroke, and fitted plot independently. Pointer capture keeps a stroke continuous when the pointer leaves the canvas. Pointer movement is throttled only for rendering; the saved stroke retains all available samples.

The first UI exposes pan, zoom, reset view, clear, and undo. Undo removes the latest stroke even though the initial solver only consumes one main stroke.

## 5. Function validation and preprocessing

The stroke is divided into 128 x-buckets. For each bucket, calculate the median y, count, and y spread. Estimate an initial noise floor from local residuals after a light median filter. A bucket is multi-valued when its spread exceeds:

~~~text
max(4 * sigmaDraw, 0.05 * yRange)
~~~

If more than roughly 5% of valid buckets are multi-valued, return mode: parametric with the message that the curve is not single-valued as y=f(x). A closed or backtracking stroke therefore does not get silently sorted into a false function.

For valid functions, bucket medians are interpolated onto 256 uniformly spaced x-values. Small gaps are linearly interpolated; large leading or trailing gaps shrink the effective domain. Duplicate x-values are merged with medians. The result keeps both raw/resampled values and smoothed values.

Smoothing uses median radius 2 followed by a degree-3 Savitzky–Golay filter with an odd window of 9 or 11, selected according to sample count. Noise is:

~~~text
sigmaDraw = 1.4826 * median(abs(residual - median(residual)))
~~~

with a finite positive fallback for perfectly clean synthetic input.

Normalization uses:

~~~text
xc = (xmin + xmax) / 2
xs = max((xmax - xmin) / 2, epsilon)
yc = median(y)
ys = max((percentile95(y) - percentile5(y)) / 2, epsilon)
u = (x - xc) / xs
v = (y - yc) / ys
~~~

The original coordinate transform is retained so normalized expressions can be restored to x/y space before display.

For parametric fallback, resample by normalized arc length t ∈ [0, 1], then solve the same one-dimensional problem separately for x(t) and y(t). This produces a pair of expressions and a parametric plot.

## 6. Mathematical core

### 6.1 Core interfaces

The public solver entry point is:

~~~ts
solveCurve(points: Point[], options?: SolverOptions): SolveResult
~~~

Important types include:

~~~ts
type CandidateProducer = {
  name: string;
  produce(data: CurveData, context: SolveContext): Candidate[];
};

interface Candidate {
  expr: Expr;
  params: number[];
  error: number;
  robustError: number;
  complexity: number;
  score: number;
  signature: string;
  modelFamily?: string;
}
~~~

The final result includes best, simple, balanced, accurate, the Pareto frontier, domain, noise, quality label, plot data, and diagnostics.

### 6.2 AST

The expression union includes x, constants, n-ary addition/multiplication, division, powers, sin, cos, exp, log, abs, and sqrt. Internal fitting additionally supports param. AST operations are centralized:

~~~text
evaluate, complexity, canonicalize, simplify,
toLatex, toPlain, structuralHash, collectConstants
~~~

Canonicalization flattens associative nodes, sorts commutative operands, folds numeric constants, removes neutral elements, combines polynomial terms, normalizes trigonometric phase, and rejects known redundant structures. All evaluators check finite results, logarithm/square-root domains, near-zero denominators, and exponential overflow.

### 6.3 Linear algebra

Implement a small dependency-free math layer containing vector operations, matrix operations, Householder QR, QR least squares, linear solve, finite-difference Jacobian, Brent/golden-section one-dimensional optimization, and Levenberg–Marquardt. Least squares must not form (AᵀA)⁻¹.

The largest routine matrices are around 256 × 10, so a straightforward typed-array implementation is sufficient. Every public numerical function returns finite-status information or a rejected result rather than throwing on ordinary bad data.

### 6.4 Fast model bank

The first release implements these producers:

| Family | Fitting strategy | Output form |
|---|---|---|
| Polynomial | Chebyshev-basis QR, degrees 0–8 | Ordinary polynomial AST |
| Single sinusoid | FFT peaks, Brent frequency refinement, linear coefficients | A sin(ωx+φ)+C or equivalent |
| Fourier | One nonlinear base frequency, linear harmonics K=2–5 | Fourier AST |
| Exponential | Variable projection over b ∈ [-10,10] | a exp(bx)+c |
| Logarithm | Scan/refine legal shifts for both directions | a log(x-b)+c or a log(b-x)+c |
| Absolute/hinge | Scan breakpoint and solve linear coefficients | a abs(x-b)+c or affine hinge |
| Rational | Linear initialization, LM refinement, denominator safety checks | P(x)/Q(x) with m≤3,n≤2 |
| Gaussian | Multi-start LM | a exp(-((x-b)/c)^2)+d |
| Logistic | Multi-start LM | a/(1+exp(-b(x-c)))+d |
| Damped sinusoid | Multi-start LM | exp(ax)(b sin(ωx)+c cos(ωx))+d |

Feature analysis only changes producer priority, initial guesses, and budget. It never directly chooses the final expression.

### 6.5 Robust fitting and scoring

Fit residuals use Huber IRLS with:

~~~text
delta = max(1.5 * sigmaDraw, 0.01)
~~~

Store RMSE, robust error, and maximum error. Final effective MSE is clamped to the drawing noise floor:

~~~text
mseEff = max(MSE, sigmaDraw²)
score = N * log(mseEff + epsilon) + K * log(N)
~~~

K combines free parameter count, weighted operator complexity, and constant complexity. Candidates are ranked by score with deterministic tie-breaking on error, complexity, and structural hash.

### 6.6 Symbolic search

The search grammar starts from x and builds canonical expressions using addition, multiplication, division, integer powers in {-3,-2,2,3,4}, sin, cos, exp, log of absolute values, abs, and square root of absolute values. Outer affine parameters are represented explicitly so a shape can fit scale, phase, offset, and slope without enumerating arbitrary numeric constants.

Search proceeds by structural complexity up to 12. Each level canonicalizes immediately, computes a 32-point normalized semantic signature, deduplicates equivalent shapes, and retains at most 300 candidates. Binary combinations use only the best 40–60 shapes from the previous beam. Search stops at the time budget, at the drawing noise floor, or after three levels without meaningful improvement.

The semantic signature subtracts mean, divides by standard deviation, quantizes at 1e-3, and hashes the vector. If two candidates share a signature, keep the one with lower complexity or lower fit error.

### 6.7 Universal fallback and Pareto selection

Chebyshev approximations of degrees 4, 6, 8, 10, 12, and 16 are always attempted. Fourier fallback uses up to 8 harmonics when periodicity is plausible. The fallback is labeled Approximation in the UI when it does not reach the drawing-noise threshold.

After all producers finish, remove dominated candidates over normalized error and complexity. From the Pareto frontier:

- Simple: lowest complexity under 2.5 × max(sigmaDraw, Emin) error.
- Balanced: lowest MDL/BIC-style score.
- Accurate: lowest RMSE within the configured complexity cap.

If the frontier has fewer than three distinct candidates, reuse the closest available candidate with distinct labels and preserve the diagnostics.

## 7. Constant beautification

Every fitted numeric constant receives a bounded candidate set containing its original value, nearby integers from -10 to 10, small rationals with denominator ≤12 and numerator magnitude ≤48, rational multiples of π/e, and rational multiples of square roots for n=2…10. Continued fractions generate rational candidates.

Do not round constants independently and stop. Perform a beam search of width 32, replacing one constant at a time, re-evaluating raw-domain error and final score after each replacement. A pretty constant wins only when its error remains compatible with the noise floor or its score improves.

This is the mechanism that turns values such as 1.9987 and 3.1419 into 2 and π when the drawing supports the simplification.

## 8. Worker protocol and progressive solving

The Worker accepts:

~~~ts
type WorkerRequest = {
  id: number;
  points: Point[];
  view: Viewport;
  options: SolverOptions;
};
~~~

It emits progress, candidate, done, or invalid messages. The initial fast bank result is posted as soon as it is available. Symbolic-search improvements are posted only when they materially improve the current best result. The main thread discards responses whose ID no longer matches the active stroke.

The default budget is approximately 1500 ms on desktop and 2000 ms on mobile, with an option override for tests. Timing uses a monotonic clock inside the Worker; no artificial delays are inserted.

## 9. UI behavior

The page contains a responsive coordinate canvas, compact toolbar, formula result, quality label, candidate tabs, and actions for copy LaTeX, copy plain expression, undo, clear, and reset view. The raw stroke and fitted curve have distinct colors and legends. Hovering or focusing a candidate exposes RMSE, complexity, and model family.

For invalid multi-valued input, the UI keeps the stroke visible, explains the function limitation, and offers the parametric result when available. For low-confidence fits, the formula remains visible with a clear quality label instead of hiding the result.

KaTeX rendering receives generated LaTeX only after the AST has been validated. Clipboard failures are surfaced as a small non-blocking status message.

## 10. Testing strategy

Tests run in the browser-independent core with Vitest. The test suite covers:

1. Screen/world transforms, pan, zoom, and device-pixel-ratio-independent coordinates.
2. Bucket validation for a valid function, a circle, a vertical line, and a backtracking stroke.
3. Median resampling, gap interpolation, smoothing, and MAD noise estimation.
4. QR least squares against known linear systems and rank-deficient rejection.
5. AST evaluation, canonicalization, simplification, structural hashing, and LaTeX output.
6. Each fast model on deterministic synthetic samples with Gaussian noise, wobble, dropped samples, x jitter, and isolated outliers.
7. Candidate deduplication, Pareto dominance, Simple/Balanced/Accurate selection, and constant beautification.
8. Worker request cancellation and stale-response rejection.
9. End-to-end solver cases for 2x+1, x², x³-x, 2sin(πx), x+0.5sin(3x), exp(0.7x), log(x+2), abs(x-1), 1/(x+2), exp(-x²), damped sine, chirp-like sin(x²), and random Chebyshev/Fourier curves.

Synthetic acceptance uses RMSE relative to the generated noise and checks that a concise equivalent formula outranks a high-degree polynomial with marginally lower error. Exact formula text is not required when the AST is mathematically equivalent and simpler.

Performance checks run the fast bank and complete solver on 256 samples, assert that the fast bank remains below 100 ms in the test environment, and ensure the Worker owns all long-running work. The browser smoke test verifies drawing, progressive result display, candidate switching, copy actions, and offline bundle loading.

## 11. Delivery sequence

Implementation proceeds in working increments:

1. Vite shell, canvas, viewport, stroke capture, and basic plot rendering.
2. Resampling, normalization, smoothing, noise, and core numerical utilities.
3. Polynomial and sinusoid model bank with visible fitting.
4. AST, LaTeX/plain renderers, candidate abstraction, scoring, and Pareto UI.
5. Exponential, logarithmic, absolute, rational, Gaussian, logistic, and damped models.
6. Constant beautification and simplifier.
7. Worker protocol and progressive cancellation.
8. FFT, feature analysis, symbolic grammar, semantic hashing, beam search, and universal fallback.
9. Parametric fallback, responsive polish, offline verification, synthetic tests, and benchmarks.

Every increment keeps the page runnable and ends with focused tests. The final branch must pass type checking, unit tests, production build, and the browser smoke test before it is described as complete.

## 12. Acceptance criteria

The first release is complete when a user can open the page offline, draw a curve, release the pointer, see a fitted curve and formula, switch among Simple/Balanced/Accurate, and copy LaTeX. A noisy curve close to y=2sin(πx) must have a concise trigonometric candidate such as 2 sin(πx) on its frontier. Complex valid curves must receive a stable approximation. Circles and other multi-valued strokes must receive a clear mode explanation and parametric fallback when the fallback succeeds. No long solver computation may run on the main thread.

