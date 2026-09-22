import type {CurveData} from '../core/normalize';
import {chebyshevToPower} from '../expr/polynomial';
import {leastSquares} from '../math/leastSquares';
import type {CandidateDraft} from '../search/producer';
import {draft,normalizedPolynomialToWorld} from './shared';

export function fitPolynomial(data:CurveData,degree:number):CandidateDraft|null {
  if(!Number.isInteger(degree)||degree<0||degree>16||data.x.length<=degree)return null;
  const rows=data.x.length,cols=degree+1,matrix=new Float64Array(rows*cols);
  for(let i=0;i<rows;i++){
    matrix[i*cols]=1;
    if(cols>1)matrix[i*cols+1]=data.u[i];
    for(let k=2;k<cols;k++)matrix[i*cols+k]=2*data.u[i]*matrix[i*cols+k-1]-matrix[i*cols+k-2];
  }
  try{
    const fit=leastSquares(matrix,rows,cols,data.v,data.weights);
    if(fit.rank<cols)return null;
    return draft(normalizedPolynomialToWorld(chebyshevToPower(fit.coefficients),data.normalization),degree>8?'Chebyshev approximation':'Polynomial',cols,degree>8);
  }catch{return null;}
}
