import {it,expect} from 'vitest';
import {solveCurve} from '../../src/core/solver';
import {makeStroke} from '../fixtures/generateStroke';

it.each([
  ['exponential',(x:number)=>Math.exp(.7*x),'exponential'],
  ['logarithm',(x:number)=>Math.log(x+2),'logarithm'],
  ['absolute',(x:number)=>Math.abs(x-.35),'absolute'],
] as const)('fits a noisy %s stroke',(_name,f,family)=>{
  const result=solveCurve(makeStroke(f,{min:-1,max:1,noise:.006,seed:42}));
  expect(result.pareto.some(c=>c.modelFamily===family&&c.rmse<.045)).toBe(true);
});
