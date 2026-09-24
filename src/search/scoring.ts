import type {Expr,Constant} from '../expr/ast';
import {operatorComplexity} from '../expr/complexity';

export function scoreMdl({mseNormalized,sigmaNormalized,n,k}:{mseNormalized:number;sigmaNormalized:number;n:number;k:number}):number {
  return n*Math.log(Math.max(mseNormalized,sigmaNormalized*sigmaNormalized,1e-16))+k*Math.log(n);
}
export function constantCost(constant:Constant):number {
  switch(constant.kind){
    case 'integer':return Math.abs(constant.value)<=10?0:1;
    case 'rational':return .4+.8*Math.log2(Math.max(1,constant.q))+.08*Math.log2(Math.max(1,Math.abs(constant.p)));
    case 'piMultiple':return .2+.65*Math.log2(Math.max(1,constant.q))+.08*Math.log2(Math.max(1,Math.abs(constant.p)));
    case 'eMultiple':return .6+.8*Math.log2(Math.max(1,constant.q))+
      .08*Math.log2(Math.max(1,Math.abs(constant.p)));
    case 'sqrtMultiple':return .6+.8*Math.log2(Math.max(1,constant.q))+
      .08*Math.log2(Math.max(1,Math.abs(constant.p)));
    case 'float':return Number.isInteger(constant.value)&&Math.abs(constant.value)<=10?0:2.5;
  }
}
export function expressionConstantCost(expr:Expr):number {
  let costs=0;
  function walk(e:Expr):void {
    if(e.kind==='const')costs+=constantCost(e.value);
    else if(e.kind==='add'||e.kind==='mul')e.args.forEach(walk);
    else if(e.kind==='div'){walk(e.a);walk(e.b);}
    else if(e.kind==='pow'){walk(e.base);walk(e.exponent);}
    else if('arg' in e)walk(e.arg);
  }
  walk(expr);
  return costs;
}
export function expressionCost(expr:Expr,freeParams:number):number {
  return freeParams+.7*operatorComplexity(expr)+expressionConstantCost(expr);
}
