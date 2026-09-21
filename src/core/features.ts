import type { CurveData, FeatureSummary } from "./types";
import { dominantFrequencies, realFFT } from "../math/fft";
import { mean, median } from "../math/vector";

export function analyzeFeatures(data: CurveData): FeatureSummary {
  const values = data.smoothY;
  const differences = values.slice(1).map((value, index) => value - (values[index] ?? value));
  const extrema = differences.slice(1).reduce((count, value, index) => {
    const previous = differences[index] ?? 0;
    return count + (previous * value < 0 && Math.abs(previous - value) > 1e-4 ? 1 : 0);
  }, 0);
  const center = median(values);
  const zeroCrossings = values.slice(1).reduce((count, value, index) => count + (((values[index] ?? center) - center) * (value - center) < 0 ? 1 : 0), 0);
  const positive = differences.filter((value) => value > 1e-8).length;
  const negative = differences.filter((value) => value < -1e-8).length;
  const monotonicity = Math.max(positive, negative) / Math.max(1, differences.length);
  const midpoint = Math.floor(values.length / 2);
  const left = values.slice(0, midpoint);
  const right = values.slice(-midpoint).reverse();
  const meanLeft = mean(left);
  const meanRight = mean(right);
  const symmetricError = mean(left.map((value, index) => Math.abs(value - (right[index] ?? value)))) / (mean(left.map((value) => Math.abs(value - meanLeft))) + mean(right.map((value) => Math.abs(value - meanRight))) + 1e-9);
  const antisymmetricError = mean(left.map((value, index) => Math.abs(value + (right[index] ?? value)))) / (mean(left.map((value) => Math.abs(value - meanLeft))) + mean(right.map((value) => Math.abs(value - meanRight))) + 1e-9);
  const symmetry = Math.max(0, 1 - Math.min(symmetricError, antisymmetricError));
  const spectrum = realFFT(values.map((value) => value - center));
  const totalSpectrum = spectrum.slice(1).reduce((total, value) => total + value, 0) || 1;
  const periodicity = Math.min(1, Math.max(...spectrum.slice(1)) / totalSpectrum);
  const curvature = differences.slice(1).map((value, index) => value - (differences[index] ?? value));
  const cuspScore = Math.min(1, (curvature.filter((value) => Math.abs(value) > 0.15 * (mean(curvature.map(Math.abs)) + 1e-6)).length / Math.max(1, curvature.length)) * 8);
  const trend = values.at(-1)! - values[0]!;
  return {
    extrema,
    zeroCrossings,
    monotonicity,
    symmetry,
    periodicity,
    spectralPeaks: dominantFrequencies(values, 6),
    cuspScore,
    trend,
  };
}
