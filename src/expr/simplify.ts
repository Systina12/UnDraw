import {type Expr,integer,constant,numericConstant,mul,pow} from './ast';
import {canonicalize,structuralHash} from './canonical';

const val=(e:Expr):number|null=>e.kind==='const'?numericConstant(e.value):null;
const is=(e:Expr,n:number)=>val(e)===n;
const closeZero=(n:number)=>Math.abs(n)<1e-11;

export function simplify(expr:Expr,domain?:[number,number]):Expr {
  switch(expr.kind){
    case 'var':case 'const':return expr;
    case 'div':{
      const a=simplify(expr.a,domain),b=simplify(expr.b,domain);
      if(is(a,0)&&val(b)!==0)return integer(0);
      if(is(b,1))return a;
      if(val(a)!==null&&val(b)!==null&&val(b)!==0)return constant(val(a)!/val(b)!);
      return {kind:'div',a,b};
    }
    case 'pow':{
      const base=simplify(expr.base,domain),exponent=simplify(expr.exponent,domain);
      if(is(exponent,0))return integer(1);
      if(is(exponent,1))return base;
      if(val(base)!==null&&val(exponent)!==null){const n=Math.pow(val(base)!,val(exponent)!);if(Number.isFinite(n))return constant(n);}
      return {kind:'pow',base,exponent};
    }
    case 'add':{
      const flat=expr.args.map(e=>simplify(e,domain)).flatMap(e=>e.kind==='add'?e.args:[e]);
      const terms=new Map<string,{expr:Expr;factor:number}>();
      let total=0;const constants:Expr[]=[];
      for(const item of flat){
        if(item.kind==='const'){total+=numericConstant(item.value);constants.push(item);continue;}
        let factor=1,base:Expr=item;
        if(item.kind==='mul'&&item.args.length>1&&item.args[0].kind==='const'&&item.args[0].value.kind==='float'){
          factor=numericConstant(item.args[0].value);base=item.args.length===2?item.args[1]:mul(...item.args.slice(1));
        }
        const key=structuralHash(base),prior=terms.get(key);
        terms.set(key,{expr:base,factor:factor+(prior?.factor??0)});
      }
      const args:Expr[]=[];
      if(!closeZero(total))args.push(constants.length===1?constants[0]:constant(total));
      for(const {expr:term,factor} of terms.values())if(!closeZero(factor))args.push(factor===1?term:simplify(mul(constant(factor),term),domain));
      if(!args.length)return integer(0);
      return args.length===1?args[0]:canonicalize({kind:'add',args});
    }
    case 'mul':{
      const flat=expr.args.map(e=>simplify(e,domain)).flatMap(e=>e.kind==='mul'?e.args:[e]);
      const terms=new Map<string,{expr:Expr;power:number}>();
      let factor=1;const constants:Expr[]=[];
      for(const item of flat){
        if(item.kind==='const'){factor*=numericConstant(item.value);constants.push(item);continue;}
        let base:Expr=item,power=1;
        if(item.kind==='pow'&&item.exponent.kind==='const'&&Number.isInteger(numericConstant(item.exponent.value))){base=item.base;power=numericConstant(item.exponent.value);}
        const key=structuralHash(base),prior=terms.get(key);
        terms.set(key,{expr:base,power:power+(prior?.power??0)});
      }
      if(closeZero(factor))return integer(0);
      const args:Expr[]=[];
      if(factor!==1)args.push(constants.length===1?constants[0]:constant(factor));
      for(const {expr:term,power} of terms.values())if(power!==0)args.push(power===1?term:pow(term,integer(power)));
      if(!args.length)return integer(1);
      return args.length===1?args[0]:canonicalize({kind:'mul',args});
    }
    default:{
      const arg=simplify(expr.arg,domain);
      if(expr.kind==='sqrt'&&arg.kind==='pow'&&is(arg.exponent,2))return simplify({kind:'abs',arg:arg.base},domain);
      if(expr.kind==='abs'&&arg.kind==='abs')return arg;
      if(expr.kind==='exp'&&is(arg,0))return integer(1);
      if(expr.kind==='log'&&is(arg,1))return integer(0);
      if(expr.kind==='sin'||expr.kind==='cos'){
        if(is(arg,0))return integer(expr.kind==='sin'?0:1);
        if(arg.kind==='mul'&&arg.args[0]?.kind==='const'&&numericConstant(arg.args[0].value)<0){
          const positive=simplify(mul(constant(-numericConstant(arg.args[0].value)),...arg.args.slice(1)),domain);
          const inner={kind:expr.kind,arg:positive} as Expr;
          return expr.kind==='sin'?simplify(mul(integer(-1),inner),domain):inner;
        }
      }
      if(domain&&expr.kind==='exp'&&arg.kind==='log'){
        // The log's argument must have a provably positive domain; retain form otherwise.
        if(arg.arg.kind==='var'&&domain[0]>0)return arg.arg;
      }
      return {...expr,arg};
    }
  }
}
