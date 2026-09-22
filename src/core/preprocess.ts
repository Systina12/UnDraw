import { mad, median, quantile } from "../math/vector";
import type { CurveData, Point, ValidationResult } from "./types";

export interface PreprocessOptions {
  samples?: number;
  buckets?: number;
}

export const MIN_RESAMPLE_SAMPLES = 16;
export const MAX_RESAMPLE_SAMPLES = 1024;
export const MIN_BUCKETS = 8;
export const MAX_BUCKETS = 512;
export const MAX_INPUT_POINTS = 8192;

export type PreprocessResult =
  | { kind: "ok"; data: CurveData; validation: ValidationResult }
  | { kind: "invalid"; reason: string; validation: ValidationResult };

function boundedInteger(value: number | undefined, fallback: number, minimum: number, maximum: number): number {
  return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, Math.floor(value!))) : fallback;
}

function finitePoints(points: readonly Point[]): Point[] {
  const source = Array.isArray(points) ? points : [];
  const valid = source.filter((point): point is Point => typeof point === "object" && point !== null && Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.t));
  if (valid.length <= MAX_INPUT_POINTS) return valid;
  return Array.from({ length: MAX_INPUT_POINTS }, (_, index) => valid[Math.round((index * (valid.length - 1)) / (MAX_INPUT_POINTS - 1))]!);
}

function bucketValues(points: readonly Point[], bucketCount: number): { values: number[][]; xmin: number; xmax: number; yrange: number } {
  let xmin = Number.POSITIVE_INFINITY;
  let xmax = Number.NEGATIVE_INFINITY;
  let ymin = Number.POSITIVE_INFINITY;
  let ymax = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    xmin = Math.min(xmin, point.x);
    xmax = Math.max(xmax, point.x);
    ymin = Math.min(ymin, point.y);
    ymax = Math.max(ymax, point.y);
  }
  const width = Math.max(1e-12, xmax - xmin);
  const values = Array.from({ length: bucketCount }, () => [] as number[]);
  for (const point of points) {
    const bucket = Math.min(bucketCount - 1, Math.max(0, Math.floor(((point.x - xmin) / width) * bucketCount)));
    values[bucket]?.push(point.y);
  }
  return { values, xmin, xmax, yrange: Math.max(1e-9, ymax - ymin) };
}

export function validateFunctionStroke(points: readonly Point[], bucketCount = 128): ValidationResult {
  const validPoints = finitePoints(points);
  if (validPoints.length < 4) return { valid: false, reason: "Draw a longer curve first.", spreadRatio: 1, effectiveBuckets: 0 };
  const totalXTravel = validPoints.slice(1).reduce((total, point, index) => total + Math.abs(point.x - (validPoints[index]?.x ?? point.x)), 0);
  const directXTravel = Math.abs((validPoints.at(-1)?.x ?? 0) - (validPoints[0]?.x ?? 0));
  const backtrackRatio = (totalXTravel - directXTravel) / Math.max(1e-9, totalXTravel);
  const likelyBacktracking = backtrackRatio > 0.12;
  const safeBucketCount = boundedInteger(bucketCount, 128, MIN_BUCKETS, MAX_BUCKETS);
  const { values, yrange } = bucketValues(validPoints, safeBucketCount);
  const bucketMedians = values.map((bucket) => bucket.length > 0 ? median(bucket) : undefined);
  const spreads = values.map((bucket) => {
    if (bucket.length === 0) return 0;
    let minimum = Number.POSITIVE_INFINITY;
    let maximum = Number.NEGATIVE_INFINITY;
    for (const value of bucket) {
      minimum = Math.min(minimum, value);
      maximum = Math.max(maximum, value);
    }
    return maximum - minimum;
  });
  const activeSpreads = spreads.filter((_, index) => (values[index]?.length ?? 0) > 0);
  const effectiveBuckets = activeSpreads.length;
  if (effectiveBuckets < 4) return { valid: false, reason: "The curve needs a wider x-domain.", spreadRatio: 1, effectiveBuckets };
  const noiseFloor = Math.max(1e-6, 1.4826 * quantile(activeSpreads, 0.25));
  const multivalued = spreads.filter((spread, index) => {
    if (spread <= 0) return false;
    const left = bucketMedians[index - 1];
    const right = bucketMedians[index + 1];
    const center = bucketMedians[index];
    const localSlope = left !== undefined && right !== undefined
      ? Math.abs(right - left) / 2
      : Math.abs((center ?? 0) - (left ?? right ?? center ?? 0));
    const threshold = Math.max(0.05 * yrange, 2 * localSlope + 4 * noiseFloor);
    return spread > threshold || (likelyBacktracking && spread > 0.2 * yrange);
  }).length;
  const spreadRatio = multivalued / effectiveBuckets;
  if (spreadRatio > 0.05) {
    return { valid: false, reason: "This curve is not single-valued as y=f(x).", spreadRatio, effectiveBuckets };
  }
  return { valid: true, spreadRatio, effectiveBuckets };
}

