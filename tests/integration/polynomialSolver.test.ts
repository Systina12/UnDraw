import {describe,it,expect} from 'vitest';
import {solveCurve} from '../../src/core/solver';
import {evaluate} from '../../src/expr/evaluate';
import {makeStroke} from '../fixtures/generateStroke';
import {chebyshevToPower} from '../../src/expr/polynomial';
import {preprocess} from '../../src/core/preprocess';
import {fitPolynomial} from '../../src/models/polynomial';
import {CandidatePool} from '../../src/search/candidatePool';
import {displayExpr} from '../../src/expr/display';
import type {Expr} from '../../src/expr/ast';
import {constant,variable,add} from '../../src/expr/ast';
import {fitFourier} from '../../src/models/fourier';

describe('synchronous curve solver',()=>{
  it('rejects an unobserved rational pole between sampled coordinates',()=>{
    const prepared=preprocess(Array.from({length:100},(_,i)=>{
      const x=-1+2*i/99;return {x,y:x,t:i};
    }));
    expect(prepared.mode).toBe('function');
    if(prepared.mode!=='function')return;
    const pool=new CandidatePool(prepared.data);
    expect(pool.add({expr:{kind:'div',a:constant(1),b:add(variable(),constant(-.12345))},
      modelFamily:'rational',params:[],freeParameterCount:2,approximation:false})).toBe(false);
  });
  it('avoids large cancelling Fourier amplitudes on a smooth polynomial',()=>{
    const prepared=preprocess(Array.from({length:160},(_,i)=>{
      const x=-1+2*i/159;return {x,y:x**4+2*x,t:i};
    }));
    expect(prepared.mode).toBe('function');
    if(prepared.mode!=='function')return;
    const fits=fitFourier(prepared.data,2);
    expect(fits.length).toBeGreaterThan(0);
    const amplitudes:number[]=[];
    function scan(expr:Expr):void {
      if(expr.kind==='const'&&expr.value.kind==='float')amplitudes.push(Math.abs(expr.value.value));
      else if(expr.kind==='add'||expr.kind==='mul')expr.args.forEach(scan);
      else if(expr.kind==='div'){scan(expr.a);scan(expr.b);}
      else if(expr.kind==='pow'){scan(expr.base);scan(expr.exponent);}
      else if('arg' in expr)scan(expr.arg);
    }
    fits.forEach(fit=>scan(fit.expr));
    expect(Math.max(...amplitudes)).toBeLessThan(30);
  });
  it('scores the printed polynomial without catastrophic cancellation on a short domain',()=>{
    const points=Array.from({length:100},(_,i)=>{
      const x=3+.5*i/99;
      return {x,y:Math.sin(13*x),t:i};
    });
    const prepared=preprocess(points);
    expect(prepared.mode).toBe('function');
    if(prepared.mode!=='function')return;
    const draft=fitPolynomial(prepared.data,8);
    expect(draft).not.toBeNull();
    const pool=new CandidatePool(prepared.data);
    expect(pool.add(draft!)).toBe(true);
    const candidate=pool.all()[0];
    let maxConstant=0;
    function inspect(expr:Expr):void {
      if(expr.kind==='const'){
        if(expr.value.kind==='float')maxConstant=Math.max(maxConstant,Math.abs(expr.value.value));
      }else if(expr.kind==='add'||expr.kind==='mul')expr.args.forEach(inspect);
      else if(expr.kind==='div'){inspect(expr.a);inspect(expr.b);}
      else if(expr.kind==='pow'){inspect(expr.base);inspect(expr.exponent);}
      else if('arg' in expr)inspect(expr.arg);
    }
    inspect(candidate.expr);
    expect(maxConstant).toBeLessThan(100);
    const printed=displayExpr(candidate.expr);
    const rmse=Math.sqrt(prepared.data.x.reduce((sum,x,i)=>{
      const error=evaluate(printed,x).value-prepared.data.rawY[i];
      return sum+error*error;
    },0)/prepared.data.x.length);
    expect(rmse).toBeCloseTo(candidate.metrics.rmse,9);
    expect(rmse).toBeLessThan(.002);
  });
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
