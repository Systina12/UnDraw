import {type Expr,type Constant,numericConstant,integer,mul} from '../expr/ast';
import type {CurveData} from '../core/normalize';
import type {Candidate,CandidateDraft} from '../search/producer';
import {CandidatePool} from '../search/candidatePool';
import {prettyAlternatives} from './constants';
import {simplify} from '../expr/simplify';

type Path=number[];
function floats(expr:Expr,path:Path=[]):Path[]{
  if(expr.kind==='const')return expr.value.kind==='float'?[path]:[];
  if(expr.kind==='var')return [];
  const children=expr.kind==='add'||expr.kind==='mul'?expr.args:
    expr.kind==='div'?[expr.a,expr.b]:expr.kind==='pow'?[expr.base,expr.exponent]:'arg' in expr?[expr.arg]:[];
  return children.flatMap((child,index)=>floats(child,[...path,index]));
}
function at(expr:Expr,path:Path):Expr{
  if(!path.length)return expr;
  const [index,...rest]=path;
  if(expr.kind==='add'||expr.kind==='mul')return at(expr.args[index],rest);
  if(expr.kind==='div')return at(index===0?expr.a:expr.b,rest);
  if(expr.kind==='pow')return at(index===0?expr.base:expr.exponent,rest);
  return 'arg' in expr?at(expr.arg,rest):expr;
}
function replace(expr:Expr,path:Path,value:Constant):Expr{
  if(!path.length)return {kind:'const',value};
  const [index,...rest]=path;
  if(expr.kind==='add'||expr.kind==='mul')return {...expr,args:expr.args.map((item,i)=>i===index?replace(item,rest,value):item)};
  if(expr.kind==='div')return {...expr,[index===0?'a':'b']:replace(index===0?expr.a:expr.b,rest,value)};
  if(expr.kind==='pow')return {...expr,[index===0?'base':'exponent']:replace(index===0?expr.base:expr.exponent,rest,value)};
  return 'arg' in expr?{...expr,arg:replace(expr.arg,rest,value)}:expr;
}

export function normalizeTrig(expr:Expr):Expr {
  if(expr.kind==='sin'&&expr.arg.kind==='mul'&&expr.arg.args[0]?.kind==='const'&&
    numericConstant(expr.arg.args[0].value)<0)
    return simplify(mul(integer(-1),{kind:'sin',arg:simplify(mul(integer(-1),expr.arg))}));
  return simplify(expr);
}

export function beautifyCandidate(candidate:Candidate,data:CurveData,width=32):Candidate[]{
  const paths=floats(candidate.expr).slice(0,6);
  type State={expr:Expr;fixed:number;score:number};
  let beam:State[]=[{expr:candidate.expr,fixed:0,score:candidate.score}];
  const accepted=new Map<string,Candidate>();
  for(const path of paths){
    const leaf=at(candidate.expr,path);
    if(leaf.kind!=='const'||leaf.value.kind!=='float')continue;
    const alternatives=prettyAlternatives(leaf.value.value);
    if(!alternatives.length)continue;
    const next:State[]=[...beam];
    for(const state of beam)for(const alternative of alternatives){
      const expr=replace(state.expr,path,alternative);
      const draft:CandidateDraft={...candidate,expr,freeParameterCount:Math.max(0,candidate.freeParameterCount-state.fixed-1)};
      const probe=new CandidatePool(data,1);
      if(!probe.add(draft))continue;
      const found=probe.all()[0];
      accepted.set(found.signature,found);
      next.push({expr,fixed:state.fixed+1,score:found.score});
    }
    next.sort((a,b)=>a.score-b.score);
    beam=next.slice(0,width);
  }
  return [...accepted.values()].sort((a,b)=>a.score-b.score).slice(0,width);
}
export function beautifyPool(pool:CandidatePool):void {
  const eligible=new Set(['sinusoid','Polynomial','exponential','logarithm','absolute','rational','symbolic']);
  const best=[...pool.all()].sort((a,b)=>a.score-b.score)[0];
  if(!best||!eligible.has(best.modelFamily))return;
  const candidates=pool.all().filter(c=>eligible.has(c.modelFamily)&&!c.approximation&&c.freeParameterCount<=5&&
    c.metrics.rmse<=Math.max(3*pool.data.sigmaDraw,.025*pool.data.normalization.ys)&&
    c.score<=best.score+50).sort((a,b)=>a.score-b.score).slice(0,2);
  for(const candidate of candidates)for(const variant of beautifyCandidate(candidate,pool.data,32))pool.add(variant);
}
