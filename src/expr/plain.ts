import type { Expr, Constant } from './ast';
import {displayNumber} from './display';

export function plainConstant(c:Constant):string {
  if(c.kind==='integer'||c.kind==='float')return String(displayNumber(c.value));
  const fraction=c.q===1?(Math.abs(c.p)===1?'':String(Math.abs(c.p))):`${Math.abs(c.p)}/${c.q}*`;
  const sign=c.p<0?'-':'';
  if(c.p===0)return '0';
  if(c.kind==='rational')return c.q===1?String(c.p):`${c.p}/${c.q}`;
  return `${sign}${fraction}${c.kind==='piMultiple'?'pi':c.kind==='eMultiple'?'e':`sqrt(${c.n})`}`;
}

export function toPlain(expr:Expr):string {
  switch(expr.kind){
    case 'var':return expr.name;
    case 'const':return plainConstant(expr.value);
    case 'add':return expr.args.map(toPlain).join(' + ');
    case 'mul':return expr.args.map(v=>v.kind==='add'?`(${toPlain(v)})`:toPlain(v)).join(' * ');
    case 'div':return `(${toPlain(expr.a)}) / (${toPlain(expr.b)})`;
    case 'pow':return `(${toPlain(expr.base)})^(${toPlain(expr.exponent)})`;
    default:return `${expr.kind}(${toPlain(expr.arg)})`;
  }
}
