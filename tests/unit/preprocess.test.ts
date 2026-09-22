import { describe, expect, it } from 'vitest';
import { preprocess, InvalidCurveError } from '../../src/core/preprocess';
import { resampleFunction } from '../../src/core/resample';
import { smoothSeries } from '../../src/core/smooth';

describe('curve preprocessing', () => {
  it('resamples a nonuniform horizontal stroke without dividing by zero', () => {
    const points = Array.from({ length: 90 }, (_, i) => ({ x: 2 * (i / 89) ** 2 - 1, y: 3, t: i }));
    const result = preprocess(points);
    expect(result.mode).toBe('function');
    if (result.mode !== 'function') return;
    expect(result.data.x).toHaveLength(256);
    expect(result.data.rawY.every(Number.isFinite)).toBe(true);
    expect(result.data.normalization.ys).toBeGreaterThan(0);
    expect(Math.max(...result.data.rawY) - Math.min(...result.data.rawY)).toBeLessThan(1e-9);
    expect(result.data.v.every(Number.isFinite)).toBe(true);
  });

  it('uses each x bucket median to suppress an isolated stylus jump', () => {
    const points = Array.from({ length: 1024 }, (_, i) => ({
      x: -2 + 4 * i / 1023, y: i === 500 ? 50 : 1, t: i,
    }));
    const data = resampleFunction(points, 256);
    expect(data.rawY).toHaveLength(256);
    expect(Math.max(...data.rawY)).toBeLessThan(2);
  });

  it('keeps the longest continuous x interval when a large gap is missing', () => {
    const left = Array.from({ length: 100 }, (_, i) => ({ x: -2 + i / 99, y: -1, t: i }));
    const right = Array.from({ length: 100 }, (_, i) => ({ x: 1 + i / 99, y: 1, t: 100 + i }));
    const data = resampleFunction([...left, ...right], 256);
    expect(data.x.at(-1)! - data.x[0]).toBeLessThan(1.2);
    expect(data.weights.every(w => w > 0 && w <= 1)).toBe(true);
  });

  it('preserves a V cusp in the raw curve while smoothing nearby noise', () => {
    const points = Array.from({ length: 257 }, (_, i) => {
      const x = -1 + i / 128;
      return { x, y: Math.abs(x) + .005 * Math.sin(i * 17), t: i };
    });
    const result = preprocess(points);
    expect(result.mode).toBe('function');
    if (result.mode !== 'function') return;
    expect(Math.min(...result.data.rawY)).toBeLessThan(.02);
    expect(Math.min(...result.data.smoothY)).toBeLessThan(.05);
    expect(result.data.sigmaDraw).toBeGreaterThan(0);
  });

  it('samples circles by arc length and rejects tiny inputs', () => {
    const circle = Array.from({ length: 180 }, (_, i) => {
      const angle = 2 * Math.PI * i / 179;
      return { x: Math.cos(angle), y: Math.sin(angle), t: i };
    });
    const result = preprocess(circle);
    expect(result.mode).toBe('parametric');
    if (result.mode === 'parametric') {
      expect(result.data.t).toHaveLength(256);
      expect(result.data.closed).toBe(true);
      expect(result.data.rawX[0]).toBeCloseTo(result.data.rawX.at(-1)!, 8);
    }
    expect(() => preprocess(circle.slice(0, 7))).toThrow(InvalidCurveError);
  });

  it('uses a smoothing window that retains short series', () => {
    const smoothed = smoothSeries(Float64Array.from([1, 2, 3, 4, 5]));
    expect(smoothed).toHaveLength(5);
    expect([...smoothed].every(Number.isFinite)).toBe(true);
  });
});
