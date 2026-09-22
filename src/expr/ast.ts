export type VariableName = 'x' | 't';
export type Constant =
  | {kind:'float';value:number}
  | {kind:'integer';value:number}
  | {kind:'rational';p:number;q:number}
  | {kind:'piMultiple';p:number;q:number}
  | {kind:'eMultiple';p:number;q:number}
  | {kind:'sqrtMultiple';p:number;q:number;n:number};

export type Expr =
  | {kind:'var';name:VariableName}
  | {kind:'const';value:Constant}
  | {kind:'add'|'mul';args:Expr[]}
  | {kind:'div';a:Expr;b:Expr}
  | {kind:'pow';base:Expr;exponent:Expr}
  | {kind:'sin'|'cos'|'exp'|'log'|'abs'|'sqrt'|'tanh';arg:Expr};

export const variable = (name:VariableName='x'):Expr => ({kind:'var',name});
export const constant = (value:number):Expr => ({kind:'const',value:{kind:'float',value}});
export const integer = (value:number):Expr => ({kind:'const',value:{kind:'integer',value}});
export const add = (...args:Expr[]):Expr => ({kind:'add',args});
export const mul = (...args:Expr[]):Expr => ({kind:'mul',args});
export const pow = (base:Expr,exponent:Expr):Expr => ({kind:'pow',base,exponent});

export function numericConstant(value:Constant):number {
  if (value.kind==='float'||value.kind==='integer') return value.value;
  if (!value.q) return NaN;
  const base = value.p/value.q;
  if (value.kind==='piMultiple') return base*Math.PI;
  if (value.kind==='eMultiple') return base*Math.E;
  if (value.kind==='sqrtMultiple') return base*Math.sqrt(value.n);
  return base;
}
