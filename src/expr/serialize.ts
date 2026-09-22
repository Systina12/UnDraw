import type { Expr, Constant } from './ast';

const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
function validConstant(value:unknown):value is Constant {
  if(!object(value))return false;
  switch(value.kind){
    case 'float':return finite(value.value);
    case 'integer':return finite(value.value)&&Number.isInteger(value.value);
    case 'rational':case 'piMultiple':case 'eMultiple':
      return finite(value.p)&&Number.isInteger(value.p)&&finite(value.q)&&Number.isInteger(value.q)&&value.q>0;
    case 'sqrtMultiple':return finite(value.p)&&Number.isInteger(value.p)&&finite(value.q)&&Number.isInteger(value.q)&&value.q>0&&finite(value.n)&&Number.isInteger(value.n)&&value.n>=0;
    default:return false;
  }
}
function validExpr(value:unknown,depth=0):value is Expr {
  if(depth>40||!object(value))return false;
  if(value.kind==='var')return value.name==='x'||value.name==='t';
  if(value.kind==='const')return validConstant(value.value);
  if(value.kind==='add'||value.kind==='mul')return Array.isArray(value.args)&&value.args.length<=64&&value.args.every(child=>validExpr(child,depth+1));
  if(value.kind==='div')return validExpr(value.a,depth+1)&&validExpr(value.b,depth+1);
  if(value.kind==='pow')return validExpr(value.base,depth+1)&&validExpr(value.exponent,depth+1);
  if(['sin','cos','exp','log','abs','sqrt','tanh'].includes(String(value.kind)))return validExpr(value.arg,depth+1);
  return false;
}
export function serializeExpr(expr:Expr):string {if(!validExpr(expr))throw new RangeError('Invalid expression');return JSON.stringify(expr);}
export function deserializeExpr(serialized:string):Expr {
  const decoded:unknown=JSON.parse(serialized);
  if(!validExpr(decoded))throw new RangeError('Invalid expression');
  return decoded;
}
