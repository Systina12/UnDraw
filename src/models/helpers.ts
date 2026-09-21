import type { Candidate, CurveData, Expr } from "../core/types";
import { c, x, add, mul } from "../expr/ast";
import { normalizedToWorld } from "../expr/transform";
import { leastSquares } from "../math/matrix";
import { huberWeight } from "../math/robust";
import { makeCandidate } from "../search/candidates";

export interface LinearFit {
  coefficients: number[];
  residuals: number[];
  error: number;
}

export function fitLinearBasis(basis: number[][], values: readonly number[], noise = 0.02): LinearFit {
  let weights = Array<number>(values.length).fill(1);
  let coefficients: number[] = [];
  for (let iteration = 0; iteration < 3; iteration += 1) {
    coefficients = leastSquares(basis, values, weights);
    const residuals = basis.map((row, index) => row.reduce((total, value, column) => total + value * (coefficients[column] ?? 0), 0) - (values[index] ?? 0));
    weights = residuals.map((residual) => huberWeight(residual, Math.max(1.5 * noise, 0.01)));
  }
  const residuals = basis.map((row, index) => row.reduce((total, value, column) => total + value * (coefficients[column] ?? 0), 0) - (values[index] ?? 0));
  const error = Math.sqrt(residuals.reduce((total, value) => total + value * value, 0) / Math.max(1, residuals.length));
  return { coefficients, residuals, error };
}

export function candidateFromNormalized(expression: Expr, family: string, data: CurveData, approximation = false): Candidate {
  return makeCandidate(normalizedToWorld(expression, data.normalization), family, data, approximation);
}

export function polynomialExpression(coefficients: readonly number[], variable: Expr = x()): Expr {
  const terms: Expr[] = [];
  coefficients.forEach((coefficient, power) => {
    if (Math.abs(coefficient) < 1e-9) return;
    const factor = power === 0 ? c(coefficient) : mul(c(coefficient), power === 1 ? variable : { kind: "pow", base: variable, exponent: c(power) });
    terms.push(factor);
  });
  return add(terms.length > 0 ? terms : [c(0)]);
}

export function chebyshevToPower(coefficients: readonly number[]): number[] {
  const result = Array<number>(coefficients.length).fill(0);
  const previous: number[][] = [];
  previous.push([1]);
  if (coefficients.length > 1) previous.push([0, 1]);
  for (let index = 2; index < coefficients.length; index += 1) {
    const a = previous[index - 1] ?? [];
    const b = previous[index - 2] ?? [];
    const next = Array<number>(index + 1).fill(0);
    for (let power = 0; power < a.length; power += 1) next[power + 1] = (next[power + 1] ?? 0) + 2 * (a[power] ?? 0);
    for (let power = 0; power < b.length; power += 1) next[power] = (next[power] ?? 0) - (b[power] ?? 0);
    previous.push(next);
  }
  for (let index = 0; index < coefficients.length; index += 1) {
    const polynomial = previous[index] ?? [];
    for (let power = 0; power < polynomial.length; power += 1) result[power] = (result[power] ?? 0) + (coefficients[index] ?? 0) * (polynomial[power] ?? 0);
  }
  return result;
}

export function chebyshevBasis(value: number, degree: number): number[] {
  const result = Array<number>(degree + 1).fill(0);
  result[0] = 1;
  if (degree >= 1) result[1] = value;
  for (let index = 2; index <= degree; index += 1) result[index] = 2 * value * (result[index - 1] ?? 0) - (result[index - 2] ?? 0);
  return result;
}
