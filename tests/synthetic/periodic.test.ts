import {it,expect} from 'vitest';
import {solveCurve} from '../../src/core/solver';
import {makeStroke} from '../fixtures/generateStroke';

it('recovers a drawn sinusoid with lower complexity than a high-order polynomial',()=>{
  const result=solveCurve(makeStroke(x=>2*Math.sin(Math.PI*x),{min:-1,max:1,noise:.006,seed:7}));
  expect(result.balanced.rmse).toBeLessThan(.025);
  expect(result.balanced.complexity).toBeLessThan(12);
  expect(result.pareto.some(c=>c.modelFamily==='sinusoid')).toBe(true);
});
it('models a sinusoid with linear trend',()=>{
  const result=solveCurve(makeStroke(x=>x+.5*Math.sin(3*x),{min:-2,max:2,noise:.01,seed:17}));
  expect(result.best.rmse).toBeLessThan(.05);
});
