import { describe, expect, it } from "vitest";
import { c, evaluateExpr, mul, sin, x } from "../src/expr/ast";
import { normalizedToWorld } from "../src/expr/transform";

describe("coordinate expression transform", () => {
  it("restores a normalized sine to world coordinates", () => {
    const expression = normalizedToWorld(sin(mul(c(Math.PI), x())), { xc: 0, xs: 5, yc: 0, ys: 2 });
    expect(evaluateExpr(expression, 2.5)).toBeCloseTo(2 * Math.sin(Math.PI * 0.5));
  });

  it("preserves x when no normalization is needed", () => {
    const expression = normalizedToWorld(x(), { xc: 0, xs: 1, yc: 0, ys: 1 });
    expect(evaluateExpr(expression, 0.37)).toBeCloseTo(0.37);
  });
});
