import type { SolverOptions } from './types';

export const DEFAULT_OPTIONS: SolverOptions = {
  sampleCount: 256,
  functionBucketCount: 128,
  maxStructuralComplexity: 12,
  maxFreeParameters: 8,
  semanticBeamWidth: 300,
  combinationWidth: 48,
  beautifyBeamWidth: 32,
  timeBudgetMs: null,
  enableParametricFallback: true,
  deterministicSeed: 1,
};
