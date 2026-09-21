import type { Candidate, CurveData, Expr } from "../core/types";
import { add, c, div, mul, x } from "../expr/ast";
import { leastSquares } from "../math/matrix";
import { candidateFromNormalized } from "./helpers";

function powerExpression(coefficients: readonly number[]): Expr {
  const terms: Expr[] = [];
  coefficients.forEach((coefficient, power) => {
    if (Math.abs(coefficient) < 1e-8) return;
    terms.push(power === 0 ? c(coefficient) : mul(c(coefficient), power === 1 ? x() : { kind: "pow", base: x(), exponent: c(power) }));
  });
  return add(terms.length > 0 ? terms : [c(0)]);
}

export function fitRational(data: CurveData): Candidate[] {
  const candidates: Candidate[] = [];
  for (let numeratorDegree = 0; numeratorDegree <= 3; numeratorDegree += 1) {
    for (let denominatorDegree = 1; denominatorDegree <= 2; denominatorDegree += 1) {
      const matrix = data.normalizedX.map((value, index) => {
        const y = data.normalizedY[index] ?? 0;
        const numerator = Array.from({ length: numeratorDegree + 1 }, (_, power) => value ** power);
        const denominator = Array.from({ length: denominatorDegree }, (_, power) => -y * value ** (power + 1));
        return [...numerator, ...denominator];
      });
      const solution = leastSquares(matrix, data.normalizedY);
      const numeratorCoefficients = solution.slice(0, numeratorDegree + 1);
      const denominatorCoefficients = [1, ...solution.slice(numeratorDegree + 1, numeratorDegree + denominatorDegree + 1)];
      const denominator = (value: number) => denominatorCoefficients.reduce((total, coefficient, power) => total + coefficient * value ** power, 0);
      if (data.normalizedX.some((value) => Math.abs(denominator(value)) < 1e-3)) continue;
      const denominatorExpression = powerExpression(denominatorCoefficients);
      candidates.push(candidateFromNormalized(div(powerExpression(numeratorCoefficients), denominatorExpression), `rational-${numeratorDegree}-${denominatorDegree}`, data));
    }
  }
  return candidates;
}
