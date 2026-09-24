import type { Expr, Constant } from './ast';
import {displayNumber} from './display';

function latexConstant(c:Constant):string {
  if(c.kind==='integer'||c.kind==='float')return String(displayNumber(c.value));
  if(c.p===0)return '0';
  const coefficient=c.q===1?(Math.abs(c.p)===1?'':String(Math.abs(c.p))):`\\frac{${Math.abs(c.p)}}{${c.q}}`;
  const sign=c.p<0?'-':'';
  if(c.kind==='rational')return c.q===1?String(c.p):`${sign}\\frac{${Math.abs(c.p)}}{${c.q}}`;
  const suffix=c.kind==='piMultiple'?'\\pi':c.kind==='eMultiple'?'e':`\\sqrt{${c.n}}`;
  return `${sign}${coefficient}${suffix}`;
}

export function toLatex(expr:Expr):string {
  switch(expr.kind){
    case 'var':return expr.name;
    case 'const':return latexConstant(expr.value);
    case 'add':return expr.args.map(toLatex).join(' + ');
    case 'mul':return expr.args.map(v=>v.kind==='add'?`\\left(${toLatex(v)}\\right)`:toLatex(v)).join('\\cdot ');
    case 'div':return `\\frac{${toLatex(expr.a)}}{${toLatex(expr.b)}}`;
    case 'pow':return `{${toLatex(expr.base)}}^{${toLatex(expr.exponent)}}`;
    case 'abs':return `\\left|${toLatex(expr.arg)}\\right|`;
    case 'sqrt':return `\\sqrt{${toLatex(expr.arg)}}`;
    default:return `\\${expr.kind}\\left(${toLatex(expr.arg)}\\right)`;
  }
}
