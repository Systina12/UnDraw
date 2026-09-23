import {it,expect} from 'vitest';
import {solveCurve} from '../../src/core/solver';
import {makeStroke} from '../fixtures/generateStroke';
import {preprocess} from '../../src/core/preprocess';
import {produceFallback} from '../../src/search/fallback';
it('returns a finite approximation for a curved chirp with bounded error',()=>{
  const result=solveCurve(makeStroke(x=>Math.sin(x*x),{min:-2,max:2,noise:.01,seed:9}));
  expect(result.best.plot.y.every(Number.isFinite)).toBe(true);
  expect(result.best.rmse).toBeLessThan(.25);
  expect(result.diagnostics.candidatesGenerated).toBeGreaterThan(20);
  const prepared=preprocess(makeStroke(x=>Math.sin(x*x),{min:-2,max:2,noise:.01,seed:9}));
  if(prepared.mode!=='function')throw Error('Expected scalar data');
  expect(produceFallback(prepared.data).some(candidate=>candidate.approximation)).toBe(true);
});
