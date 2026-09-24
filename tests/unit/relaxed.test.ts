import {expect,it} from 'vitest';
import {add,constant,integer,mul,variable,type Expr} from '../../src/expr/ast';
import {normalizeCurve} from '../../src/core/normalize';
import {CandidatePool} from '../../src/search/candidatePool';
import {finalizeFunctionResult} from '../../src/core/solver';
import {allowedChange,resolveSimplicity} from '../../src/beautify/relaxed';
import {solveStrokesProgressive} from '../../src/core/multi';

function sample(expr:Expr){
  const x=Float64Array.from({length:128},(_,i)=>-1+2*i/127);
  const rawY=Float64Array.from(x,v=>1.94*v+.07);
  const data=normalizeCurve({x,rawY,weights:new Float64Array(x.length).fill(1),domain:[-1,1]},rawY,.002);
  const pool=new CandidatePool(data);
  expect(pool.add({expr,modelFamily:'test',freeParameterCount:2,params:[],approximation:false})).toBe(true);
  return {pool,data};
}

it('rounds digits only when opted in and preserves the original Accurate fit',()=>{
  const original=add(mul(constant(1.94),variable()),constant(.07));
  const {pool,data}=sample(original);
  const exact=finalizeFunctionResult(pool,data,performance.now());
  const rounded=finalizeFunctionResult(pool,data,performance.now(),'completed',
    {enabled:true,tolerance:.1,translation:true,scaling:true,deformation:false});
  expect(exact.balanced.plain).toContain('1.94');
  expect(rounded.balanced.plain).toBe('2 * x');
  expect(rounded.accurate.plain).toEqual(exact.accurate.plain);
  expect(rounded.balanced.rmse).toBeGreaterThan(exact.balanced.rmse);
  expect(rounded.balanced.rmse).toBeLessThan(.18);
  expect(rounded.pareto.some(candidate=>candidate.plain===rounded.balanced.plain)).toBe(true);
});

it('allows translation and scaling independently, and blocks shape changes until enabled',()=>{
  const original=add(mul(constant(1.94),variable()),constant(.07));
  const {pool,data}=sample(original);
  const baseline=pool.all()[0];
  const trials=[integer(0),mul(integer(2),variable()),
    mul(constant(1.94),variable()),
    add(mul(integer(2),variable()),constant(.07)),
    add(mul(integer(2),variable()),mul(constant(.08),{kind:'sin',arg:mul(integer(4),variable())}))];
  for(const expr of trials)pool.add({expr,modelFamily:'test',freeParameterCount:0,params:[],approximation:false});
  const zero=pool.all().find(candidate=>candidate.expr.kind==='const')!;
  const shifted=pool.all().find(candidate=>candidate.expr.kind==='mul'&&
    JSON.stringify(candidate.expr).includes('1.94'))!;
  const scaled=pool.all().find(candidate=>candidate.expr.kind==='add'&&
    JSON.stringify(candidate.expr).includes('0.07')&&JSON.stringify(candidate.expr).includes('value":2'))!;
  const reshaped=pool.all().find(candidate=>JSON.stringify(candidate.expr).includes('sin'))!;
  expect(shifted).toBeDefined();expect(scaled).toBeDefined();expect(reshaped).toBeDefined();
  const config={enabled:true,tolerance:.1,translation:false,scaling:false,deformation:false};
  expect(allowedChange(baseline,zero,data,resolveSimplicity(config))).toBe(false);
  expect(allowedChange(baseline,shifted,data,resolveSimplicity({...config,translation:true}))).toBe(true);
  expect(allowedChange(baseline,scaled,data,resolveSimplicity({...config,scaling:true}))).toBe(true);
  expect(allowedChange(baseline,reshaped,data,resolveSimplicity({...config,translation:true,scaling:true}))).toBe(false);
  expect(allowedChange(baseline,reshaped,data,resolveSimplicity({...config,translation:true,scaling:true,deformation:true}))).toBe(true);
});

it('prefers a short ordinary fraction over an elaborate e multiple',async()=>{
  const points=Array.from({length:100},(_,i)=>{
    const x=-1+2*i/99;
    return {x,y:2*x+.23,t:i};
  });
  const result=(await solveStrokesProgressive([points],'per-stroke',
    {timeBudgetMs:0,simplify:{enabled:true,tolerance:.02,translation:true,scaling:false,
      deformation:false}})).groups[0].result;
  expect(result.balanced.plain).toBe('1/4 + 2 * x');
  expect(result.balanced.rmse).toBeLessThan(.04);
});
