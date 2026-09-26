# UnDraw

[English](README.md) · [简体中文 (coming soon)](README.zh-CN.md)

**Sketch a curve. Find its equation.** [Try UnDraw](https://systina12.github.io/UnDraw/).

UnDraw finds mathematical expressions for hand-drawn curves and image traces. Fitting and edge detection run in your browser using Web Workers.

## How to use

1. Draw one or more strokes on the coordinate plane, or **Upload image** and tap the edges you want to fit. Use **Draw by hand** to trace over an image.
2. Choose **One per stroke** or **Best fit · auto count**, then click **Find functions**. Results appear progressively. Drawing a new stroke interrupts the current calculation.
3. Compare **Simple**, **Balanced**, and **Accurate** (selected by default). **Prefer shorter formulas** can trade a little visual accuracy for simpler coefficients; its default limit is 5%. Copy the result as LaTeX or plain text.

Use Shift-drag or middle-drag to pan, the wheel or two fingers to zoom, and **Undo**, **Clear**, or **Reset view** as needed. Curves that cannot be written as `y = f(x)` may receive parametric `x(t)` and `y(t)` expressions.

## Run locally

Requires Node.js 22 or newer.

```sh
npm ci
npm run dev
```

Run `npm test` for the test suite or `npm run build` for the installable, offline-capable production site. After its first online visit, the production app can calculate offline. The UI uses Canvas and KaTeX; the framework-independent solver exports `solveCurve(points, options)` from `src/core/solver.ts`.

## Privacy and limitations

Drawings and uploaded images are processed on your device. The page uses Cloudflare Web Analytics for site traffic. Fitted expressions approximate the observed strokes; noisy images and overlapping edges may need manual tracing.

Licensed under [MIT](LICENSE).