function medianFilter(values: readonly number[], radius: number): number[] {
  return values.map((_, index) => median(values.slice(Math.max(0, index - radius), Math.min(values.length, index + radius + 1))));
}

function savitzkyGolay(values: readonly number[]): number[] {
  const coefficients = [-21, 14, 39, 54, 59, 54, 39, 14, -21];
  const denominator = 231;
  return values.map((_, index) => {
    let total = 0;
    for (let offset = -4; offset <= 4; offset += 1) {
      const source = Math.min(values.length - 1, Math.max(0, index + offset));
      total += (values[source] ?? 0) * (coefficients[offset + 4] ?? 0);
    }
    return total / denominator;
  });
}

function bucketMedians(points: readonly Point[], bucketCount: number): { centers: number[]; medians: Array<number | undefined>; xmin: number; xmax: number } {
  const { values, xmin, xmax } = bucketValues(points, bucketCount);
  const width = Math.max(1e-12, xmax - xmin);
  return {
    centers: values.map((_, index) => xmin + ((index + 0.5) / bucketCount) * width),
    medians: values.map((bucket) => (bucket.length > 0 ? median(bucket) : undefined)),
    xmin,
    xmax,
  };
}

function interpolateMissing(centers: readonly number[], medians: readonly (number | undefined)[], x: number): number {
  const known = medians.flatMap((value, index) => value === undefined ? [] : [{ x: centers[index] ?? x, y: value }]);
  if (known.length === 0) return 0;
  if (known.length === 1) return known[0]!.y;
  if (x <= known[0]!.x) {
    const left = known[0]!;
    const right = known[1]!;
    const ratio = (x - left.x) / Math.max(1e-12, right.x - left.x);
    return left.y + ratio * (right.y - left.y);
  }
  const last = known[known.length - 1]!;
  if (x >= last.x) {
    const left = known[known.length - 2]!;
    const ratio = (x - left.x) / Math.max(1e-12, last.x - left.x);
    return left.y + ratio * (last.y - left.y);
  }
  for (let index = 1; index < known.length; index += 1) {
    const right = known[index]!;
    const left = known[index - 1]!;
    if (x <= right.x) {
      const ratio = (x - left.x) / Math.max(1e-12, right.x - left.x);
      return left.y + ratio * (right.y - left.y);
    }
  }
  return last.y;
}

function normalize(x: readonly number[], y: readonly number[]): { x: number[]; y: number[]; normalization: CurveData["normalization"] } {
  const xmin = x[0] ?? -1;
  const xmax = x.at(-1) ?? 1;
  const xc = (xmin + xmax) / 2;
  const xs = Math.max(1e-9, (xmax - xmin) / 2);
  const yc = median(y);
  const ys = Math.max(1e-9, (quantile(y, 0.95) - quantile(y, 0.05)) / 2);
  return {
    x: x.map((value) => (value - xc) / xs),
    y: y.map((value) => (value - yc) / ys),
    normalization: { xc, xs, yc, ys },
  };
}

