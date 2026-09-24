import type {Expr} from './ast';

/** The expression used for scoring must have the same numeric literals as the visible formula. */
export function displayNumber(value:number):number {
  return Number.isInteger(value)?value:Number(value.toPrecision(6));
}

export function displayExpr(expr:Expr):Expr {
  switch(expr.kind){
    case 'var':return expr;
    case 'const':return expr.value.kind==='float'?{
      kind:'const',value:{kind:'float',value:displayNumber(expr.value.value)},
    }:expr;
    case 'add':case 'mul':return {...expr,args:expr.args.map(displayExpr)};
    case 'div':return {...expr,a:displayExpr(expr.a),b:displayExpr(expr.b)};
    case 'pow':return {...expr,base:displayExpr(expr.base),exponent:displayExpr(expr.exponent)};
    default:return {...expr,arg:displayExpr(expr.arg)};
  }
}
