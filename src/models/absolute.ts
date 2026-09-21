import type { Candidate, CurveData, Expr } from "../core/types";
import { abs, add, c, mul, x } from "../expr/ast";
import { candidateFromNormalized, fitLinearBasis } from "./helpers";

function modelExpression(coefficients: readonly number[], breakpoint: number, hinge: boolean): Expr {
  const absolute = abs(add([x(), c(-breakpoint)]));
  if (hinge) return add([mul(c(coefficients[0] ?? 0), absolute), mul(c(coefficients[1] ?? 0), x()), c(coefficients[2] ?? 0)]);
  return add([mul(c(coefficients[0] ?? 0), absolute), c(coefficients[1] ?? 0)]);
}

export function fitAbsolute(data: CurveData): Candidate[] {
  const candidates: Candidate[] = [];
  for (let index = 0; index <= 32; index += 1) {
    const breakpoint = -1 + (2 * index) / 32;
    const absolute = data.normalizedX.map((value) => Math.abs(value - breakpoint));
    const simple = fitLinearBasis(absolute.map((value) => [value, 1]), data.normalizedY, data.noise / Math.max(1e-9, data.normalization.ys));
    candidates.push(candidateFromNormalized(modelExpression(simple.coefficients, breakpoint, false), "absolute", data));
    const hinge = fitLinearBasis(absolute.map((value, row) => [value, data.normalizedX[row] ?? 0, 1]), data.normalizedY, data.noise / Math.max(1e-9, data.normalization.ys));
    candidates.push(candidateFromNormalized(modelExpression(hinge.coefficients, breakpoint, true), "hinge", data));
  }
  return candidates;
}
