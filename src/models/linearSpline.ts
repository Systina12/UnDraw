import type {CurveData} from '../core/normalize';
import {add,constant,mul,variable,type Expr} from '../expr/ast';
import {simplify} from '../expr/simplify';
import {leastSquares} from '../math/leastSquares';
import {draft} from './shared';
import type {CandidateDraft} from '../search/producer';

/** Continuous piecewise linear approximation in the parameter t. Absolute-value
 * hinges fit sharp turns without polynomial endpoint excursions. */
export function fitLinearSpline(data:CurveData,knotCount:number):CandidateDraft|null {
  const columns=knotCount+2,rows=data.x.length;
  if(!Number.isInteger(knotCount)||knotCount<1||knotCount>16||rows<=columns)return null;
  const matrix=new Float64Array(rows*columns);
  const start=data.x[0],span=data.x.at(-1)!-start;
  if(!(span>0))return null;
  const knots=Array.from({length:knotCount},(_,j)=>
    start+span*(j+1)/(knotCount+1));
  for(let i=0;i<rows;i++){
    const offset=i*columns,t=data.x[i];
    matrix[offset]=1;matrix[offset+1]=t;
    for(let j=0;j<knotCount;j++)matrix[offset+j+2]=Math.abs(t-knots[j]);
  }
  try{
    const fit=leastSquares(matrix,rows,columns,data.v,data.weights);
    if(fit.rank<columns)return null;
    const {yc,ys}=data.normalization;
    const terms:Expr[]=[constant(yc+ys*fit.coefficients[0]),
      mul(constant(ys*fit.coefficients[1]),variable())];
    for(let j=0;j<knotCount;j++)terms.push(mul(
      constant(ys*fit.coefficients[j+2]),
      {kind:'abs',arg:add(variable(),constant(-knots[j]))}));
    return draft(simplify(add(...terms)),'spline approximation',columns,true);
  }catch{return null;}
}
