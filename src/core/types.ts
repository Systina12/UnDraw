export interface Viewport {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export interface Point { x: number; y: number; t: number }

export interface SolverOptions {
  sampleCount: number;
  functionBucketCount: number;
  maxStructuralComplexity: number;
  maxFreeParameters: number;
  semanticBeamWidth: number;
  combinationWidth: number;
  beautifyBeamWidth: number;
  timeBudgetMs: number | null;
  enableParametricFallback: boolean;
  deterministicSeed: number;
}
