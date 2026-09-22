import type {Point} from '../../src/core/types';
export function makeStroke(f:(x:number)=>number,options:{min:number;max:number;noise?:number;seed?:number;count?:number}):Point[] {
  let seed=options.seed??1;
  const random=()=>{seed=(Math.imul(1664525,seed)+1013904223)|0;return (seed>>>0)/4294967296;};
  const gaussian=()=>Math.sqrt(-2*Math.log(Math.max(1e-12,random())))*Math.cos(2*Math.PI*random());
  const count=options.count??160;
  return Array.from({length:count},(_,i)=>{
    const x=options.min+(options.max-options.min)*i/(count-1);
    return {x,y:f(x)+(options.noise??0)*gaussian(),t:i};
  });
}
