import type { Candidate, CandidateResult, CurveData, InvalidSolveResult, Point, SolveContext, SolveOutcome, SolveResult, SolverOptions } from "./types";
import { analyzeFeatures } from "./features";
import { MAX_BUCKETS, MAX_RESAMPLE_SAMPLES, MIN_BUCKETS, MIN_RESAMPLE_SAMPLES, preprocessCurve, resampleParametric } from "./preprocess";
import { beautifyCandidate } from "../beautify/beautify";
import { fitAbsolute } from "../models/absolute";
import { fitDampedSinusoid, fitGaussian, fitLogistic, fitTanh } from "../models/nonlinear";
import { fitExponential } from "../models/exponential";
import { fitFourier } from "../models/fourier";
import { fitLogarithm } from "../models/logarithm";
import { fitPolynomial } from "../models/polynomial";
import { fitRational } from "../models/rational";
import { fitSinusoid } from "../models/sinusoid";
import { CandidatePool, makeCandidate, selectPresentationCandidates, toCandidateResult } from "../search/candidates";
import { searchSymbolic } from "../search/symbolic";
import { c } from "../expr/ast";

const DEFAULTS: Required<Omit<SolverOptions, "progress" | "now">> = {
  samples: 256,
  buckets: 128,
  maxComplexity: 12,
  timeBudgetMs: 1500,
  parametricFallback: true,
  maxCandidates: 300,
  maxParams: 8,
};

const LIMITS = {
  samples: { minimum: MIN_RESAMPLE_SAMPLES, maximum: MAX_RESAMPLE_SAMPLES },
  buckets: { minimum: MIN_BUCKETS, maximum: MAX_BUCKETS },
  maxComplexity: { minimum: 0, maximum: 12 },
  timeBudgetMs: { minimum: 1, maximum: 10_000 },
  maxCandidates: { minimum: 16, maximum: 1_000 },
  maxParams: { minimum: 1, maximum: 8 },
} as const;

function systemNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function boundedNumber(value: number, fallback: number, minimum: number, maximum: number): number {
  return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
}

function boundedInteger(value: number, fallback: number, minimum: number, maximum: number): number {
  return Math.floor(boundedNumber(value, fallback, minimum, maximum));
}

function resolveOptions(options: Partial<SolverOptions>): SolverOptions {
  const merged = { ...DEFAULTS, ...options };
  const resolved: SolverOptions = {
    samples: boundedInteger(merged.samples, DEFAULTS.samples, LIMITS.samples.minimum, LIMITS.samples.maximum),
    buckets: boundedInteger(merged.buckets, DEFAULTS.buckets, LIMITS.buckets.minimum, LIMITS.buckets.maximum),
    maxComplexity: boundedInteger(merged.maxComplexity, DEFAULTS.maxComplexity, LIMITS.maxComplexity.minimum, LIMITS.maxComplexity.maximum),
    timeBudgetMs: boundedNumber(merged.timeBudgetMs, DEFAULTS.timeBudgetMs, LIMITS.timeBudgetMs.minimum, LIMITS.timeBudgetMs.maximum),
    parametricFallback: merged.parametricFallback !== false,
    maxCandidates: boundedInteger(merged.maxCandidates, DEFAULTS.maxCandidates, LIMITS.maxCandidates.minimum, LIMITS.maxCandidates.maximum),
    maxParams: boundedInteger(merged.maxParams, DEFAULTS.maxParams, LIMITS.maxParams.minimum, LIMITS.maxParams.maximum),
    now: typeof merged.now === "function" ? merged.now : systemNow,
  };
  if (typeof merged.progress === "function") resolved.progress = merged.progress;
  return resolved;
}

function makeContext(options: SolverOptions, start: number): SolveContext {
  const now = options.now ?? systemNow;
  const merged = { ...DEFAULTS, ...options, now };
  return { options: merged, deadline: start + merged.timeBudgetMs, now };
}

function invalid(reason: string, start: number, now: () => number): InvalidSolveResult {
  return { mode: "invalid", reason, diagnostics: { runtimeMs: elapsed(start, now), candidatesGenerated: 0, candidatesFitted: 0, maxComplexityReached: 0 } };
}

function elapsed(start: number, now: () => number): number {
  return now() - start;
}

function qualityFor(candidate: CandidateResult, noise: number): SolveResult["quality"] {
  const ratio = candidate.rmse / Math.max(1e-6, noise);
  if (ratio <= 1.5) return "excellent";
  if (ratio <= 3) return "good";
  if (ratio <= 6) return "approximation";
  return "low";
}

