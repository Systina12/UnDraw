import type { Candidate, CurveData } from "../core/types";
import { candidateFromNormalized, chebyshevBasis, chebyshevToPower, fitLinearBasis, polynomialExpression } from "./helpers";

export function fitPolynomial(data: CurveData, maxDegree = 8): Candidate[] {
  const candidates: Candidate[] = [];
  const degreeLimit = Math.min(8, Math.max(0, maxDegree));
  for (let degree = 0; degree <= degreeLimit; degree += 1) {
    const basis = data.normalizedX.map((value) => chebyshevBasis(value, degree));
    const fit = fitLinearBasis(basis, data.normalizedY, data.noise / Math.max(1e-9, data.normalization.ys));
    const power = chebyshevToPower(fit.coefficients);
    candidates.push(candidateFromNormalized(polynomialExpression(power), `polynomial-${degree}`, data));
  }
  return candidates;
}
