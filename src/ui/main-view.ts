import katex from "katex";
import type { CandidateResult, SolveResult, WorkerResponse } from "../core/types";
import { CoordinateCanvas } from "./canvas";
import { formatParametricLatex, formatParametricPlain } from "./presentation";
import { SolverWorkerClient } from "../worker/client";

export function mountApplication(root: HTMLElement): void {
  root.innerHTML = `
    <main class="app-shell">
      <header class="hero">
        <div>
          <p class="eyebrow">INVERSE DOODLING · MILKFIT</p>
          <h1>Draw<span>⁻¹</span></h1>
          <p class="subtitle">Sketch a curve. Discover its shortest mathematical description.</p>
        </div>
        <div class="hint">Drag to draw · Shift/Alt + drag to pan · Wheel to zoom</div>
      </header>
      <section class="workspace" aria-label="Function finder">
        <div class="canvas-wrap">
          <canvas aria-label="Mathematical coordinate plane"></canvas>
          <div class="canvas-badge" data-testid="status">Ready to draw</div>
        </div>
        <aside class="results" aria-live="polite">
          <div class="formula-card">
            <div class="formula-label">BEST DESCRIPTION</div>
            <div class="formula" data-testid="latex-expression">Draw a curve to begin</div>
            <div class="plain-expression" data-testid="plain-expression"></div>
            <div class="quality" data-testid="quality"></div>
          </div>
          <div class="modes" role="group" aria-label="Candidate simplicity">
            <button class="mode-button" data-mode="simple">Simple</button>
            <button class="mode-button active" data-mode="balanced">Balanced</button>
            <button class="mode-button" data-mode="accurate">Accurate</button>
          </div>
          <div class="candidate-meta" data-testid="candidate-meta"></div>
          <div class="actions">
            <button data-action="copy-latex">Copy LaTeX</button>
            <button data-action="copy-plain">Copy expression</button>
            <button data-action="undo">Undo</button>
            <button data-action="clear" class="quiet">Clear</button>
            <button data-action="reset" class="quiet">Reset view</button>
          </div>
          <div class="diagnostics" data-testid="diagnostics"></div>
        </aside>
      </section>
      <footer>All computation stays in your browser · no server · Web Worker powered</footer>
    </main>`;

  const canvas = root.querySelector("canvas");
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Canvas was not mounted");
  const formula = root.querySelector<HTMLElement>('[data-testid="latex-expression"]')!;
  const plain = root.querySelector<HTMLElement>('[data-testid="plain-expression"]')!;
  const quality = root.querySelector<HTMLElement>('[data-testid="quality"]')!;
  const status = root.querySelector<HTMLElement>('[data-testid="status"]')!;
  const meta = root.querySelector<HTMLElement>('[data-testid="candidate-meta"]')!;
  const diagnostics = root.querySelector<HTMLElement>('[data-testid="diagnostics"]')!;
  let result: SolveResult | null = null;
  let selected: CandidateResult | null = null;
  const client = new SolverWorkerClient(() => new Worker(new URL("../worker/solver.worker.ts", import.meta.url), { type: "module" }));
  const plot = new CoordinateCanvas(canvas, (points) => {
    status.textContent = "Analyzing stroke…";
    client.solve(points, plot.getViewport(), { timeBudgetMs: 1500 }, (response) => handleResponse(response));
  });

  function handleResponse(response: WorkerResponse): void {
    if (response.type === "progress" && response.candidate) {
      selected = response.candidate;
      renderCandidate(response.candidate, "Finding a simpler description…");
    } else if (response.type === "invalid") {
      result = null;
      selected = null;
      status.textContent = "Needs a different stroke";
      formula.textContent = response.reason;
      plain.textContent = "";
      quality.textContent = "";
      meta.textContent = "Try a single-valued y=f(x) curve, or draw a longer stroke.";
    } else if (response.type === "done") {
      result = response.result;
      selected = response.result.balanced;
      plot.setResult(result, selected);
      const qualityText = response.result.quality === "excellent" ? "Excellent match" : response.result.quality === "good" ? "Good match" : response.result.quality === "approximation" ? "Approximation" : "Low confidence";
      if (response.result.mode === "parametric" && response.result.parametric) {
        formula.innerHTML = katex.renderToString(formatParametricLatex(response.result.parametric.x, response.result.parametric.y), { displayMode: true, throwOnError: false });
        plain.textContent = formatParametricPlain(response.result.parametric.x, response.result.parametric.y);
        quality.textContent = qualityText;
        meta.textContent = `parametric · x(t) and y(t) · t ∈ [0, 1]`;
      } else {
        renderCandidate(selected, qualityText);
      }
      diagnostics.textContent = `${response.result.diagnostics.candidatesFitted} candidates · ${Math.round(response.result.diagnostics.runtimeMs)} ms`;
      status.textContent = response.result.mode === "parametric" ? "Parametric fallback" : "Curve fitted";
    }
  }

  function renderCandidate(candidate: CandidateResult | null, qualityText: string): void {
    if (!candidate) return;
    formula.innerHTML = katex.renderToString(candidate.latex, { displayMode: true, throwOnError: false });
    plain.textContent = candidate.plain;
    quality.textContent = qualityText;
    meta.textContent = `${candidate.modelFamily ?? "model"} · RMSE ${candidate.rmse.toPrecision(3)} · complexity ${candidate.complexity.toFixed(1)}`;
    plot.setResult(result, candidate);
  }

  root.querySelectorAll<HTMLButtonElement>(".mode-button").forEach((button) => button.addEventListener("click", () => {
    if (!result) return;
    const mode = button.dataset.mode;
    selected = mode === "simple" ? result.simple : mode === "accurate" ? result.accurate : result.balanced;
    root.querySelectorAll(".mode-button").forEach((item) => item.classList.toggle("active", item === button));
    renderCandidate(selected, result.quality === "excellent" ? "Excellent match" : result.quality === "good" ? "Good match" : "Approximation");
  }));
  root.querySelector<HTMLButtonElement>('[data-action="clear"]')?.addEventListener("click", () => { client.cancel(); result = null; selected = null; plot.clear(); status.textContent = "Ready to draw"; formula.textContent = "Draw a curve to begin"; plain.textContent = ""; quality.textContent = ""; meta.textContent = ""; diagnostics.textContent = ""; });
  root.querySelector<HTMLButtonElement>('[data-action="undo"]')?.addEventListener("click", () => { client.cancel(); plot.undo(); status.textContent = "Ready to draw"; });
  root.querySelector<HTMLButtonElement>('[data-action="reset"]')?.addEventListener("click", () => plot.resetView());
  root.querySelector<HTMLButtonElement>('[data-action="copy-latex"]')?.addEventListener("click", () => { if (selected) void navigator.clipboard?.writeText(`y = ${selected.latex}`); });
  root.querySelector<HTMLButtonElement>('[data-action="copy-plain"]')?.addEventListener("click", () => { if (selected) void navigator.clipboard?.writeText(`y = ${selected.plain}`); });
}