function isBeautifyFriendly(candidate: Candidate): boolean {
  const polynomial = /^polynomial-(\d+)$/.exec(candidate.modelFamily);
  if (polynomial && Number(polynomial[1]) > 4) return false;
  return candidate.complexity <= 24;
}

function solveFunction(points: readonly Point[], options: SolverOptions, allowParametric: boolean, preferPeriodic = false): SolveOutcome {
  const resolvedOptions = resolveOptions(options);
  const now = resolvedOptions.now ?? systemNow;
  const start = now();
  const context = makeContext(resolvedOptions, start);
  const preprocessed = preprocessCurve(points, { samples: context.options.samples, buckets: context.options.buckets });
  if (preprocessed.kind !== "ok") {
    if (allowParametric && context.options.parametricFallback) return solveParametric(points, resolvedOptions, start, now);
    return invalid(preprocessed.reason, start, now);
  }
  const data = preprocessed.data;
  const features = analyzeFeatures(data);
  const pool = new CandidatePool(data, context.options.maxCandidates);
  let generated = 0;
  let fitted = 0;
  let maxComplexityReached = 0;
  let bestScore = Number.POSITIVE_INFINITY;

  const addCandidates = (candidates: Candidate[]): void => {
    generated += candidates.length;
    fitted += candidates.length;
    for (const candidate of candidates) {
      maxComplexityReached = Math.max(maxComplexityReached, candidate.complexity);
      pool.add(candidate);
    }
    const best = pool.all()[0];
    if (best && best.score + 0.05 < bestScore) {
      bestScore = best.score;
      context.options.progress?.(toCandidateResult(best, data));
    }
  };

  const polynomialProducer = () => fitPolynomial(data, 8);
  const sinusoidProducer = () => fitSinusoidSafe(data);
  const fourierProducer = () => fitFourier(data, Math.min(5, Math.max(2, features.periodicity > 0.15 ? 5 : 3)));
  const dampedProducer = () => fitDampedSinusoid(data);
  const specializedProducers: Array<() => Candidate[]> = [
    () => fitExponential(data),
    () => fitLogarithm(data),
    () => fitAbsolute(data),
    () => fitRational(data),
    () => fitGaussian(data),
    () => fitTanh(data),
    () => fitLogistic(data),
  ];
  const periodicStructure = features.periodicity > 0.15 && features.extrema >= 2;
  const generalProducers: Array<() => Candidate[]> = periodicStructure
    ? [polynomialProducer, sinusoidProducer, dampedProducer, fourierProducer, ...specializedProducers]
    : [polynomialProducer, sinusoidProducer, ...specializedProducers, dampedProducer, fourierProducer];
  const producers = preferPeriodic
    ? [sinusoidProducer, dampedProducer, fourierProducer, polynomialProducer, ...specializedProducers]
    : generalProducers;
  for (const [producerIndex, producer] of producers.entries()) {
    if (context.now() > context.deadline) break;
    let produced: Candidate[] = [];
    try {
      produced = producer();
      addCandidates(produced);
    } catch { /* a single invalid model must not stop the bank */ }
    const producerBestError = Math.min(...produced.map((candidate) => candidate.error));
    if (producerIndex >= 1 && Number.isFinite(producerBestError) && producerBestError <= Math.max(1.8 * data.noise, 0.005)) break;
  }
  if (context.now() <= context.deadline) addCandidates(searchSymbolic(data, context.options.maxComplexity));
  if (context.now() <= context.deadline || pool.all().length === 0) addCandidates(fitPolynomial(data, 16));
  if (pool.all().length === 0) addCandidates([makeCandidate(c(data.y.reduce((a, b) => a + b, 0) / Math.max(1, data.y.length)), "constant-fallback", data, true)]);

  const bestErrorBeforeBeautify = Math.min(...pool.all().map((candidate) => candidate.error));
  const eligibleSeeds = pool.all().filter((candidate) => candidate.error <= bestErrorBeforeBeautify + Math.max(data.noise, 0.01) && isBeautifyFriendly(candidate));
  const familySeeds = new Map<string, Candidate>();
  for (const candidate of eligibleSeeds) {
    const previous = familySeeds.get(candidate.modelFamily);
    if (!previous || candidate.error < previous.error || (candidate.error === previous.error && candidate.score < previous.score)) {
      familySeeds.set(candidate.modelFamily, candidate);
    }
  }
  const beautifySeeds = [...familySeeds.values()].sort((a, b) => a.error - b.error || a.score - b.score).slice(0, 12);
  for (const seed of beautifySeeds) {
    try { pool.add(beautifyCandidate(seed, data)); } catch { /* keep the fitted candidate */ }
  }
  if (preferPeriodic) {
    const periodicSeed = pool.all()
      .filter((candidate) => /sinusoid|fourier/.test(candidate.modelFamily) && candidate.complexity <= 12)
      .sort((a, b) => a.complexity - b.complexity || a.error - b.error)[0];
    if (periodicSeed) {
      try { pool.add(beautifyCandidate(periodicSeed, data)); } catch { /* keep the fitted candidate */ }
    }
  }
  const frontier = pool.frontier();
  const selections = selectPresentationCandidates(frontier, data.noise, data.y);
  const simple = toCandidateResult(selections.simple, data);
  const balanced = toCandidateResult(selections.balanced, data);
  const accurate = toCandidateResult(selections.accurate, data);
  const periodicCandidates = preferPeriodic
    ? pool.all().filter((candidate) => /sinusoid|fourier/.test(candidate.modelFamily))
    : [];
  const periodicError = Math.min(...periodicCandidates.map((candidate) => candidate.error));
  const accuratePeriodic = periodicCandidates.slice().sort((a, b) => a.error - b.error || a.score - b.score)[0];
  const simplePeriodic = periodicCandidates
    .filter((candidate) => candidate.complexity <= 12)
    .sort((a, b) => a.complexity - b.complexity || a.error - b.error)[0];
  const periodicWinner = accuratePeriodic && simplePeriodic && simplePeriodic.error <= periodicError + Math.max(2.5 * data.noise, 0.025)
    ? simplePeriodic
    : accuratePeriodic;
  const chosen = periodicWinner ?? selections.balanced;
  const best = toCandidateResult(chosen, data);
  return {
    mode: "function",
    best,
    simple,
    balanced,
    accurate,
    pareto: frontier.map((candidate) => toCandidateResult(candidate, data)),
    domain: data.domain,
    noise: data.noise,
    quality: qualityFor(best, data.noise),
    features,
    diagnostics: { runtimeMs: elapsed(start, now), candidatesGenerated: generated, candidatesFitted: fitted, maxComplexityReached },
  };
}

