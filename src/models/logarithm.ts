import type { Candidate, CurveData, Expr } from "../core/types";
import { add, c, log, mul, x } from "../expr/ast";
import { brentMinimize } from "../math/brent";
import { candidateFromNormalized, fitLinearBasis } from "./helpers";

function expressionFor(coefficients: readonly number[], breakpoint: number, reflected: boolean): Expr {
  const input = reflected ? add([c(breakpoint), mul(c(-1), x())]) : add([x(), c(-breakpoint)]);
  return add([mul(c(coefficients[0] ?? 0), log(input)), c(coefficients[1] ?? 0)]);
}

export function fitLogarithm(data: CurveData): Candidate[] {
  const candidates: Candidate[] = [];
  for (const reflected of [false, true]) {
    const minBreakpoint = reflected ? 1.02 : -8;
    const maxBreakpoint = reflected ? 8 : -1.02;
    const fitAt = (breakpoint: number) => {
      const valid = data.normalizedX.every((value) => (reflected ? breakpoint - value : value - breakpoint) > 1e-5);
      if (!valid) return { breakpoint, coefficients: [0, 0], error: 1e6 };
      const basis = data.normalizedX.map((value) => [Math.log(reflected ? breakpoint - value : value - breakpoint), 1]);
      const fit = fitLinearBasis(basis, data.normalizedY, data.noise / Math.max(1e-9, data.normalization.ys));
      return { breakpoint, coefficients: fit.coefficients, error: fit.error };
    };
    const coarse = Array.from({ length: 40 }, (_, index) => minBreakpoint + ((maxBreakpoint - minBreakpoint) * index) / 39).map(fitAt).sort((a, b) => a.error - b.error).slice(0, 3);
    for (const item of coarse) {
      const refined = brentMinimize((value) => fitAt(value).error, Math.min(minBreakpoint, item.breakpoint - 0.01), Math.max(maxBreakpoint, item.breakpoint + 0.01), 1e-5, 45);
      const fit = fitAt(refined.x);
      candidates.push(candidateFromNormalized(expressionFor(fit.coefficients, refined.x, reflected), "logarithm", data));
    }
  }
  return candidates;
}
