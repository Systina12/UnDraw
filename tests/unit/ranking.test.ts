import {describe,it,expect} from 'vitest';
import {scoreMdl} from '../../src/search/scoring';
import {paretoPrune,selectRepresentatives} from '../../src/search/pareto';
import {CandidatePool} from '../../src/search/candidatePool';
import {normalizeCurve} from '../../src/core/normalize';
import {integer,variable,add,type Expr} from '../../src/expr/ast';
import type {Candidate} from '../../src/search/producer';

const fixture=(rmse:number,complexity:number,score:number):Candidate=>({
  expr:integer(0),params:[],modelFamily:'test',approximation:false,freeParameterCount:0,
  metrics:{rmse,normalizedRmse:rmse,mseNormalized:rmse*rmse,robustError:rmse,maxError:rmse},
  complexity,score,signature:`${rmse}:${complexity}`,
});

describe('noise-aware candidate selection',()=>{
  it('caps benefits to the measured drawing noise and prunes dominance',()=>{
    expect(scoreMdl({mseNormalized:.0001,sigmaNormalized:.01,n:256,k:3}))
      .toBe(scoreMdl({mseNormalized:.00001,sigmaNormalized:.01,n:256,k:3}));
    const frontier=paretoPrune([fixture(.02,2,10),fixture(.01,5,12),fixture(.03,8,14)]);
    expect(frontier).toHaveLength(2);
    const selected=selectRepresentatives(frontier,.015);
    expect(selected.simple.metrics.rmse).toBe(.02);
    expect(selected.accurate.metrics.rmse).toBe(.01);
  });
  it('deduplicates structurally equal candidates and stays bounded',()=>{
    const x=Float64Array.from({length:20},(_,i)=>i/10);
    const rawY=Float64Array.from(x,v=>v+1);
    const data=normalizeCurve({x,rawY,weights:new Float64Array(20).fill(1),domain:[0,1.9]},rawY,.01);
    const pool=new CandidatePool(data,3);
    const expr:Expr=add(variable(),integer(1));
    expect(pool.add({expr,params:[],modelFamily:'line',freeParameterCount:2,approximation:false})).toBe(true);
    expect(pool.add({expr,params:[],modelFamily:'line',freeParameterCount:2,approximation:false})).toBe(false);
    for(let i=0;i<10;i++)pool.add({expr:integer(i),params:[],modelFamily:'const',freeParameterCount:1,approximation:false});
    expect(pool.size).toBeLessThanOrEqual(3);
    expect(pool.frontier().length).toBeGreaterThan(0);
  });
  it('retains the most accurate end of a long Pareto frontier',()=>{
    const frontier=paretoPrune(Array.from({length:36},(_,i)=>fixture(36-i,i+1,i)));
    expect(frontier).toHaveLength(36);
    expect(selectRepresentatives(frontier,.001).accurate.metrics.rmse).toBe(1);
    expect(paretoPrune(frontier,8).at(-1)?.metrics.rmse).toBe(1);
  });
  it('replaces duplicate expressions when the same shape needs fewer free parameters',()=>{
    const x=Float64Array.from({length:20},(_,i)=>i/10);
    const rawY=Float64Array.from(x,v=>v+1);
    const data=normalizeCurve({x,rawY,weights:new Float64Array(20).fill(1),domain:[0,1.9]},rawY,.01);
    const pool=new CandidatePool(data);
    const expr=add(variable(),integer(1));
    expect(pool.add({expr,params:[],modelFamily:'overfit',freeParameterCount:8,approximation:false})).toBe(true);
    expect(pool.add({expr,params:[],modelFamily:'line',freeParameterCount:0,approximation:false})).toBe(true);
    expect(pool.all()).toHaveLength(1);
    expect(pool.all()[0].modelFamily).toBe('line');
    expect(pool.all()[0].freeParameterCount).toBe(0);
  });
});
