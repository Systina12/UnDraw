import { describe, expect, it } from "vitest";
import { c, x } from "../src/expr/ast";
import { CandidatePool, makeCandidate, selectPresentationCandidates } from "../src/search/candidates";
import type { Candidate, CurveData } from "../src/core/types";

const data = {
  raw: [-1, -0.5, 0, 0.5, 1].map((value, index) => ({ x: value, y: value, t: index })),
  smooth: [], normalized: [], x: [-1, -0.5, 0, 0.5, 1], y: [-1, -0.5, 0, 0.5, 1], smoothY: [],
  normalizedX: [], normalizedY: [], normalization: { xc: 0, xs: 1, yc: 0, ys: 1 }, domain: [-1, 1] as [number, number], noise: 0.02, sourcePoints: [],
} satisfies CurveData;

describe("candidate pool", () => {
  it("deduplicates semantic equivalents and keeps the lower-complexity candidate", () => {
    const pool = new CandidatePool(data);
    pool.add(makeCandidate(x(), "linear", data));
    pool.add(makeCandidate(c(1), "constant", data));
    pool.add(makeCandidate(x(), "duplicate", data));
    expect(pool.all()).toHaveLength(2);
    expect(pool.all().some((candidate) => candidate.modelFamily === "duplicate")).toBe(false);
  });

  it("selects simple, balanced, and accurate presentations", () => {
    const pool = new CandidatePool(data);
    pool.add(makeCandidate(c(0), "constant", data));
    pool.add(makeCandidate(x(), "linear", data));
    const selections = selectPresentationCandidates(pool.frontier(), data.noise);
    expect(selections.simple.expr.kind).toBe("x");
    expect(selections.accurate.expr.kind).toBe("x");
  });

  it("uses the lowest-MDL candidate for Balanced even when a simpler fit is within tolerance", () => {
    const simpler: Candidate = {
      expr: x(), params: [], error: 0.11, robustError: 0.1, maxError: 0.2,
      complexity: 2, score: -10, signature: "simpler", modelFamily: "simpler", approximation: false,
    };
    const mdlWinner: Candidate = {
      expr: x(), params: [], error: 0.1, robustError: 0.09, maxError: 0.18,
      complexity: 4, score: -20, signature: "mdl-winner", modelFamily: "mdl-winner", approximation: false,
    };

    const selections = selectPresentationCandidates([simpler, mdlWinner], 0.1);

    expect(selections.simple.modelFamily).toBe("simpler");
    expect(selections.balanced.modelFamily).toBe("mdl-winner");
    expect(selections.accurate.modelFamily).toBe("mdl-winner");
  });
});
