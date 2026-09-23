import { describe, expect, it } from "vitest";
import { MAX_INPUT_POINTS, MAX_RESAMPLE_SAMPLES, preprocessCurve, validateFunctionStroke, resampleParametric } from "../src/core/preprocess";
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

  it("anchors bucket medians to observed x positions for an exact sampled sinusoid", () => {
    const points = stroke((x) => 2 * Math.sin(Math.PI * x), 180);
    const result = preprocessCurve(points);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    const rmse = Math.sqrt(result.data.y.reduce((total, value, index) => {
      const difference = value - 2 * Math.sin(Math.PI * (result.data.x[index] ?? 0));
      return total + difference * difference;
    }, 0) / result.data.y.length);
    expect(rmse).toBeLessThan(0.005);
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

  it("rejects finite coordinates whose derived range overflows", () => {
    const alternating = Array.from({ length: 320 }, (_, index) => ({
      x: -1 + (2 * index) / 319,
      y: index % 2 === 0 ? -1e308 : 1e308,
      t: index,
    }));
    expect(validateFunctionStroke(alternating, 32).valid).toBe(false);
  });

  it("clamps pathological sampling requests and input sizes", () => {
    const points = Array.from({ length: MAX_INPUT_POINTS + 100 }, (_, index) => {
      const x = -2 + (4 * index) / (MAX_INPUT_POINTS + 99);
      return { x, y: x * x, t: index };
    });
    const result = preprocessCurve(points, { samples: 1e9, buckets: 1e9 });
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.data.sourcePoints).toHaveLength(MAX_INPUT_POINTS);
    expect(result.data.x).toHaveLength(MAX_RESAMPLE_SAMPLES);
    expect(resampleParametric(points.slice(0, 8), 1).t).toHaveLength(16);
  });

  it("keeps malformed and overflow-prone point payloads from escaping preprocessing", () => {
    const malformed = preprocessCurve([null, { x: 0, y: 0, t: 0 }] as unknown as Point[]);
    expect(malformed.kind).toBe("invalid");
    const sampled = resampleParametric([
      { x: -Number.MAX_VALUE, y: 0, t: 0 },
      { x: Number.MAX_VALUE, y: 1, t: 1 },
    ]);
    expect(sampled.x.every(Number.isFinite)).toBe(true);
    expect(sampled.y.every(Number.isFinite)).toBe(true);
  });
});
