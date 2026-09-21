import type { Candidate, CurveData, Expr } from "../core/types";
import { add, c, mul, sin, x } from "../expr/ast";
import { brentMinimize } from "../math/brent";
import { dominantFrequencies } from "../math/fft";
import { candidateFromNormalized, fitLinearBasis } from "./helpers";

interface FrequencyFit {
  omega: number;
  coefficients: number[];
  error: number;
}

function fitAt(data: CurveData, omega: number): FrequencyFit {
  const basis = data.normalizedX.map((value) => [Math.sin(omega * value), Math.cos(omega * value), 1, value]);
  const fit = fitLinearBasis(basis, data.normalizedY, data.noise / Math.max(1e-9, data.normalization.ys));
  return { omega, coefficients: fit.coefficients, error: fit.error };
}

function expressionFor(fit: FrequencyFit): Expr {
  const a = fit.coefficients[0] ?? 0;
  const b = fit.coefficients[1] ?? 0;
  const amplitude = Math.hypot(a, b);
  const phase = Math.atan2(b, a);
  const terms: Expr[] = [mul(c(amplitude), sin(add([mul(c(fit.omega), x()), c(phase)])))];
  const slope = fit.coefficients[3] ?? 0;
  const offset = fit.coefficients[2] ?? 0;
  if (Math.abs(slope) > 1e-7) terms.push(mul(c(slope), x()));
  if (Math.abs(offset) > 1e-7) terms.push(c(offset));
  return add(terms);
}

export function fitSinusoid(data: CurveData): Candidate[] {
  const coarse = new Set<number>();
  for (let index = 1; index <= 12; index += 1) coarse.add(index * Math.PI);
  for (const peak of dominantFrequencies(data.normalizedY, 5)) coarse.add(Math.max(0.25, peak * Math.PI));
  const coarseFits = [...coarse].map((omega) => fitAt(data, omega)).sort((a, b) => a.error - b.error).slice(0, 6);
  const refined: FrequencyFit[] = [];
  for (const fit of coarseFits) {
    const minimum = brentMinimize((omega) => fitAt(data, omega).error, Math.max(0.05, fit.omega - Math.PI * 0.6), fit.omega + Math.PI * 0.6, 1e-5, 45);
    refined.push(fitAt(data, minimum.x));
  }
  return refined.map((fit) => candidateFromNormalized(expressionFor(fit), "sinusoid", data));
}
