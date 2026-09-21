import { describe, expect, it } from "vitest";
import { preprocessCurve, validateFunctionStroke } from "../src/core/preprocess";
import type { Point } from "../src/core/types";

function stroke(fn: (x: number) => number, count = 80): Point[] {
  return Array.from({ length: count }, (_, index) => {
    const x = -2 + (4 * index) / (count - 1);
    return { x, y: fn(x), t: index * 10 };
  });
}

describe("curve preprocessing", () => {
  it("resamples a non-uniform stroke onto a uniform domain and estimates noise", () => {
    const points = stroke((x) => 2 * x + 1).filter((_, index) => index % 7 !== 0);
    const result = preprocessCurve(points, { samples: 64, buckets: 32 });
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.data.x).toHaveLength(64);
    expect(result.data.x[0]).toBeLessThan(-1.9);
    expect(result.data.x.at(-1)).toBeGreaterThan(1.9);
    expect(result.data.noise).toBeLessThan(0.05);
    expect(result.data.normalizedY.every(Number.isFinite)).toBe(true);
  });

  it("rejects a stroke whose x buckets contain substantial vertical spread", () => {
    const circle = Array.from({ length: 160 }, (_, index) => {
      const angle = (2 * Math.PI * index) / 159;
      return { x: 2 * Math.cos(angle), y: 2 * Math.sin(angle), t: index };
    });
    const validation = validateFunctionStroke(circle, 64);
    expect(validation.valid).toBe(false);
    expect(validation.reason).toMatch(/single-valued/i);
  });
});
