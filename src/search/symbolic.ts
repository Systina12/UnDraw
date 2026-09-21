import type { Candidate, CurveData, Expr } from "../core/types";
import { abs, add, c, cos, div, exp, log, mul, pow, sin, sqrt, x } from "../expr/ast";
import { complexity } from "../expr/canonical";
import { evaluateExpr } from "../expr/ast";
import { CandidatePool } from "./candidates";
import { candidateFromNormalized, fitLinearBasis } from "../models/helpers";

function fitShape(shape: Expr, family: string, data: CurveData): Candidate | null {
  const values = data.normalizedX.map((value) => evaluateExpr(shape, value));
  if (values.some((value) => value === null || !Number.isFinite(value))) return null;
  const fit = fitLinearBasis(values.map((value) => [value ?? 0, 1]), data.normalizedY, data.noise / Math.max(1e-9, data.normalization.ys));
  const expression = add([mul(c(fit.coefficients[0] ?? 0), shape), c(fit.coefficients[1] ?? 0)]);
  return candidateFromNormalized(expression, family, data);
}

function unaryShapes(): Expr[] {
  const variable = x();
  const squared = pow(variable, c(2));
  const shiftedAbs = abs(add([variable, c(-0.25)]));
  return [
    variable,
    abs(variable),
    squared,
    pow(variable, c(3)),
    sin(variable),
    cos(variable),
    exp(variable),
    exp(mul(c(-1), variable)),
    log(add([abs(variable), c(1)])),
    sqrt(add([abs(variable), c(1)])),
    sin(squared),
    cos(squared),
    sin(mul(c(2), squared)),
    sin(mul(c(4), squared)),
    cos(mul(c(2), squared)),
    cos(mul(c(4), squared)),
    shiftedAbs,
  ];
}

export function searchSymbolic(data: CurveData, maxComplexity = 12): Candidate[] {
  const pool = new CandidatePool(data, 300);
  const shapes = unaryShapes().filter((shape) => complexity(shape) <= maxComplexity);
  for (const shape of shapes) {
    const candidate = fitShape(shape, "symbolic", data);
    if (candidate) pool.add(candidate);
  }
  const binary = shapes.slice(0, 9);
  for (let left = 0; left < binary.length; left += 1) {
    for (let right = left; right < binary.length; right += 1) {
      const a = binary[left]!;
      const b = binary[right]!;
      const structures = [add([a, b]), mul([a, b]), div(a, add([c(1), abs(b)]))];
      for (const structure of structures) {
        if (complexity(structure) > maxComplexity) continue;
        const candidate = fitShape(structure, "symbolic", data);
        if (candidate) pool.add(candidate);
      }
    }
  }
  return pool.all().slice(0, 60);
}
