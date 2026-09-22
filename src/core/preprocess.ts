import type { Point } from './types';

export class InvalidCurveError extends Error {
  constructor(readonly reason: 'too-few-points' | 'stroke-too-small' | 'domain-too-small' | 'no-finite-samples') {
    super(reason);
    this.name = 'InvalidCurveError';
  }
}

export function sanitizeStroke(points: readonly Point[]): Point[] {
  const finite = points.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.t));
  const scale = Math.max(1, ...finite.map(p => Math.max(Math.abs(p.x), Math.abs(p.y))));
  const epsilon = scale * 1e-9;
  const clean: Point[] = [];
  for (const p of finite) {
    const last = clean.at(-1);
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > epsilon) clean.push({ ...p });
  }
  return clean;
}
