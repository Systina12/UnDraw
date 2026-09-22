import {it,expect} from 'vitest';
import {minimizeBounded} from '../../src/math/brent';
import {huberWeights} from '../../src/math/robust';
import {fitLm} from '../../src/math/lm';

it('optimizes bounded scalar functions and robust nonlinear models',()=>{
  expect(minimizeBounded(x=>(x-1.25)**2,-3,3,1e-8).x).toBeCloseTo(1.25,6);
  expect(huberWeights(Float64Array.from([0,.2,20]),1)[2]).toBeLessThan(.1);
  const fit=fitLm((theta,x)=>theta[0]*Math.exp(theta[1]*x),
    Float64Array.from([1,Math.E,Math.E**2]),Float64Array.from([.8,.8]),{x:[0,1,2],delta:.1,maxIterations:60});
  expect(fit.params[0]).toBeCloseTo(1,2);
  expect(fit.params[1]).toBeCloseTo(1,2);
  const outlier=fitLm((theta,x)=>theta[0]*x,Float64Array.from([0,1,2,30]),Float64Array.from([.5]),
    {x:[0,1,2,3],delta:1,maxIterations:60});
  expect(outlier.params[0]).toBeLessThan(3);
});
