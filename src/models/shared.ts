import type {Expr} from '../expr/ast';
import {polynomialExpr} from '../expr/polynomial';
import type {CurveData,Normalization} from '../core/normalize';
import type {CandidateDraft} from '../search/producer';

export function normalizedPolynomialToWorld(coefficients:ReadonlyArray<number>,normalization:Normalization):Expr {
  const {xc,xs,yc,ys}=normalization;
  let world:number[]=[];
  for(let k=coefficients.length-1;k>=0;k--){
    const next=Array(world.length+1).fill(0) as number[];
    for(let j=0;j<world.length;j++){
      next[j]+=-xc*world[j]/xs;
      next[j+1]+=world[j]/xs;
    }
    next[0]+=coefficients[k];
    world=next;
  }
  for(let j=0;j<world.length;j++)world[j]*=ys;
  world[0]+=yc;
  return polynomialExpr(world);
}

export function draft(expr:Expr,modelFamily:string,freeParameterCount:number,approximation=false):CandidateDraft {
  return {expr,modelFamily,freeParameterCount,approximation,params:[]};
}
export function normalizedToWorld(data:CurveData,value:number):number {
  return data.normalization.yc+value*data.normalization.ys;
}
