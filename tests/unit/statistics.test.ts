import { describe, expect, it } from 'vitest';
import { mad, median, percentile } from '../../src/math/statistics';

describe('robust statistics', () => {
  it('uses the middle of sorted finite values', () => {
    expect(median([9, 1, 5])).toBe(5);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(percentile([0, 10, 20, 30, 40], .95)).toBeCloseTo(38, 10);
    expect(mad([1, 1, 1, 99])).toBe(0);
  });

  it('rejects an empty distribution and invalid quantiles', () => {
    expect(() => median([])).toThrow(RangeError);
    expect(() => percentile([1, 2], 1.2)).toThrow(RangeError);
  });
});
