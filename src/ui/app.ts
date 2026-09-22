export function createAppShell(root: HTMLElement): HTMLCanvasElement {
  root.innerHTML = `<main class="app-shell">
    <header><h1>UnDraw</h1><p>Draw a curve</p></header>
    <canvas aria-label="Coordinate plane"></canvas>
  </main>`;
  return root.querySelector('canvas')!;
}
