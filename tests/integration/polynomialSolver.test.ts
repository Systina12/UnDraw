import {describe,it,expect} from 'vitest';
import {solveCurve} from '../../src/core/solver';
import {evaluate} from '../../src/expr/evaluate';
import {makeStroke} from '../fixtures/generateStroke';
import {chebyshevToPower} from '../../src/expr/polynomial';

describe('synchronous curve solver',()=>{
  it('converts Chebyshev T0, T1 and T2 without shifting degree',()=>{
    expect(chebyshevToPower([0,1])).toEqual([0,1]);
    expect(chebyshevToPower([0,0,1])).toEqual([-1,0,2]);
  });
  it.each([
    ['line',(x:number)=>2*x+1],
    ['parabola',(x:number)=>x*x-2],
    ['constant',(_x:number)=>3],
  ])('fits %s with a coherent AST, plot and three representatives',(_name,f)=>{
    const result=solveCurve(makeStroke(f,{min:-2,max:2,noise:.003,seed:7}),{maxStructuralComplexity:0});
    expect(result.mode).toBe('function');
    expect(result.best.rmse).toBeLessThan(.035);
    expect(result.pareto.length).toBeGreaterThan(0);
    expect(result.simple).toBeDefined();expect(result.balanced).toBeDefined();expect(result.accurate).toBeDefined();
    for(let i=0;i<result.best.plot.x.length;i++) {
      const actual=evaluate(result.best.expr,result.best.plot.x[i]);
      expect(actual.valid).toBe(true);
      expect(result.best.plot.y[i]).toBeCloseTo(actual.value,9);
    }
  });
});
