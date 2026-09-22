import { type Expr, numericConstant } from './ast';

export type Evaluation = {value:number;valid:boolean};
const INVALID:Evaluation={value:NaN,valid:false};
const safe=(value:number):Evaluation => Number.isFinite(value)&&Math.abs(value)<=1e100?{value,valid:true}:INVALID;

export function evaluate(expr:Expr,input:number):Evaluation {
  if (!Number.isFinite(input)) return INVALID;
  switch(expr.kind) {
    case 'var': return safe(input);
    case 'const': return safe(numericConstant(expr.value));
    case 'add': case 'mul': {
      let value=expr.kind==='add'?0:1;
      for(const child of expr.args) {
        const result=evaluate(child,input);
        if(!result.valid)return INVALID;
        value=expr.kind==='add'?value+result.value:value*result.value;
        if(!Number.isFinite(value)||Math.abs(value)>1e100)return INVALID;
      }
      return safe(value);
    }
    case 'div': {
      const a=evaluate(expr.a,input),b=evaluate(expr.b,input);
      return a.valid&&b.valid&&Math.abs(b.value)>=1e-10?safe(a.value/b.value):INVALID;
    }
    case 'pow': {
      const a=evaluate(expr.base,input),b=evaluate(expr.exponent,input);
      if(!a.valid||!b.valid||a.value===0&&b.value<0||a.value<0&&!Number.isInteger(b.value))return INVALID;
      return safe(Math.pow(a.value,b.value));
    }
    default: {
      const a=evaluate(expr.arg,input);
      if(!a.valid)return INVALID;
      if(expr.kind==='exp'&&Math.abs(a.value)>30||expr.kind==='log'&&a.value<=0||expr.kind==='sqrt'&&a.value<0)return INVALID;
      const result=expr.kind==='sin'?Math.sin(a.value):expr.kind==='cos'?Math.cos(a.value):
        expr.kind==='exp'?Math.exp(a.value):expr.kind==='log'?Math.log(a.value):
        expr.kind==='sqrt'?Math.sqrt(a.value):expr.kind==='tanh'?Math.tanh(a.value):Math.abs(a.value);
      return safe(result);
    }
  }
}
