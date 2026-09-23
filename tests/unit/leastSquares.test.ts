import { describe, it, expect } from 'vitest';
import { leastSquares } from '../../src/math/leastSquares';

describe('Householder least squares', () => {
  it('recovers affine parameters exactly', () => {
    const fit = leastSquares(Float64Array.from([1,-1,1,0,1,1]),3,2,Float64Array.from([-1,1,3]));
    expect(fit.coefficients[0]).toBeCloseTo(1,12);
    expect(fit.coefficients[1]).toBeCloseTo(2,12);
    expect(fit.rank).toBe(2);
    expect(fit.residualNorm).toBeLessThan(1e-12);
  });
  it('returns finite coefficients when rank deficient', () => {
    const fit = leastSquares(Float64Array.from([1,1,2,2]),2,2,Float64Array.from([2,4]));
    expect(fit.rank).toBe(1);
    expect([...fit.coefficients].every(Number.isFinite)).toBe(true);
    expect(fit.coefficients[0]+fit.coefficients[1]).toBeCloseTo(2);
  });
  it('supports weights and widely different column scales', () => {
    const a = Float64Array.from([1e-8,-1e8, 1e-8,0, 1e-8,1e8]);
    const b = Float64Array.from([-2+2e-8,2e-8,2+2e-8]);
    const fit = leastSquares(a,3,2,b);
    expect(fit.rank).toBe(2);
    expect(fit.coefficients[0]).toBeCloseTo(2,3);
    expect(fit.coefficients[1]).toBeCloseTo(2e-8,16);
    const weighted = leastSquares(Float64Array.from([1,1,1]),3,1,Float64Array.from([1,2,50]),Float64Array.from([1,1,0]));
    expect(weighted.coefficients[0]).toBeCloseTo(1.5);
    expect(() => leastSquares(a,3,2,b,Float64Array.from([1,-1,1]))).toThrow(RangeError);
  });
});
