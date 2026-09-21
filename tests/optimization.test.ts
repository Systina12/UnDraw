import { describe, expect, it } from "vitest";
import { brentMinimize } from "../src/math/brent";
import { huberLoss, huberWeight } from "../src/math/robust";

describe("optimization primitives", () => {
  it("finds a one-dimensional minimum", () => {
    const result = brentMinimize((x) => (x - 1.75) ** 2 + 3, -2, 5);
    expect(result.x).toBeCloseTo(1.75, 5);
    expect(result.value).toBeCloseTo(3, 5);
  });

  it("uses quadratic loss near zero and linear tails for Huber loss", () => {
    expect(huberWeight(0.1, 1)).toBe(1);
    expect(huberWeight(3, 1)).toBeCloseTo(1 / 3);
    expect(huberLoss(0.5, 1)).toBeCloseTo(0.125);
    expect(huberLoss(3, 1)).toBeCloseTo(2.5);
  });
});
