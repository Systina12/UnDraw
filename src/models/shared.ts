import type {Expr} from '../expr/ast';
import {polynomialExpr} from '../expr/polynomial';
import type {CurveData,Normalization} from '../core/normalize';
import type {CandidateDraft} from '../search/producer';
import {leastSquares} from '../math/leastSquares';

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

export function projectLinear(data:CurveData,columns:(u:number)=>number[]):{coefficients:Float64Array;error:number}|null {
  const n=data.x.length,first=columns(data.u[0]),p=first.length;
  if(p<1||p>10)return null;
  const matrix=new Float64Array(n*p);
  for(let i=0;i<n;i++){
    const values=i===0?first:columns(data.u[i]);
    if(values.length!==p||values.some(v=>!Number.isFinite(v)||Math.abs(v)>1e100))return null;
    for(let j=0;j<p;j++)matrix[i*p+j]=values[j];
  }
  try{
    const fit=leastSquares(matrix,n,p,data.v,data.weights);
    if(fit.rank<p)return null;
    let error=0;
    for(let i=0;i<n;i++){
      let predicted=0;for(let j=0;j<p;j++)predicted+=matrix[i*p+j]*fit.coefficients[j];
      error+=(predicted-data.v[i])**2;
    }
    return {coefficients:fit.coefficients,error:error/n};
  }catch{return null;}
}
