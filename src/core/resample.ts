import { median, percentile } from '../math/statistics';
import type { Point } from './types';
import { InvalidCurveError, sanitizeStroke } from './preprocess';

export interface SampledCurve {
  x: Float64Array;
  rawY: Float64Array;
  weights: Float64Array;
  domain: [number, number];
}

export interface SampledParametric {
  t: Float64Array;
  rawX: Float64Array;
  rawY: Float64Array;
  closed: boolean;
}

export function resampleFunction(points: readonly Point[], count = 256): SampledCurve {
  const clean = sanitizeStroke(points);
  if (clean.length < 2 || count < 2) throw new InvalidCurveError('too-few-points');
  const xmin = percentile(clean.map(p => p.x), .01);
  const xmax = percentile(clean.map(p => p.x), .99);
  if (xmax <= xmin) throw new InvalidCurveError('domain-too-small');
  const binCount = Math.min(128, Math.max(16, Math.floor(count / 2)));
  const buckets: number[][] = Array.from({ length: binCount }, () => []);
  for (const p of clean) {
    const bin = Math.floor((p.x - xmin) / (xmax - xmin) * binCount);
    if (bin >= 0 && bin < binCount) buckets[bin].push(p.y);
  }
  const medians = buckets.map(bucket => bucket.length ? median(bucket) : Number.NaN);
  const present = buckets.map(bucket => bucket.length > 0);
  const filled = Array.from({ length: binCount }, () => false);
  for (let i = 0; i < binCount;) {
    if (present[i]) { i++; continue; }
    const start = i;
    while (i < binCount && !present[i]) i++;
    if (start > 0 && i < binCount && i - start <= 3) {
      for (let j = start; j < i; j++) {
        medians[j] = medians[start - 1] + (medians[i] - medians[start - 1]) * (j - start + 1) / (i - start + 1);
        filled[j] = true;
      }
    }
  }
  let bestStart = -1;
  let bestEnd = -1;
  for (let i = 0; i < binCount;) {
    if (!Number.isFinite(medians[i])) { i++; continue; }
    const start = i;
    while (i < binCount && Number.isFinite(medians[i])) i++;
    if (i - start > bestEnd - bestStart) { bestStart = start; bestEnd = i; }
  }
  if (bestStart < 0 || bestEnd - bestStart < 2) throw new InvalidCurveError('domain-too-small');

  const step = (xmax - xmin) / binCount;
  const x0 = xmin + (bestStart + .5) * step;
  const x1 = xmin + (bestEnd - .5) * step;
  const x = new Float64Array(count);
  const rawY = new Float64Array(count);
  const weights = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    x[i] = x0 + i / (count - 1) * (x1 - x0);
    const position = (x[i] - xmin) / step - .5;
    const low = Math.min(bestEnd - 1, Math.max(bestStart, Math.floor(position)));
    const high = Math.min(bestEnd - 1, low + 1);
    const blend = Math.min(1, Math.max(0, position - low));
    rawY[i] = medians[low] * (1 - blend) + medians[high] * blend;
    weights[i] = filled[low] || filled[high] ? .5 : 1;
  }
  return { x, rawY, weights, domain: [x0, x1] };
}

export function resampleParametric(points: readonly Point[], count = 256): SampledParametric {
  const clean = sanitizeStroke(points);
  if (clean.length < 2 || count < 2) throw new InvalidCurveError('too-few-points');
  const lengths = new Float64Array(clean.length);
  for (let i = 1; i < clean.length; i++) {
    lengths[i] = lengths[i - 1] + Math.hypot(clean[i].x - clean[i - 1].x, clean[i].y - clean[i - 1].y);
  }
  const total = lengths.at(-1)!;
  if (!(total > 1e-9)) throw new InvalidCurveError('stroke-too-small');
  const t = new Float64Array(count);
  const rawX = new Float64Array(count);
  const rawY = new Float64Array(count);
  let segment = 0;
  for (let i = 0; i < count; i++) {
    const distance = i / (count - 1) * total;
    while (segment < clean.length - 2 && lengths[segment + 1] < distance) segment++;
    const span = lengths[segment + 1] - lengths[segment];
    const ratio = span ? (distance - lengths[segment]) / span : 0;
    t[i] = i / (count - 1);
    rawX[i] = clean[segment].x + ratio * (clean[segment + 1].x - clean[segment].x);
    rawY[i] = clean[segment].y + ratio * (clean[segment + 1].y - clean[segment].y);
  }
  const xs = clean.map(p => p.x);
  const ys = clean.map(p => p.y);
  const diagonal = Math.hypot(percentile(xs, .99) - percentile(xs, .01),
    percentile(ys, .99) - percentile(ys, .01));
  const closed = Math.hypot(clean[0].x - clean.at(-1)!.x, clean[0].y - clean.at(-1)!.y) <= .04 * diagonal;
  return { t, rawX, rawY, closed };
}
