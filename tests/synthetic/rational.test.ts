import {it,expect} from 'vitest';
import {solveCurve} from '../../src/core/solver';
import {hasDomainPole} from '../../src/models/rational';
import {makeStroke} from '../fixtures/generateStroke';
it('recovers a pole-free reciprocal and rejects in-domain poles',()=>{
  const result=solveCurve(makeStroke(x=>1/(x+2),{min:-1,max:1,noise:.003,seed:11}));
  expect(result.pareto.some(c=>c.modelFamily==='rational'&&c.rmse<.03)).toBe(true);
  expect(hasDomainPole([1,-2],[-1,1])).toBe(true);
  expect(hasDomainPole([1,.1],[-1,1])).toBe(false);
});
