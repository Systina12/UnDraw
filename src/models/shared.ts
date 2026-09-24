import {add,constant,mul,variable,type Expr} from '../expr/ast';
import {polynomialExpr} from '../expr/polynomial';
import {simplify} from '../expr/simplify';
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
  // Expanding a polynomial fitted near x=3 into x^8 can create enormous terms
  // that cancel only at full precision. Retain a centered Horner form whenever
  // six-digit coefficients in the expanded form would lose visible accuracy.
  const edge=Math.max(Math.abs(xc-xs),Math.abs(xc+xs));
  let term=1,termSum=0;
  for(const coefficient of world){
    termSum+=Math.abs(coefficient)*term;
    term*=edge;
  }
  if(coefficients.length>2&&(!Number.isFinite(termSum)||termSum>100*Math.max(ys,1e-9))){
    const u:Expr={kind:'div',a:add(variable(),constant(-xc)),b:constant(xs)};
    let horner:Expr=constant(coefficients.at(-1)??0);
    for(let k=coefficients.length-2;k>=0;k--){
      horner=add(constant(coefficients[k]),mul(u,horner));
    }
    return simplify(add(constant(yc),mul(constant(ys),horner)));
  }
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
