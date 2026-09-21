import { describe, expect, it } from "vitest";
import { levenbergMarquardt } from "../src/math/lm";

describe("Levenberg-Marquardt", () => {
  it("fits a nonlinear exponential with a finite-difference Jacobian", () => {
    const xs = [-1, -0.5, 0, 0.5, 1];
    const ys = xs.map((x) => 1.5 * Math.exp(0.7 * x) - 0.25);
    const result = levenbergMarquardt([1, 0, 0], (parameters) =>
      xs.map((x, index) => parameters[0]! * Math.exp(parameters[1]! * x) + parameters[2]! - ys[index]!),
    );
    expect(result.parameters[0]).toBeCloseTo(1.5, 3);
    expect(result.parameters[1]).toBeCloseTo(0.7, 3);
    expect(result.parameters[2]).toBeCloseTo(-0.25, 3);
  });
});
