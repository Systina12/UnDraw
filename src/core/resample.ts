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
  const xs = clean.map(p => p.x);
  const lower = percentile(xs, .01), upper = percentile(xs, .99);
  const ordered = [...clean].sort((a, b) => a.x - b.x);
  const inside = ordered.filter(p => p.x >= lower && p.x <= upper);
  const body = inside.length >= 2 ? inside : ordered;
  const bodyRange = percentile(body.map(p => p.y), .95) - percentile(body.map(p => p.y), .05);
  const coherentEnd = (end: Point, nearest: Point, next: Point, third: Point): boolean => {
    const spacing = Math.abs(nearest.x - next.x);
    const distance = Math.abs(end.x - nearest.x);
    if (!(spacing > 0) || distance > 3 * spacing) return false;
    const estimate = nearest.y + (nearest.y - next.y) * (end.x - nearest.x) / (nearest.x - next.x);
    const recentDelta = nearest.y - next.y;
    const previousDelta = next.y - third.y;
    const growth = recentDelta * previousDelta > 0 && Math.abs(previousDelta) > 1e-12 ?
      Math.min(20, Math.max(1, Math.abs(recentDelta / previousDelta))) : 1;
    return Math.abs(end.y - estimate) <= Math.max(3 * Math.abs(recentDelta) * growth, .05 * bodyRange, 1e-6);
  };
  const xmin = ordered[0].x < body[0].x && coherentEnd(ordered[0], body[0], body[1], body[2] ?? body[1]) ?
    ordered[0].x : body[0].x;
  const xmax = ordered.at(-1)!.x > body.at(-1)!.x &&
    coherentEnd(ordered.at(-1)!, body.at(-1)!, body.at(-2)!, body.at(-3) ?? body.at(-2)!) ?
    ordered.at(-1)!.x : body.at(-1)!.x;
  if (xmax <= xmin) throw new InvalidCurveError('domain-too-small');
  const binCount = Math.min(128, Math.max(16, Math.floor(count / 2)));
  const buckets: Point[][] = Array.from({ length: binCount }, () => []);
  for (const p of clean) {
    if (p.x < xmin || p.x > xmax) continue;
    const bin = Math.min(binCount - 1, Math.floor((p.x - xmin) / (xmax - xmin) * binCount));
    buckets[bin].push(p);
  }
  const occupied = buckets.flatMap((bucket, index) => bucket.length ? [index] : []);
  if (occupied.length < 2) throw new InvalidCurveError('domain-too-small');
  const gaps = occupied.slice(1).map((bin, i) => bin - occupied[i]);
  const typicalGap = median(gaps);
  let bestStart = 0, bestEnd = 0, islandStart = 0;
  for (let i = 1; i <= occupied.length; i++) {
    const preceding = i > 1 ? gaps[i - 2] : 0;
    const following = i < gaps.length ? gaps[i] : 0;
    const gapLimit = Math.max(4, 2.5 * typicalGap, 2.5 * Math.max(preceding, following));
    if (i < occupied.length && occupied[i] - occupied[i - 1] <= gapLimit) continue;
    if (occupied[i - 1] - occupied[islandStart] > occupied[bestEnd] - occupied[bestStart]) {
      bestStart = islandStart;
      bestEnd = i - 1;
    }
    islandStart = i;
  }
  if (bestEnd <= bestStart) throw new InvalidCurveError('domain-too-small');
  const anchors = occupied.slice(bestStart, bestEnd + 1).map(bin => ({
    bin,
    x: median(buckets[bin].map(p => p.x)),
    y: median(buckets[bin].map(p => p.y)),
  }));
  const x0 = anchors[0].x;
  const x1 = anchors.at(-1)!.x;
  const x = new Float64Array(count);
  const rawY = new Float64Array(count);
  const weights = new Float64Array(count);
  let segment = 0;
  for (let i = 0; i < count; i++) {
    x[i] = x0 + i / (count - 1) * (x1 - x0);
    while (segment < anchors.length - 2 && anchors[segment + 1].x < x[i]) segment++;
    const left = anchors[segment], right = anchors[segment + 1];
    const blend = (x[i] - left.x) / (right.x - left.x);
    rawY[i] = left.y * (1 - blend) + right.y * blend;
    weights[i] = right.bin - left.bin > 4 ? .5 : 1;
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
