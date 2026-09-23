import {type Constant,numericConstant} from '../expr/ast';
import {rationalNear} from './rational';
import {constantCost} from '../search/scoring';

export function prettyAlternatives(value:number,limit=4):Constant[]{
  if(!Number.isFinite(value))return [];
  const tolerance=Math.max(.012,.008*Math.abs(value));
  const values:Constant[]=[];
  const append=(constant:Constant)=>{
    const actual=numericConstant(constant);
    if(Number.isFinite(actual)&&Math.abs(actual-value)<=tolerance&&
      !values.some(prior=>Math.abs(numericConstant(prior)-actual)<1e-10))values.push(constant);
  };
  for(let i=-10;i<=10;i++)append({kind:'integer',value:i});
  for(const {p,q} of rationalNear(value))append({kind:'rational',p,q});
  for(const base of [{kind:'piMultiple',value:Math.PI},{kind:'eMultiple',value:Math.E}] as const)
    for(const {p,q} of rationalNear(value/base.value))append({kind:base.kind,p,q});
  for(let n=2;n<=10;n++)for(const {p,q} of rationalNear(value/Math.sqrt(n)))append({kind:'sqrtMultiple',p,q,n});
  return values.sort((a,b)=>{
    const errorA=Math.abs(numericConstant(a)-value)/tolerance;
    const errorB=Math.abs(numericConstant(b)-value)/tolerance;
    return errorA+.04*constantCost(a)-errorB-.04*constantCost(b);
  }).slice(0,limit);
}
