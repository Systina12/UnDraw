import {it,expect} from 'vitest';
import {solveCurve} from '../../src/core/solver';
import {makeStroke} from '../fixtures/generateStroke';

it.each([
  ['gaussian',(x:number)=>Math.exp(-x*x)],
  ['tanh',(x:number)=>Math.tanh(2*x-.3)],
  ['logistic',(x:number)=>2/(1+Math.exp(-3*(x-.2)))-.4],
  ['damped-sinusoid',(x:number)=>Math.exp(-.2*x)*Math.sin(4*x)],
] as const)('fits %s with a compact family model',(family,f)=>{
  const result=solveCurve(makeStroke(f,{min:-1,max:2,noise:.005,seed:19}));
  const equivalent=family==='logistic'?'tanh':family==='tanh'?'logistic':family;
  expect(result.pareto.some(c=>(c.modelFamily===family||c.modelFamily===equivalent)&&c.rmse<.055)).toBe(true);
});
