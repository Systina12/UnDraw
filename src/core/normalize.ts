import { median, percentile } from '../math/statistics';
import type { SampledCurve } from './resample';
import type {CurveFeatures} from './features';

export interface Normalization { xc: number; xs: number; yc: number; ys: number }

export interface CurveData extends SampledCurve {
  u: Float64Array;
  v: Float64Array;
  smoothY: Float64Array;
  sigmaDraw: number;
  normalization: Normalization;
  features?: CurveFeatures;
}

export function normalizeCurve(sampled: SampledCurve, smoothY: Float64Array, sigmaDraw: number): CurveData {
  const { x, rawY } = sampled;
  const xc = (x[0] + x.at(-1)!) / 2;
  const xs = Math.max((x.at(-1)! - x[0]) / 2, 1e-9);
  const yc = median([...rawY]);
  const ys = Math.max((percentile([...rawY], .95) - percentile([...rawY], .05)) / 2,
    1e-9, Math.abs(yc) * 1e-12);
  return {
    ...sampled, smoothY, sigmaDraw, normalization: { xc, xs, yc, ys },
    u: Float64Array.from(x, value => (value - xc) / xs),
    v: Float64Array.from(rawY, value => (value - yc) / ys),
  };
}
