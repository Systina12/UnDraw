import { describe, expect, it } from "vitest";
import { preprocessCurve } from "../src/core/preprocess";
import { evaluateExpr } from "../src/expr/ast";
import { fitPolynomial } from "../src/models/polynomial";
import { fitSinusoid } from "../src/models/sinusoid";
import type { Point } from "../src/core/types";

function dataFor(fn: (x: number) => number): ReturnType<typeof preprocessCurve> {
  const points: Point[] = Array.from({ length: 180 }, (_, index) => {
    const x = -2 + (4 * index) / 179;
    return { x, y: fn(x), t: index };
  });
  return preprocessCurve(points, { samples: 128, buckets: 64 });
}

describe("fast model bank", () => {
  it("fits a quadratic with a low-degree polynomial", () => {
    const result = dataFor((x) => x * x - 0.5 * x + 1);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    const candidates = fitPolynomial(result.data, 4);
    const best = candidates.find((candidate) => candidate.modelFamily === "polynomial-2")!;
    expect(best.error).toBeLessThan(0.05);
    expect(best.complexity).toBeLessThan(26);
  });

  it("recovers a sinusoid from a frequency search", () => {
    const result = dataFor((x) => 2 * Math.sin(Math.PI * x));
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    const candidates = fitSinusoid(result.data);
    const best = candidates.sort((a, b) => a.error - b.error)[0]!;
    const predicted = result.data.x.map((x) => evaluateExpr(best.expr, x) ?? NaN);
    const rmse = Math.sqrt(predicted.reduce((total, value, index) => total + (value - result.data.y[index]!) ** 2, 0) / predicted.length);
    expect(rmse).toBeLessThan(0.05);
    expect(best.modelFamily).toBe("sinusoid");
  });
});
