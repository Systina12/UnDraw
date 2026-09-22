import type {CurveData} from '../core/normalize';
import type {CandidateDraft} from '../search/producer';
import {leastSquares} from '../math/leastSquares';
import {fitLm} from '../math/lm';
import {polynomialExpr} from '../expr/polynomial';
import {substituteVariable} from '../expr/substitute';
import {simplify} from '../expr/simplify';
import {constant,variable,add,mul,type Expr} from '../expr/ast';
import {draft} from './shared';

function poly(coefficients:ArrayLike<number>,x:number):number {
  let result=0;for(let i=coefficients.length-1;i>=0;i--)result=result*x+coefficients[i];return result;
}
export function hasDomainPole(denominator:ArrayLike<number>,domain:[number,number]):boolean {
  const steps=512;let last=poly(denominator,domain[0]);
  if(!Number.isFinite(last)||Math.abs(last)<1e-5)return true;
  for(let i=1;i<=steps;i++){
    const value=poly(denominator,domain[0]+(domain[1]-domain[0])*i/steps);
    if(!Number.isFinite(value)||Math.abs(value)<1e-5||Math.sign(last)!==Math.sign(value))return true;
    last=value;
  }
  return false;
}
export function fitRational(data:CurveData,m:number,n:number):CandidateDraft|null{
  if(m<0||m>3||n<1||n>2)return null;
  const rows=data.u.length,cols=m+1+n,matrix=new Float64Array(rows*cols),rhs=data.v;
  for(let i=0;i<rows;i++){
    let power=1;
    for(let j=0;j<=m;j++){matrix[i*cols+j]=power;power*=data.u[i];}
    power=data.u[i];for(let j=1;j<=n;j++){matrix[i*cols+m+j]=-data.v[i]*power;power*=data.u[i];}
  }
  try{
    const fit=leastSquares(matrix,rows,cols,rhs,data.weights);
    if(fit.rank<cols)return null;
    const denominator=[1,...fit.coefficients.slice(m+1)];
    if(hasDomainPole(denominator,[-1,1]))return null;
    const model=(params:Float64Array,u:number)=>{
      const den=poly([1,...params.slice(m+1)],u);
      return Math.abs(den)<1e-5?NaN:poly(params.slice(0,m+1),u)/den;
    };
    const refined=fitLm(model,data.v,fit.coefficients,{x:data.u,delta:Math.max(.01,1.5*data.sigmaDraw/data.normalization.ys),maxIterations:32});
    const params=refined.loss<Infinity&&
      !hasDomainPole([1,...refined.params.slice(m+1)],[-1,1])?refined.params:fit.coefficients;
    if(hasDomainPole([1,...params.slice(m+1)],[-1,1]))return null;
    const {xc,xs,yc,ys}=data.normalization;
    const u:Expr=simplify(mul(add(variable(),constant(-xc)),constant(1/xs)));
    const numerator=polynomialExpr([...params.slice(0,m+1)].map(v=>v*ys));
    const denominatorExpr=polynomialExpr([1,...params.slice(m+1)]);
    const ratio:Expr={kind:'div',a:substituteVariable(numerator,'x',u),b:substituteVariable(denominatorExpr,'x',u)};
    const expr=simplify(add(ratio,constant(yc)));
    return draft(expr,'rational',cols);
  }catch{return null;}
}
