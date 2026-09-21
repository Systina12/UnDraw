import type { Candidate, CurveData, Expr } from "../core/types";
import { add, c, exp, mul, x } from "../expr/ast";
import { brentMinimize } from "../math/brent";
import { candidateFromNormalized, fitLinearBasis } from "./helpers";

function expressionFor(coefficients: readonly number[], b: number): Expr {
  return add([mul(c(coefficients[0] ?? 0), exp(mul(c(b), x()))), c(coefficients[1] ?? 0)]);
}

export function fitExponential(data: CurveData): Candidate[] {
  const coarse = Array.from({ length: 65 }, (_, index) => -8 + (16 * index) / 64);
  const fitAt = (b: number) => {
    const basis = data.normalizedX.map((value) => [Math.exp(Math.max(-30, Math.min(30, b * value))), 1]);
    const fit = fitLinearBasis(basis, data.normalizedY, data.noise / Math.max(1e-9, data.normalization.ys));
    return { b, coefficients: fit.coefficients, error: fit.error };
  };
  const selected = coarse.map(fitAt).sort((a, b) => a.error - b.error).slice(0, 4);
  return selected.map((item) => {
    const refined = brentMinimize((b) => fitAt(b).error, item.b - 0.4, item.b + 0.4, 1e-5, 50);
    const fit = fitAt(refined.x);
    return candidateFromNormalized(expressionFor(fit.coefficients, refined.x), "exponential", data);
  });
}
