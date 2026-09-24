import {it,expect} from 'vitest';
import {solveCurve} from '../../src/core/solver';
import {evaluate} from '../../src/expr/evaluate';

it('returns a two-coordinate expression for a drawn circle',()=>{
  const points=Array.from({length:240},(_,i)=>{
    const t=i/239;
    return {x:3*Math.cos(2*Math.PI*t),y:3*Math.sin(2*Math.PI*t),t:i};
  });
  const result=solveCurve(points);
  expect(result.mode).toBe('parametric');
  expect(result.accurate.rmse).toBeLessThan(.09);
  expect(result.best.rmse).toBeLessThan(result.accurate.rmse+.05*3*Math.SQRT2);
  expect(result.best.plot.x).toHaveLength(256);
  expect(result.best.parametric?.xLatex).toContain('t');
  const equations=result.best.parametric!;
  expect(result.best.plot.x[64]).toBeCloseTo(evaluate(equations.xExpr,64/255).value,8);
});
it('supports a near-vertical stroke without forcing y=f(x)',()=>{
  const points=Array.from({length:150},(_,i)=>({x:1+.001*Math.sin(i),y:-2+4*i/149,t:i}));
  const result=solveCurve(points);
  expect(result.mode).toBe('parametric');
  expect(result.best.rmse).toBeLessThan(.15);
});
