import type { Candidate, CurveData, Expr } from "../core/types";
import { add, c, div, exp, mul, pow, sin, tanh, x } from "../expr/ast";
import { levenbergMarquardt } from "../math/lm";
import { candidateFromNormalized } from "./helpers";

function sampledData(data: CurveData): { xs: number[]; ys: number[] } {
  const step = Math.max(1, Math.ceil(data.normalizedX.length / 128));
  const xs = data.normalizedX.filter((_, index) => index % step === 0);
  const ys = data.normalizedY.filter((_, index) => index % step === 0);
  return { xs, ys };
}

function bestStarts(data: CurveData, starts: number[][], residual: (parameters: readonly number[]) => number[], expression: (parameters: readonly number[]) => Expr, family: string): Candidate[] {
  const candidates: Candidate[] = [];
  for (const start of starts) {
    const fit = levenbergMarquardt(start, residual, { maxIterations: 28, maxParams: 8, delta: Math.max(1.5 * data.noise / Math.max(1e-9, data.normalization.ys), 0.01) });
    const parameters = fit.parameters;
    if (parameters.some((value) => !Number.isFinite(value))) continue;
    candidates.push(candidateFromNormalized(expression(parameters), family, data));
  }
  return candidates;
}

export function fitGaussian(data: CurveData): Candidate[] {
  const { xs, ys } = sampledData(data);
  const residual = (parameters: readonly number[]) => xs.map((value, index) => {
    const width = Math.max(0.04, Math.abs(parameters[2] ?? 0.5));
    return (parameters[0] ?? 0) * Math.exp(-(((value - (parameters[1] ?? 0)) / width) ** 2)) + (parameters[3] ?? 0) - (ys[index] ?? 0);
  });
  const expression = (parameters: readonly number[]) => add([mul(c(parameters[0] ?? 0), exp(mul(c(-1), pow(mul(c(1 / Math.max(0.04, Math.abs(parameters[2] ?? 0.5))), add([x(), c(-(parameters[1] ?? 0))])), c(2))))), c(parameters[3] ?? 0)]);
  const amplitude = Math.max(...ys) - Math.min(...ys);
  return bestStarts(data, [[amplitude, 0, 0.5, Math.min(...ys)], [amplitude, 0, 0.25, 0]], residual, expression, "gaussian");
}

export function fitTanh(data: CurveData): Candidate[] {
  const { xs, ys } = sampledData(data);
  const residual = (parameters: readonly number[]) => xs.map((value, index) => (parameters[0] ?? 0) * Math.tanh((parameters[1] ?? 1) * value + (parameters[2] ?? 0)) + (parameters[3] ?? 0) - (ys[index] ?? 0));
  const expression = (parameters: readonly number[]) => add([mul(c(parameters[0] ?? 0), tanh(add([mul(c(parameters[1] ?? 1), x()), c(parameters[2] ?? 0)]))), c(parameters[3] ?? 0)]);
  const amplitude = (Math.max(...ys) - Math.min(...ys)) / 2;
  return bestStarts(data, [[amplitude, 1, 0, 0], [amplitude, 3, 0, 0]], residual, expression, "tanh");
}

export function fitLogistic(data: CurveData): Candidate[] {
  const { xs, ys } = sampledData(data);
  const residual = (parameters: readonly number[]) => xs.map((value, index) => {
    const b = parameters[1] ?? 1;
    const center = parameters[2] ?? 0;
    const sigmoid = 1 / (1 + Math.exp(Math.max(-30, Math.min(30, -b * (value - center)))));
    return (parameters[0] ?? 1) * sigmoid + (parameters[3] ?? 0) - (ys[index] ?? 0);
  });
  const expression = (parameters: readonly number[]) => add([div(c(parameters[0] ?? 1), add([c(1), exp(mul(c(-(parameters[1] ?? 1)), add([x(), c(-(parameters[2] ?? 0))])))])), c(parameters[3] ?? 0)]);
  const amplitude = Math.max(...ys) - Math.min(...ys);
  return bestStarts(data, [[amplitude, 2, 0, Math.min(...ys)], [amplitude, 5, 0, Math.min(...ys)]], residual, expression, "logistic");
}

export function fitDampedSinusoid(data: CurveData): Candidate[] {
  const { xs, ys } = sampledData(data);
  const residual = (parameters: readonly number[]) => xs.map((value, index) => {
    const envelope = Math.exp(Math.max(-30, Math.min(30, (parameters[0] ?? 0) * value)));
    return envelope * ((parameters[1] ?? 1) * Math.sin((parameters[3] ?? 4) * value) + (parameters[2] ?? 0) * Math.cos((parameters[3] ?? 4) * value)) + (parameters[4] ?? 0) - (ys[index] ?? 0);
  });
  const expression = (parameters: readonly number[]) => add([mul(exp(mul(c(parameters[0] ?? 0), x())), add([mul(c(parameters[1] ?? 1), sin(mul(c(parameters[3] ?? 4), x()))), mul(c(parameters[2] ?? 0), { kind: "cos", arg: mul(c(parameters[3] ?? 4), x()) })])), c(parameters[4] ?? 0)]);
  return bestStarts(data, [[-0.2, 1, 0, 4, 0], [0.2, 1, 0, 6, 0]], residual, expression, "damped-sinusoid");
}
