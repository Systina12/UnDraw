import { describe, expect, it } from "vitest";
import { preprocessCurve } from "../src/core/preprocess";
import { analyzeFeatures } from "../src/core/features";
import type { Point } from "../src/core/types";

describe("curve features", () => {
  it("detects extrema and spectral structure in a periodic curve", () => {
    const points: Point[] = Array.from({ length: 160 }, (_, index) => {
      const x = -Math.PI * 2 + (Math.PI * 4 * index) / 159;
      return { x, y: Math.sin(3 * x), t: index };
    });
    const result = preprocessCurve(points, { samples: 128, buckets: 64 });
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    const features = analyzeFeatures(result.data);
    expect(features.extrema).toBeGreaterThanOrEqual(4);
    expect(features.zeroCrossings).toBeGreaterThanOrEqual(5);
    expect(features.spectralPeaks.length).toBeGreaterThan(0);
    expect(features.periodicity).toBeGreaterThan(0.3);
  });
});
