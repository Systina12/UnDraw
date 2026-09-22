import { mad } from '../math/statistics';
import type { Point } from './types';

export function estimatePreliminaryNoise(points: readonly Point[]): number {
  if (points.length < 5) return 0;
  const residuals: number[] = [];
  for (let i = 2; i < points.length - 2; i++) {
    const left = points[i - 2];
    const right = points[i + 2];
    const current = points[i];
    const dx = right.x - left.x;
    const dy = right.y - left.y;
    const length = Math.hypot(dx, dy);
    if (length < 1e-12) continue;
    const vertical = Math.abs(dx) > length * .05
      ? current.y - (left.y + (current.x - left.x) / dx * dy)
      : ((current.x - left.x) * dy - (current.y - left.y) * dx) / length;
    if (Number.isFinite(vertical)) residuals.push(vertical);
  }
  if (!residuals.length) return 0;
  const range = Math.max(...points.map(p => p.y)) - Math.min(...points.map(p => p.y));
  const noise = 1.4826 * mad(residuals);
  return Math.min(Math.max(noise, range * 1e-5), Math.max(range * .2, 1e-8));
}
