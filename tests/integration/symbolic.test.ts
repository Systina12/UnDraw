import {it,expect} from 'vitest';
import {solveCurve} from '../../src/core/solver';
import {solveStrokesProgressive} from '../../src/core/multi';
import {searchSymbolic} from '../../src/search/symbolic';
import {preprocess} from '../../src/core/preprocess';
import {DEFAULT_OPTIONS} from '../../src/core/options';
import {makeStroke} from '../fixtures/generateStroke';

it('recovers sin(x²) as a compact symbolic candidate',()=>{
  const points=makeStroke(x=>Math.sin(x*x),{min:-2,max:2,noise:.004,seed:29});
  const result=solveCurve(points,{maxStructuralComplexity:12,timeBudgetMs:1500});
  expect(result.pareto.some(c=>c.modelFamily==='symbolic'&&c.rmse<.07)).toBe(true);
});
it('reaches symbolic models through the actual single-stroke worker path',async()=>{
  const points=makeStroke(x=>Math.sin(x*x),{min:-2,max:2,noise:.004,seed:29});
  const result=(await solveStrokesProgressive([points],'per-stroke',
    {timeBudgetMs:4000,simplify:{enabled:false}})).groups[0].result;
  expect(result.diagnostics.maxComplexityReached).toBeGreaterThanOrEqual(3);
  expect(result.pareto.some(candidate=>candidate.modelFamily==='symbolic'&&candidate.rmse<.03)).toBe(true);
  expect(result.balanced.plain).toContain('sin(');
  expect(result.balanced.plain.length).toBeLessThan(55);
});
it('bounds each structural beam size',()=>{
  const points=makeStroke(x=>Math.sin(x*x),{min:-2,max:2,noise:.004,seed:29});
  const prepared=preprocess(points);
  if(prepared.mode!=='function')throw Error('Expected scalar curve');
  const sizes:number[]=[];
  const context={options:{...DEFAULT_OPTIONS,maxStructuralComplexity:4},deadline:performance.now()+1000,
    shouldAbort:()=>false,now:()=>performance.now()};
  [...searchSymbolic(prepared.data,context,(_level,size)=>sizes.push(size))];
  expect(Math.max(...sizes)).toBeLessThanOrEqual(300);
});
