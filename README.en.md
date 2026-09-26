# UnDraw

[English](README.en.md) · [简体中文](README.md)

**Sketch a curve. Find its equation.** [Try UnDraw](https://systina12.github.io/UnDraw/).

UnDraw finds mathematical expressions for hand-drawn curves and image traces. Fitting and edge detection run in your browser using Web Workers.

## Demo

<p align="center">
  <img src="docs/images/hand-drawn.jpg" width="230" alt="Hand-drawn input" />
  <img src="docs/images/image-edges.jpg" width="230" alt="Edges selected from an image" />
  <img src="docs/images/fitted-curves.jpg" width="230" alt="Fitted curves over the image" />
</p>

Hand-drawn input · image tracing · fitted curves

## Naiwa equations

Fourteen fitted strokes, plotted from the supplied coefficients with Python. See the [full rendered equations](docs/naiwa-expressions.md).

![Naiwa equations plotted with Python](docs/images/naiwa-equations.svg)

To redraw, install `numpy` and `matplotlib`, then run `python docs/plot_naiwa.py`.

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

## Privacy

Drawings and uploaded images are processed on your device. The page uses Cloudflare Web Analytics for site traffic.

Licensed under [MIT](LICENSE).