function fitSinusoidSafe(data: CurveData): Candidate[] {
  return fitSinusoid(data);
}

function solveParametric(points: readonly Point[], options: SolverOptions, start: number, now: () => number): SolveOutcome {
  const resolvedOptions = resolveOptions(options);
  const sampled = resampleParametric(points, resolvedOptions.samples);
  const xPoints = sampled.t.map((t, index) => ({ x: t, y: sampled.x[index] ?? 0, t: index }));
  const yPoints = sampled.t.map((t, index) => ({ x: t, y: sampled.y[index] ?? 0, t: index }));
  const totalBudget = resolvedOptions.timeBudgetMs;
  const xBudget = Math.max(1, Math.floor(totalBudget / 2));
  const childOptions: SolverOptions = {
    samples: resolvedOptions.samples,
    buckets: resolvedOptions.buckets,
    maxComplexity: resolvedOptions.maxComplexity,
    timeBudgetMs: xBudget,
    parametricFallback: false,
    maxCandidates: resolvedOptions.maxCandidates,
    maxParams: resolvedOptions.maxParams,
    now,
  };
  const xResult = solveFunction(xPoints, childOptions, false, true);
  const yResult = solveFunction(yPoints, childOptions, false, true);
  if (xResult.mode !== "function" || yResult.mode !== "function") return invalid("This curve cannot be represented as a stable function or parametric curve.", start, now);
  const noise = Math.max(xResult.noise, yResult.noise);
  return {
    mode: "parametric",
    best: yResult.best,
    simple: yResult.simple,
    balanced: yResult.balanced,
    accurate: yResult.accurate,
    pareto: yResult.pareto,
    domain: [0, 1],
    noise,
    quality: yResult.quality,
    diagnostics: {
      runtimeMs: elapsed(start, now),
      candidatesGenerated: xResult.diagnostics.candidatesGenerated + yResult.diagnostics.candidatesGenerated,
      candidatesFitted: xResult.diagnostics.candidatesFitted + yResult.diagnostics.candidatesFitted,
      maxComplexityReached: Math.max(xResult.diagnostics.maxComplexityReached, yResult.diagnostics.maxComplexityReached),
    },
    parametric: { x: xResult.best, y: yResult.best, t: sampled.t },
  };
}

export function solveCurve(points: readonly Point[], options: Partial<SolverOptions> = {}): SolveOutcome {
  return solveFunction(points, resolveOptions(options), true);
}