export function preprocessCurve(points: readonly Point[], options: PreprocessOptions = {}): PreprocessResult {
  const sourcePoints = finitePoints(points);
  const samples = boundedInteger(options.samples, 256, MIN_RESAMPLE_SAMPLES, MAX_RESAMPLE_SAMPLES);
  const buckets = boundedInteger(options.buckets, 128, MIN_BUCKETS, MAX_BUCKETS);
  const validation = validateFunctionStroke(sourcePoints, buckets);
  if (!validation.valid) return { kind: "invalid", reason: validation.reason ?? "Invalid curve.", validation };
  const grid = bucketMedians(sourcePoints, buckets);
  const x = Array.from({ length: samples }, (_, index) => grid.xmin + (index / (samples - 1)) * (grid.xmax - grid.xmin));
  const y = x.map((value) => interpolateMissing(grid.centers, grid.medians, value));
  const medianY = medianFilter(y, 2);
  const smoothY = savitzkyGolay(medianY);
  const residuals = y.map((value, index) => value - (smoothY[index] ?? value));
  let minimumY = Number.POSITIVE_INFINITY;
  let maximumY = Number.NEGATIVE_INFINITY;
  for (const value of y) {
    minimumY = Math.min(minimumY, value);
    maximumY = Math.max(maximumY, value);
  }
  const curveRange = maximumY - minimumY;
  const noise = Math.max(1e-5, 1.4826 * mad(residuals), 0.002 * Math.max(1, curveRange));
  const normalized = normalize(x, y);
  const raw = x.map((value, index) => ({ x: value, y: y[index] ?? 0, t: index }));
  const smooth = x.map((value, index) => ({ x: value, y: smoothY[index] ?? 0, t: index }));
  const normalizedPoints = x.map((_, index) => ({ x: normalized.x[index] ?? 0, y: normalized.y[index] ?? 0, t: index }));
  return {
    kind: "ok",
    validation,
    data: {
      raw,
      smooth,
      normalized: normalizedPoints,
      x,
      y,
      smoothY,
      normalizedX: normalized.x,
      normalizedY: normalized.y,
      normalization: normalized.normalization,
      domain: [grid.xmin, grid.xmax],
      noise,
      sourcePoints,
    },
  };
}

export function resampleParametric(points: readonly Point[], samples = 256): { t: number[]; x: number[]; y: number[] } {
  const source = finitePoints(points);
  if (source.length < 2) return { t: [0, 1], x: [source[0]?.x ?? 0, source[0]?.x ?? 0], y: [source[0]?.y ?? 0, source[0]?.y ?? 0] };
  const sampleCount = boundedInteger(samples, 256, MIN_RESAMPLE_SAMPLES, MAX_RESAMPLE_SAMPLES);
  const t = Array.from({ length: sampleCount }, (_, index) => index / (sampleCount - 1));
  const cumulative = [0];
  for (let index = 1; index < source.length; index += 1) {
    const previous = source[index - 1]!;
    const current = source[index]!;
    cumulative.push((cumulative.at(-1) ?? 0) + Math.hypot(current.x - previous.x, current.y - previous.y));
  }
  const total = cumulative.at(-1) ?? 1;
  if (!Number.isFinite(total)) {
    return {
      t,
      x: t.map((value) => source[Math.min(source.length - 1, Math.round(value * (source.length - 1)))]!.x),
      y: t.map((value) => source[Math.min(source.length - 1, Math.round(value * (source.length - 1)))]!.y),
    };
  }
  if (total <= 1e-12) {
    const first = source[0]!;
    return { t, x: t.map(() => first.x), y: t.map(() => first.y) };
  }
  const x: number[] = [];
  const y: number[] = [];
  let right = 1;
  for (const normalized of t) {
    const distance = normalized * total;
    while (right < source.length - 1 && (cumulative[right] ?? 0) < distance) right += 1;
    const left = Math.max(0, right - 1);
    const ratio = (distance - (cumulative[left] ?? 0)) / Math.max(1e-12, (cumulative[right] ?? 0) - (cumulative[left] ?? 0));
    const p0 = source[left]!;
    const p1 = source[right]!;
    x.push(p0.x + ratio * (p1.x - p0.x));
    y.push(p0.y + ratio * (p1.y - p0.y));
  }
  return { t, x, y };
}
