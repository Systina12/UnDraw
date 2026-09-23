import type { Point } from './types';
import { percentile } from '../math/statistics';
import { estimatePreliminaryNoise } from './noise';
import { sanitizeStroke } from './preprocess';

export type StrokeMode = 'function' | 'parametric';

interface Crossing { y: number; segment: number }

export function classifyStroke(points: readonly Point[], bucketCount = 128): StrokeMode {
  const clean = sanitizeStroke(points);
  if (clean.length < 3) return 'function';
  const xs = clean.map(p => p.x);
  const ys = clean.map(p => p.y);
  const xMin = percentile(xs, .01);
  const xMax = percentile(xs, .99);
  const yMin = percentile(ys, .01);
  const yMax = percentile(ys, .99);
  const xRange = xMax - xMin;
  const yRange = yMax - yMin;
  if (xRange < .02 * Math.hypot(xRange, yRange)) return 'parametric';
  if (xRange <= 0) return 'parametric';

  const crossings: Crossing[][] = Array.from({ length: bucketCount }, () => []);
  const step = xRange / bucketCount;
  for (let i = 0; i < clean.length - 1; i++) {
    const a = clean[i];
    const b = clean[i + 1];
    const dx = b.x - a.x;
    if (Math.abs(dx) < xRange * 1e-10) {
      const bin = Math.min(bucketCount - 1, Math.max(0, Math.floor((a.x - xMin) / step)));
      crossings[bin].push({ y: a.y, segment: i }, { y: b.y, segment: i });
      continue;
    }
    const start = Math.max(0, Math.ceil((Math.min(a.x, b.x) - xMin) / step - .5));
    const end = Math.min(bucketCount - 1, Math.floor((Math.max(a.x, b.x) - xMin) / step - .5));
    for (let bin = start; bin <= end; bin++) {
      const x = xMin + (bin + .5) * step;
      crossings[bin].push({ y: a.y + (x - a.x) / dx * (b.y - a.y), segment: i });
    }
  }

  const threshold = Math.max(4 * estimatePreliminaryNoise(clean), .05 * yRange);
  let effective = 0;
  let multi = 0;
  let consecutive = 0;
  let maxConsecutive = 0;
  for (const entries of crossings) {
    if (!entries.length) { consecutive = 0; continue; }
    effective++;
    const spread = percentile(entries.map(e => e.y), .95) - percentile(entries.map(e => e.y), .05);
    const separated = entries.some(a => entries.some(b =>
      Math.abs(a.segment - b.segment) > Math.max(3, clean.length * .03) && Math.abs(a.y - b.y) > threshold));
    if (entries.length >= 2 && spread > threshold && separated) {
      multi++;
      maxConsecutive = Math.max(maxConsecutive, ++consecutive);
    } else consecutive = 0;
  }
  return effective > 0 && multi / effective > .05 && maxConsecutive >= 3 ? 'parametric' : 'function';
}
