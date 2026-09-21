import { describe, expect, it } from "vitest";
import { formatParametricLatex, formatParametricPlain, parametricPlot } from "../src/ui/presentation";
import type { CandidateResult } from "../src/core/types";
import { c, cos, mul, sin, x } from "../src/expr/ast";

const candidate = (latex: string, plain: string, expr = x()): CandidateResult => ({
  expr, latex, plain, rmse: 0, normalizedRmse: 0, robustError: 0, maxError: 0, complexity: 1, score: 0, plot: { x: [], y: [] },
});

describe("parametric presentation", () => {
  it("shows both coordinate equations", () => {
    const xCandidate = candidate("3\\cos(2\\pi x)", "3*cos(2πx)", mul(c(3), cos(mul(c(2 * Math.PI), x()))));
    const yCandidate = candidate("3\\sin(2\\pi x)", "3*sin(2πx)", mul(c(3), sin(mul(c(2 * Math.PI), x()))));
    const latex = formatParametricLatex(xCandidate, yCandidate);
    const plain = formatParametricPlain(xCandidate, yCandidate);
    expect(latex).toContain("x(t)");
    expect(latex).toContain("y(t)");
    expect(plain).toContain("x(t)");
    expect(plain).toContain("y(t)");
    expect(plain).toMatch(/\\*t/);
    expect(plain).not.toContain("2πx");
  });

  it("maps parametric candidate outputs into a world-space curve", () => {
    const xCandidate = candidate("x(t)", "x(t)", x());
    const yCandidate = candidate("y(t)", "y(t)", x());
    xCandidate.plot = { x: [0, 0.5, 1], y: [3, 2, 1] };
    yCandidate.plot = { x: [0, 0.5, 1], y: [0, 1, 0] };

    expect(parametricPlot(xCandidate, yCandidate)).toEqual({
      x: [3, 2, 1],
      y: [0, 1, 0],
    });
  });
});
