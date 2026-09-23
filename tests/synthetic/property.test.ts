import {describe,it,expect} from 'vitest';
import {add,mul,variable,integer,constant,pow,type Expr} from '../../src/expr/ast';
import {canonicalize,structuralHash} from '../../src/expr/canonical';
import {simplify} from '../../src/expr/simplify';
import {evaluate} from '../../src/expr/evaluate';
import {ViewportTransform} from '../../src/ui/viewport';
import {makeStroke} from '../fixtures/generateStroke';
import {preprocess} from '../../src/core/preprocess';
import {solveCurve} from '../../src/core/solver';

describe('numerical and structural invariants',()=>{
  it('generates repeatable nonuniform strokes that retain drawing order when reversed',()=>{
    const options={min:-2,max:2,seed:311,noise:.02,wobble:.008,dropRate:.2,outliers:2,
      xJitter:.0004,reverse:true,nonuniform:true};
    const a=makeStroke(Math.sin,options),b=makeStroke(Math.sin,options);
    expect(a).toEqual(b);
    expect(a.length).toBeLessThan(160);
    expect(a[0].x).toBeGreaterThan(a.at(-1)!.x);
    expect(a.every((p,i)=>p.t===i)).toBe(true);
  });

  it('canonicalization and simplification are idempotent and preserve values',()=>{
    const x=variable();
    const expressions:Expr[]=[
      add(integer(0),mul(integer(2),x),x),
      mul(add(x,constant(.5)),integer(1),pow(x,integer(2))),
      {kind:'sin',arg:mul(integer(-1),add(x,integer(1)))},
      {kind:'div',a:pow(x,integer(2)),b:add(x,integer(3))},
    ];
    for(const expr of expressions){
      const canonical=canonicalize(expr),simplified=simplify(canonical,[-2,2]);
      expect(structuralHash(canonicalize(canonical))).toBe(structuralHash(canonical));
      expect(structuralHash(simplify(simplified,[-2,2]))).toBe(structuralHash(simplified));
      for(let i=0;i<=30;i++){
        const input=-2+4*i/30;
        expect(evaluate(simplified,input).value).toBeCloseTo(evaluate(expr,input).value,8);
      }
    }
  });

  it('viewport and normalization invert their own coordinate transforms',()=>{
    const view=new ViewportTransform({xMin:-3,xMax:7,yMin:-4,yMax:9},700,390);
    for(let i=0;i<=40;i++){
      const x=-3+10*i/40,y=-4+13*((i*19)%41)/40;
      const point=view.worldToScreen(x,y),recovered=view.screenToWorld(point.x,point.y);
      expect(recovered.x).toBeCloseTo(x,10);expect(recovered.y).toBeCloseTo(y,10);
    }
    const prepared=preprocess(makeStroke(x=>x*x+2,{min:-2,max:2,seed:7}));
    expect(prepared.mode).toBe('function');
    if(prepared.mode!=='function')return;
    const data=prepared.data,{xc,xs,yc,ys}=data.normalization;
    for(let i=0;i<data.x.length;i++){
      expect(xc+data.u[i]*xs).toBeCloseTo(data.x[i],10);
      expect(yc+data.v[i]*ys).toBeCloseTo(data.rawY[i],10);
    }
  });

  it('returns a non-dominated frontier for noisy synthetic curves',()=>{
    const result=solveCurve(makeStroke(x=>2*Math.sin(Math.PI*x),{min:-1,max:1,noise:.012,seed:23}));
    for(const a of result.pareto)for(const b of result.pareto){
      if(a===b)continue;
      expect(a.complexity<=b.complexity&&a.rmse<=b.rmse-1e-9).toBe(false);
    }
  },20_000);
});
