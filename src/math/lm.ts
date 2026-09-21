import { leastSquares } from "./matrix";
import { huberError, huberWeight } from "./robust";

export interface LMOptions {
  maxIterations?: number;
  maxParams?: number;
  delta?: number;
  initialLambda?: number;
  tolerance?: number;
}

export interface LMResult {
  parameters: number[];
  residuals: number[];
  error: number;
  iterations: number;
  converged: boolean;
}

function finiteResiduals(residuals: readonly number[]): number[] {
  return residuals.map((value) => (Number.isFinite(value) ? value : 1e6));
}

export function levenbergMarquardt(
  initial: readonly number[],
  residualFunction: (parameters: readonly number[]) => number[],
  options: LMOptions = {},
): LMResult {
  const maxIterations = options.maxIterations ?? 60;
  const maxParams = options.maxParams ?? 8;
  const delta = options.delta ?? 1;
  const tolerance = options.tolerance ?? 1e-8;
  let parameters = initial.slice(0, maxParams);
  let residuals = finiteResiduals(residualFunction(parameters));
  let error = huberError(residuals, delta);
  let lambda = options.initialLambda ?? 1e-2;
  let converged = false;

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const jacobian = residuals.map((_, row) => parameters.map((parameter, column) => {
      const step = 1e-5 * Math.max(1, Math.abs(parameter));
      const plus = parameters.slice();
      const minus = parameters.slice();
      plus[column] = parameter + step;
      minus[column] = parameter - step;
      const plusResidual = finiteResiduals(residualFunction(plus))[row] ?? 1e6;
      const minusResidual = finiteResiduals(residualFunction(minus))[row] ?? 1e6;
      return (plusResidual - minusResidual) / (2 * step);
    }));
    const weights = residuals.map((residual) => huberWeight(residual, delta));
    const augmentedA = jacobian.map((row, index) => row.map((value) => Math.sqrt(weights[index] ?? 1) * value));
    const augmentedB = residuals.map((residual, index) => -Math.sqrt(weights[index] ?? 1) * residual);
    const parameterCount = parameters.length;
    for (let diagonal = 0; diagonal < parameterCount; diagonal += 1) {
      const row = Array<number>(parameterCount).fill(0);
      row[diagonal] = Math.sqrt(lambda);
      augmentedA.push(row);
      augmentedB.push(0);
    }
    const step = leastSquares(augmentedA, augmentedB);
    const trial = parameters.map((parameter, index) => parameter + (step[index] ?? 0));
    const trialResiduals = finiteResiduals(residualFunction(trial));
    const trialError = huberError(trialResiduals, delta);
    if (trialError < error) {
      const improvement = error - trialError;
      parameters = trial;
      residuals = trialResiduals;
      error = trialError;
      lambda = Math.max(1e-10, lambda * 0.35);
      if (improvement < tolerance || Math.sqrt(step.reduce((total, value) => total + value * value, 0)) < tolerance) {
        converged = true;
        return { parameters, residuals, error, iterations: iteration + 1, converged };
      }
    } else {
      lambda = Math.min(1e12, lambda * 4);
    }
  }
  return { parameters, residuals, error, iterations: maxIterations, converged };
}
