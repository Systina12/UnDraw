import {type Expr,add,constant,integer,mul,pow,variable,numericConstant} from './ast';
import {simplify} from './simplify';

/** Standard power coefficients from a Chebyshev expansion. */
export function chebyshevToPower(coefficients:ArrayLike<number>):number[] {
  const result:number[]=[];
  let prev=[1],current=[0,1];
  for(let n=0;n<coefficients.length;n++){
    const basis=n===0?prev:n===1?current:current;
    for(let j=0;j<basis.length;j++)result[j]=(result[j]??0)+coefficients[n]*basis[j];
    const next=Array(Math.max(current.length+1,prev.length)).fill(0) as number[];
    for(let j=0;j<current.length;j++)next[j+1]+=2*current[j];
    for(let j=0;j<prev.length;j++)next[j]-=prev[j];
    prev=current;current=next;
  }
  return result;
}
export function polynomialExpr(coefficients:ArrayLike<number>,input:Expr=variable()):Expr {
  const terms:Expr[]=[];
  for(let j=0;j<coefficients.length;j++){
    const c=coefficients[j];
    if(Math.abs(c)<1e-11)continue;
    const factor=j===0?constant(c):j===1?input:pow(input,integer(j));
    terms.push(j===0?factor:Math.abs(c-1)<1e-11?factor:mul(constant(c),factor));
  }
  return simplify(terms.length?add(...terms):integer(0));
}
export function polynomialCoefficients(expr:Expr,limit=16):number[]|null {
  switch(expr.kind){
    case 'const':return [numericConstant(expr.value)];
    case 'var':return expr.name==='x'?[0,1]:null;
    case 'add':{
      const result:number[]=[];
      for(const child of expr.args){const c=polynomialCoefficients(child,limit);if(!c)return null;for(let j=0;j<c.length;j++)result[j]=(result[j]??0)+c[j];}
      return result;
    }
    case 'mul':{
      let result=[1];
      for(const child of expr.args){const c=polynomialCoefficients(child,limit);if(!c||c.length+result.length-2>limit)return null;
        const next=Array(result.length+c.length-1).fill(0) as number[];
        for(let i=0;i<result.length;i++)for(let j=0;j<c.length;j++)next[i+j]+=result[i]*c[j];result=next;}
      return result;
    }
    case 'pow':{
      if(expr.exponent.kind!=='const')return null;
      const exponent=numericConstant(expr.exponent.value);
      if(!Number.isInteger(exponent)||exponent<0||exponent>limit)return null;
      return polynomialCoefficients({kind:'mul',args:Array(exponent).fill(expr.base) as Expr[]},limit);
    }
    default:return null;
  }
}
