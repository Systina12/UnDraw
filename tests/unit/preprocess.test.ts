import { describe, expect, it } from 'vitest';
import { preprocess, InvalidCurveError } from '../../src/core/preprocess';
import { resampleFunction } from '../../src/core/resample';
import { smoothSeries } from '../../src/core/smooth';
import { makeStroke } from '../fixtures/generateStroke';
import { solveCurve } from '../../src/core/solver';

describe('curve preprocessing', () => {
  it('keeps the full domain of valid strokes with as few as eight points', () => {
    for (const count of [8, 12, 24, 32]) {
      const result = preprocess(makeStroke(x => 2 * x + 1, { min: -2, max: 2, count }));
      expect(result.mode, `${count} points`).toBe('function');
      if (result.mode !== 'function') continue;
      expect(result.data.domain[1] - result.data.domain[0], `${count} points`).toBeGreaterThan(3.7);
    }
  });

  it('recovers sparse straight strokes while retaining observed corners', () => {
    for(const count of [2,3,7]){
      const result=preprocess(makeStroke(x=>-1.2*x+3.62,{min:.1,max:2.1,count}));
      expect(result.mode,`${count} samples`).toBe('function');
      if(result.mode!=='function')continue;
      expect(result.data.domain[0],`${count} samples`).toBeCloseTo(.1,1);
      expect(result.data.domain[1],`${count} samples`).toBeCloseTo(2.1,1);
    }
    const corner=preprocess([{x:-1,y:0,t:0},{x:0,y:1,t:1},{x:1,y:0,t:2}]);
    expect(corner.mode).toBe('function');
    if(corner.mode==='function')expect(Math.max(...corner.data.rawY)).toBeGreaterThan(.9);
  });

  it('keeps sparse endpoints when a continuous curve rises steeply', () => {
    for (const [count, fn] of [
      [8, (x: number) => Math.exp(3 * x)],
      [12, (x: number) => Math.exp(4 * x)],
      [8, (x: number) => x ** 8],
    ] as const) {
      const points = Array.from({ length: count }, (_, i) => {
        const x = -2 + 4 * i / (count - 1);
        return { x, y: fn(x), t: i };
      });
      const sampled = resampleFunction(points);
      expect(sampled.domain[0], `${count} point left endpoint`).toBeCloseTo(-2, 8);
      expect(sampled.domain[1], `${count} point right endpoint`).toBeCloseTo(2, 8);
    }
  });

  it('keeps the tail of a sparse stroke whose sample spacing grows gradually', () => {
    for (const count of [9, 32]) {
      const points = Array.from({ length: count }, (_, i) => {
        const x = -2 + 4 * (i / (count - 1)) ** 3;
        return { x, y: x, t: i };
      });
      const result = preprocess(points);
      expect(result.mode, `${count} points`).toBe('function');
      if (result.mode !== 'function') continue;
      expect(result.data.domain[1], `${count} points`).toBeGreaterThan(1.9);
    }
  });

  it('interpolates at the actual sample x rather than at bucket centers', () => {
    for (const count of [48, 64]) {
      const result = resampleFunction(makeStroke(x => 2 * x + 1, { min: -2, max: 2, count }));
      const largestError = Math.max(...Array.from(result.x, (x, i) => Math.abs(result.rawY[i] - (2 * x + 1))));
      expect(largestError, `${count} points`).toBeLessThan(1e-8);
    }
  });

  it('rejects a terminal pen jump just beyond the curve without a point-count discontinuity', () => {
    const line = Array.from({ length: 98 }, (_, i) => {
      const x = -2 + 4 * i / 97;
      return { x, y: x, t: i };
    });
    for (const count of [99, 100]) {
      const points = count === 99 ? [...line, { x: 2.02, y: 100, t: 98 }] :
        [...line, { x: 2.001, y: 2.001, t: 98 }, { x: 2.02, y: 100, t: 99 }];
      const sampled = resampleFunction(points);
      expect(Math.max(...sampled.rawY), `${count} points`).toBeLessThan(3);
      const result = solveCurve(points, { maxStructuralComplexity: 0 });
      expect(result.balanced.rmse, `${count} points`).toBeLessThan(.02);
    }
  });

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

  it('measures the original pen noise rather than only interpolated residuals',()=>{
    const stroke=makeStroke(x=>2*Math.sin(Math.PI*x),
      {min:-2,max:2,count:256,noise:.018,seed:19});
    const prepared=preprocess(stroke);
    expect(prepared.mode).toBe('function');
    if(prepared.mode!=='function')return;
    expect(prepared.data.sigmaDraw).toBeGreaterThan(.009);
    expect(prepared.data.sigmaDraw).toBeLessThan(.035);
    const sharp=preprocess(makeStroke(x=>Math.abs(x),{min:-2,max:2,count:256}));
    if(sharp.mode==='function')expect(sharp.data.sigmaDraw).toBeLessThan(.006);
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
    expect(() => preprocess(circle.slice(0, 1))).toThrow(InvalidCurveError);
  });

  it('uses a smoothing window that retains short series', () => {
    const smoothed = smoothSeries(Float64Array.from([1, 2, 3, 4, 5]));
    expect(smoothed).toHaveLength(5);
    expect([...smoothed].every(Number.isFinite)).toBe(true);
  });
});
