import { describe, expect, it } from "vitest";
import { preprocessCurve } from "../src/core/preprocess";
import { searchSymbolic } from "../src/search/symbolic";
import type { Point } from "../src/core/types";

describe("bounded symbolic search", () => {
  it("finds a compact unary composition for sin(x squared)", () => {
    const points: Point[] = Array.from({ length: 180 }, (_, index) => {
      const x = -2 + (4 * index) / 179;
      return { x, y: Math.sin(x * x), t: index };
    });
    const result = preprocessCurve(points, { samples: 128, buckets: 64 });
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    const candidates = searchSymbolic(result.data, 12);
    expect(candidates.length).toBeGreaterThan(0);
    expect(Math.min(...candidates.map((candidate) => candidate.error))).toBeLessThan(0.35);
  });
});
