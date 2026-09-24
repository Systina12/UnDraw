import {expect,it} from 'vitest';
import {solveStrokesProgressive} from '../../src/core/multi';
import {makeStroke} from '../fixtures/generateStroke';

const line=(min:number,max:number,offset=0)=>makeStroke(x=>x+offset,{min,max,count:40});

it('keeps overlapping different strokes as separate functions',async()=>{
  const strokes=[line(-2,2),line(-2,2,3)];
  const per=await solveStrokesProgressive(strokes,'per-stroke',{timeBudgetMs:0});
  expect(per.groups).toHaveLength(2);
  expect(per.groups.map(group=>group.strokeIndices)).toEqual([[0],[1]]);
  const automatic=await solveStrokesProgressive(strokes,'auto',{timeBudgetMs:0});
  expect(automatic.groups).toHaveLength(2);
});

it('joins collinear strokes when one expression explains both',async()=>{
  const result=await solveStrokesProgressive([line(-2,-.3),line(.3,2)],'auto',{timeBudgetMs:0});
  expect(result.groups).toHaveLength(1);
  expect(result.groups[0].strokeIndices).toEqual([0,1]);
  expect(result.groups[0].result.balanced.rmse).toBeLessThan(.15);
  expect(result.groups[0].result.domain[0]).toBeLessThan(-1.9);
  expect(result.groups[0].result.domain[1]).toBeGreaterThan(1.9);
  expect(Math.max(...result.groups[0].result.balanced.plot.x)).toBeGreaterThan(1.9);
});

it('keeps the full domain after repeatedly merging disconnected strokes',async()=>{
  const strokes=Array.from({length:6},(_,i)=>line(i*1.2,i*1.2+1));
  const result=await solveStrokesProgressive(strokes,'auto',{timeBudgetMs:0});
  expect(result.groups).toHaveLength(1);
  expect(result.groups[0].strokeIndices).toEqual([0,1,2,3,4,5]);
  expect(result.groups[0].result.domain[1]).toBeGreaterThan(6.9);
});

it('combines overlapping redraws of the same function',async()=>{
  const first=makeStroke(x=>x*x,{min:-1,max:1,count:64,noise:.003,seed:2});
  const second=makeStroke(x=>x*x,{min:-1,max:1,count:64,noise:.003,seed:3});
  const result=await solveStrokesProgressive([first,second],'auto',{timeBudgetMs:0});
  expect(result.groups).toHaveLength(1);
  expect(result.groups[0].strokeIndices).toEqual([0,1]);
});

it('retains as many functions as distinct overlapping traces require',async()=>{
  const strokes=[0,1,2].map(offset=>makeStroke(x=>x+offset,{min:-1,max:1,count:40}));
  const result=await solveStrokesProgressive(strokes,'auto',{timeBudgetMs:0});
  expect(result.groups).toHaveLength(3);
});

it('can merge scalar strokes while retaining a separate parametric trace',async()=>{
  const vertical=Array.from({length:30},(_,i)=>({x:3,y:-1+2*i/29,t:i}));
  const result=await solveStrokesProgressive([vertical,line(-2,-.3),line(.3,2)],'auto',
    {timeBudgetMs:0});
  expect(result.groups).toHaveLength(2);
  expect(result.groups.find(group=>group.result.mode==='parametric')?.strokeIndices).toEqual([0]);
  expect(result.groups.find(group=>group.result.mode==='function')?.strokeIndices).toEqual([1,2]);
});

it('splits a backtracking circle into function branches in automatic mode',async()=>{
  const circle=Array.from({length:121},(_,i)=>{
    const angle=2*Math.PI*i/120;
    return {x:Math.cos(angle),y:Math.sin(angle),t:i};
  });
  const result=await solveStrokesProgressive([circle],'auto',{timeBudgetMs:0});
  expect(result.groups.length).toBeGreaterThanOrEqual(2);
  expect(result.groups.every(group=>group.result.mode==='function')).toBe(true);
});

it('uses more than one function for a continuous monotone piecewise curve when it fits better',async()=>{
  const stroke=makeStroke(x=>x<0?x:x*x,{min:-2,max:2,count:100,noise:.002,seed:42});
  const result=await solveStrokesProgressive([stroke],'auto',{timeBudgetMs:0});
  expect(result.groups.length).toBeGreaterThanOrEqual(2);
  expect(result.groups.every(group=>group.result.mode==='function')).toBe(true);
});

it('keeps a simple noisy sinusoid as one function',async()=>{
  const stroke=makeStroke(x=>2*Math.sin(Math.PI*x),{min:-2,max:2,count:100,noise:.008,seed:10});
  const result=await solveStrokesProgressive([stroke],'auto',{timeBudgetMs:0});
  expect(result.groups).toHaveLength(1);
});

it('rounds each stroke after fitting, without changing automatic function grouping',async()=>{
  const strokes=[0,3].map(offset=>makeStroke(x=>1.94*x+.07+offset,
    {min:-1,max:1,count:40}));
  const options={timeBudgetMs:0,simplify:{enabled:true,tolerance:.1,
    translation:true,scaling:true,deformation:false}};
  const per=await solveStrokesProgressive(strokes,'per-stroke',options);
  expect(per.groups).toHaveLength(2);
  for(const group of per.groups){
    expect(group.result.mode).toBe('function');
    expect(group.result.balanced.plain.length).toBeLessThanOrEqual(group.result.accurate.plain.length);
    expect(group.result.balanced.rmse).toBeLessThan(.2);
  }
  const automatic=await solveStrokesProgressive(strokes,'auto',options);
  expect(automatic.groups).toHaveLength(2);
});

it('keeps a parametric expression and its accurate version with simplification enabled',async()=>{
  const circle=Array.from({length:100},(_,i)=>({x:1.94*Math.cos(2*Math.PI*i/99),
    y:1.94*Math.sin(2*Math.PI*i/99),t:i}));
  const result=await solveStrokesProgressive([circle],'per-stroke',
    {timeBudgetMs:0,simplify:{enabled:true,tolerance:.1,translation:true,scaling:true,deformation:true}});
  expect(result.groups[0].result.mode).toBe('parametric');
  expect(result.groups[0].result.balanced.parametric?.xPlain).toContain('t');
  expect(result.groups[0].result.accurate.rmse).toBeLessThan(.5);
});
