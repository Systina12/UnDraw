# UnDraw · Hand-drawn Function Finder

Draw one or more curves on a mathematical coordinate plane and see compact expressions that explain them. UnDraw evaluates points locally in a Web Worker; there is no server-side fitting, account or upload. The initial view spans `[-5,5] × [-5,5]`.

## Run

Requires Node.js 22 or newer. In this repository:

```sh
npm ci
npm run dev
```

Open the address Vite prints. Draw as many strokes as you need using mouse, pen or one finger. Releasing a stroke leaves it on the canvas; **Find functions** starts calculation when you are ready. **One per stroke** keeps every stroke independent, including parametric fallback for a non-function path. **Best fit · auto count** splits substantial x reversals, tests whether a continuous piecewise stroke is simpler as several functions, and joins pieces when one expression explains them more simply. The number of fitted functions can differ from the number of strokes. The Worker streams the first results while refining the rest. **Prefer shorter formulas** is on by default with a 5% limit and every change type enabled. Open the panel to turn it off or choose a 2%, 5% or 10% deviation relative to half the height for y=f(x), or half the bounding-box diagonal for parametric curves, and independently toggle **Shift**, **Scale**, **Reshape** and **Round low-impact coefficients**. These limits apply to the RMS change from the original fit; peak change is capped at three times the limit. Coefficient rounding can use up to one quarter of the selected limit for each disabled change type. The setting works with scalar and parametric curves. Automatic function counting uses the original fits, then applies the preference to each result. Changes to settings clear the result until you click **Find functions** again. **Accurate** always shows the original fit. Choose **Simple**, **Balanced** or **Accurate** to compare candidates for every fitted function. **Copy LaTeX** and **Copy expression** copy all displayed formulas. Shift-drag or middle-drag pans, wheel or two-finger pinch zooms, and two fingers pan. **Reset view**, **Undo** (last stroke) and **Clear** (all strokes) are in the toolbar.

To produce the installable, offline-capable app:

```sh
npm run build
npm run preview
```

The first visit requires a network connection to download the app. Once the service worker has installed, a subsequent reload can run offline. The production service worker precaches the HTML, JS, CSS, solver Worker, manifest, icon and locally bundled KaTeX fonts. The development server is not the offline app. On a new deployment the waiting service worker does not take over an already open page; close existing tabs and reopen to use the new version.

## GitHub Pages

Pushing `soltest` runs `.github/workflows/deploy-pages.yml`. The workflow installs locked dependencies, runs the unit and integration tests, builds the static Vite app, and publishes `dist` to GitHub Pages. Vite's relative asset paths allow the app and its Worker to load at the repository's Pages path. GitHub Pages must use **GitHub Actions** as its publishing source.

## Tests and benchmark

```sh
npm run typecheck
npm test
npx playwright install chromium
npm run build
npm run test:e2e
npm run benchmark
```

Playwright uses the built preview and needs a locally installed Chromium; `npm run test:e2e` does not silently install it. To use a Chromium binary installed separately, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/absolute/path/to/chromium`. Browser tests exercise drawing, candidate switching, clipboard, undo, clearing, circle fallback, rapid redraw, two-finger navigation and offline reload. The benchmark emits JSON with per-stage timings (preprocess, quick bank, extended models, fallback, beautification, symbolic search, finalize), candidate counts, beam peak and Node heap observations. Timings vary by hardware and are not enforced as CI thresholds.

Reference run on 2026-09-23, Node 24.19.0 / Linux x64 / AMD EPYC 9V74, 256 resampled points, with a 700 ms progressive budget:

| Stroke | First result | Full result | Peak measured Node heap | Result |
|---|---:|---:|---:|---|
| Quadratic | 60 ms | 714 ms | 20.0 MB | quadratic polynomial |
| `2sin(πx)` | 30 ms | 527 ms | 23.0 MB | `2sin(πx)` |
| `sin(x²)` with outlier | 29 ms | 746 ms | 25.0 MB | polynomial approximation |

An atomic fit can finish shortly after the deadline. These are Node measurements; browser and mobile timings may differ.

## How the fitting works

- Pointer events become world-coordinate points; a bucket test catches multivalued `y` at the same `x`. Reversed strokes remain valid. A circle or near-vertical stroke uses arc-length `t` and yields a parametric pair instead.
- The stroke is uniformly resampled to 256 points. A lightly smoothed copy extracts features and a MAD noise estimate; the raw copy sets final fitting error. Coordinates are normalized for stable least squares and converted back for presentation.
- A QR-based fast model bank explores Chebyshev polynomials, sine/trend, Fourier, exponential, logarithm, absolute/hinge, rational, Gaussian, tanh, logistic and damped sine. Variable projection handles linear parameters, while bounded one-dimensional refinement and robust LM handle nonlinear ones.
- Bounded symbolic grammar explores less familiar compositions, with semantic signatures and beam pruning. Chebyshev and periodic Fourier approximations provide a stable fallback. Invalid domains, poles, overflow and non-finite expressions are rejected per candidate.
- A candidate pool compares fit quality against the noise floor and penalizes description length. A joint constant-replacement beam proposes integers, simple fractions, π/e multiples and radicals; every replacement is rescored on the entire stroke. The non-dominated frontier supplies Simple (smallest complexity within a noise-aware error limit), Balanced (lowest MDL score) and Accurate (lowest RMSE). With optional simplification enabled, a bounded second beam proposes shorter decimals and familiar constants; it decomposes each difference from the original fit into offset, gain and remaining shape before choosing a shorter expression within the selected tolerance.

The framework-independent core entry point is `solveCurve(points, options)` in `src/core/solver.ts`. `Point` is `{x,y,t}` in world coordinates. `src/core/progressive.ts` provides the staged asynchronous API used by `src/worker/solver.worker.ts`. The browser Worker and UI use the same core modules; no framework is required.

## First-version limits

Undo stores at most 20 snapshots. Very short strokes are skipped during a multi-stroke fit; severely discontinuous or singular curves can give low confidence, and parametric fallback currently fits `x(t)` and `y(t)` independently. Automatic function counting greedily compares mergers with a noise-aware description-length score; it may select a local optimum when many traces overlap. Progressive search has a time budget, so it may prefer a stable approximation over a recognizable closed form. Synchronous solves without an explicit time budget are bounded by structural search limits. Results express the observed domain, not a claim of global mathematical identity.
