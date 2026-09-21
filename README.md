# Draw⁻¹ — Hand-drawn Function Finder

Draw a curve on a mathematical coordinate plane and get a compact fitted expression. The application is a vanilla TypeScript + Vite frontend; fitting runs in a replaceable Web Worker and never requires a server.

## Development

```bash
npm install
npm run dev
```

Checks:

```bash
npm test
npm run build
npm run test:e2e
```

The browser smoke test needs a locally installed Playwright Chromium. The solver itself is covered by deterministic synthetic tests for polynomials, sinusoids, exponentials, logarithms, absolute/hinge curves, rational curves, Gaussian/tanh/logistic shapes, damped sinusoids, symbolic compositions, constant beautification, and the parametric fallback.

## Interaction

- Drag on the plane to draw; release to solve.
- Shift/Alt-drag or middle-drag pans the view.
- Wheel zooms around the pointer.
- `Simple`, `Balanced`, and `Accurate` select points from the Pareto frontier.
- Copy buttons export LaTeX or a plain expression.

All expressions are represented by the shared `Expr` AST. Numerical preprocessing, candidate producers, scoring, symbolic search, and constant beautification are independent of the UI, so the solver can be moved to Node, Electron, WASM, or another frontend later.
