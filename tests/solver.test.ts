import { describe, expect, it } from "vitest";
import { solveCurve } from "../src/core/solver";
import type { Point } from "../src/core/types";

function stroke(fn: (x: number) => number, count = 180): Point[] {
  return Array.from({ length: count }, (_, index) => {
    const x = -2 + (4 * index) / (count - 1);
    return { x, y: fn(x), t: index };
  });
}

describe("curve solver", () => {
  it("returns a human-readable sinusoid and three presentations", () => {
    const result = solveCurve(stroke((x) => 2 * Math.sin(Math.PI * x)), { timeBudgetMs: 1500 });
    expect(result.mode).toBe("function");
    if (result.mode !== "function") return;
    expect(result.best.plain).toMatch(/sin/);
    expect(result.best.plain).toContain("π");
    expect(result.best.plain).toMatch(/2/);
    expect(result.simple).toBeDefined();
    expect(result.balanced).toBeDefined();
    expect(result.accurate).toBeDefined();
    expect(result.quality).toMatch(/excellent|good/);
  });

  it("returns a parametric fallback for a circle", () => {
    const points = Array.from({ length: 180 }, (_, index) => {
      const angle = (2 * Math.PI * index) / 179;
      return { x: 3 * Math.cos(angle), y: 3 * Math.sin(angle), t: index };
    });
    const result = solveCurve(points, { timeBudgetMs: 1500, parametricFallback: true });
    expect(result.mode).toBe("parametric");
    if (result.mode !== "parametric") return;
    expect(result.parametric?.x.plain).toMatch(/cos|sin/);
    expect(result.parametric?.y.plain).toMatch(/sin|cos/);
    expect(result.parametric?.x.plain).toMatch(/2π/);
    expect(result.parametric?.y.plain).toMatch(/2π/);
  }, 15_000);

  it("keeps a specialized exponential model when it reaches the noise floor", () => {
    const result = solveCurve(stroke((x) => Math.exp(0.7 * x)), { timeBudgetMs: 1500 });
    expect(result.mode).toBe("function");
    if (result.mode !== "function") return;
    expect(result.best.modelFamily).toBe("exponential");
    expect(result.best.plain).toMatch(/exp|e\^/);
  });
});
