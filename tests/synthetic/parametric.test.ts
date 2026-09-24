import {it,expect} from 'vitest';
import {solveCurve} from '../../src/core/solver';
import {evaluate} from '../../src/expr/evaluate';
import {solveStrokesProgressive} from '../../src/core/multi';

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

it('keeps the default fit near a long open outline even with only the quick search',async()=>{
  const points=Array.from({length:520},(_,i)=>{
    const t=i/519;
    return {x:300+85*Math.sin(6*t)+55*Math.sin(15*t)+
      20*Math.exp(-(((t-.68)/.12)**2)),
    y:1600-900*t+18*Math.sin(8*t),t:i};
  });
  const result=(await solveStrokesProgressive([points],'per-stroke',
    {timeBudgetMs:0})).groups[0].result;
  expect(result.mode).toBe('parametric');
  expect(result.balanced.rmse).toBeLessThan(8);
  expect(result.accurate.rmse).toBeLessThan(3);
  expect(result.simple.rmse).toBeLessThanOrEqual(
    2.5*Math.max(result.noise,result.accurate.rmse)+1e-6);
});
