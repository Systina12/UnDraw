import type { Candidate, CurveData, Expr } from "../core/types";
import { add, c, cos, mul, sin, x } from "../expr/ast";
import { brentMinimize } from "../math/brent";
import { dominantFrequencies } from "../math/fft";
import { candidateFromNormalized, fitLinearBasis } from "./helpers";

function fitAt(data: CurveData, harmonics: number, omega: number) {
  const basis = data.normalizedX.map((value) => [1, value, ...Array.from({ length: harmonics }, (_, k) => [Math.sin((k + 1) * omega * value), Math.cos((k + 1) * omega * value)]).flat()]);
  const fit = fitLinearBasis(basis, data.normalizedY, data.noise / Math.max(1e-9, data.normalization.ys));
  return { coefficients: fit.coefficients, error: fit.error, omega };
}

function toExpression(fit: { coefficients: number[]; omega: number }, harmonics: number): Expr {
  const terms: Expr[] = [c(fit.coefficients[0] ?? 0), mul(c(fit.coefficients[1] ?? 0), x())];
  for (let k = 0; k < harmonics; k += 1) {
    const sine = fit.coefficients[2 + k * 2] ?? 0;
    const cosine = fit.coefficients[3 + k * 2] ?? 0;
    if (Math.abs(sine) > 1e-8) terms.push(mul(c(sine), sin(mul(c((k + 1) * fit.omega), x()))));
    if (Math.abs(cosine) > 1e-8) terms.push(mul(c(cosine), cos(mul(c((k + 1) * fit.omega), x()))));
  }
  return add(terms);
}

export function fitFourier(data: CurveData, maxHarmonics = 5): Candidate[] {
  const candidates: Candidate[] = [];
  const frequencies = new Set<number>(Array.from({ length: 12 }, (_, index) => (index + 1) * Math.PI));
  for (const peak of dominantFrequencies(data.normalizedY, 5)) frequencies.add(Math.max(0.1, peak * Math.PI));
  for (let harmonics = 2; harmonics <= maxHarmonics; harmonics += 1) {
    const coarse = [...frequencies].map((omega) => fitAt(data, harmonics, omega)).sort((a, b) => a.error - b.error).slice(0, 3);
    for (const item of coarse) {
      const refined = brentMinimize((omega) => fitAt(data, harmonics, omega).error, Math.max(0.05, item.omega - Math.PI * 0.5), item.omega + Math.PI * 0.5, 1e-5, 45);
      const fit = fitAt(data, harmonics, refined.x);
      candidates.push(candidateFromNormalized(toExpression(fit, harmonics), `fourier-${harmonics}`, data, true));
    }
  }
  return candidates;
}
