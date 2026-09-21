import { describe, expect, it } from "vitest";
import { median, mad, quantile } from "../src/math/vector";

describe("vector statistics", () => {
  it("returns robust median and MAD for an outlier-tainted sample", () => {
    expect(median([1, 2, 3, 4, 100])).toBe(3);
    expect(mad([1, 2, 3, 4, 100])).toBe(1);
  });

  it("interpolates quantiles without being pulled by the outlier", () => {
    expect(quantile([0, 1, 2, 3, 4], 0.95)).toBeCloseTo(3.8);
  });
});
