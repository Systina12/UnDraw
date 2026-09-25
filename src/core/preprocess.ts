import type { Point } from './types';
import { classifyStroke } from './validateFunction';
import { resampleFunction, resampleParametric } from './resample';
import { smoothSeries } from './smooth';
import { normalizeCurve, type CurveData } from './normalize';
import { mad, percentile } from '../math/statistics';
import {extractFeatures} from './features';

export interface ParametricData {
  t: Float64Array;
  rawX: Float64Array;
  rawY: Float64Array;
  smoothX: Float64Array;
  smoothY: Float64Array;
  sigmaX: number;
  sigmaY: number;
  sigmaDraw: number;
  closed: boolean;
}

export type PreprocessedCurve =
  | { mode: 'function'; data: CurveData }
  | { mode: 'parametric'; data: ParametricData };

function drawingNoise(raw: Float64Array, smooth: Float64Array): number {
  const residuals = Array.from(raw, (value, i) => value - smooth[i]);
  const range = percentile([...raw], .95) - percentile([...raw], .05);
  return Math.max(1.4826 * mad(residuals), 1e-9, range * 1e-6);
}

export function preprocess(points: readonly Point[], sampleCount = 256): PreprocessedCurve {
  const clean = sanitizeStroke(points);
  if (clean.length < 2) throw new InvalidCurveError('too-few-points');
  let arcLength = 0;
  for (let i = 1; i < clean.length; i++) arcLength += Math.hypot(clean[i].x - clean[i - 1].x, clean[i].y - clean[i - 1].y);
  if (!(arcLength > 1e-8)) throw new InvalidCurveError('stroke-too-small');
  // Pointer events may give a long, fast straight line only two or three samples.
  // Preserve every observed corner while interpolating each sparse line segment.
  const trace = clean.length < 8 ? densifySparseStroke(clean, arcLength) : clean;
  if (classifyStroke(trace) === 'parametric') {
    const sampled = resampleParametric(trace, sampleCount);
    const smoothX = smoothSeries(sampled.rawX);
    const smoothY = smoothSeries(sampled.rawY);
    const sigmaX = drawingNoise(sampled.rawX, smoothX);
    const sigmaY = drawingNoise(sampled.rawY, smoothY);
    return { mode: 'parametric', data: {
      ...sampled, smoothX, smoothY, sigmaX, sigmaY,
      sigmaDraw: Math.hypot(sigmaX, sigmaY),
    } };
  }
  const sampled = resampleFunction(trace, sampleCount);
  const smoothY = smoothSeries(sampled.rawY);
  const data=normalizeCurve(sampled,smoothY,drawingNoise(sampled.rawY,smoothY));
  data.features=extractFeatures(data);
  return { mode: 'function', data };
}

function densifySparseStroke(points:Point[],totalLength:number):Point[] {
  const segments=points.slice(1).map((point,i)=>Math.hypot(point.x-points[i].x,point.y-points[i].y));
  const additional=16-points.length;
  const ideal=segments.map(length=>additional*length/totalLength);
  const subdivisions=ideal.map(Math.floor);
  let remaining=additional-subdivisions.reduce((sum,count)=>sum+count,0);
  const byRemainder=ideal.map((amount,i)=>i).sort((a,b)=>(ideal[b]-subdivisions[b])-
    (ideal[a]-subdivisions[a]));
  for(let i=0;i<remaining;i++)subdivisions[byRemainder[i]]++;
  const result=[points[0]];
  for(let i=0;i<segments.length;i++){
    const start=points[i],end=points[i+1];
    for(let step=1;step<=subdivisions[i];step++){
      const ratio=step/(subdivisions[i]+1);
      result.push({x:start.x+(end.x-start.x)*ratio,y:start.y+(end.y-start.y)*ratio,
        t:start.t+(end.t-start.t)*ratio});
    }
    result.push(end);
  }
  return result;
}

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
