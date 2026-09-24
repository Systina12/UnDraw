import katex from 'katex';
import type {SolveResult,CandidateResult,MultiSolveResult} from '../core/types';
import {qualityFromError} from '../core/quality';

export type Choice='simple'|'balanced'|'accurate';
function chosenQuality(result:SolveResult,kind:Choice):SolveResult['quality']{
  if(kind==='balanced'||(kind==='simple'&&result.simple.plain===result.balanced.plain&&
    result.simple.rmse===result.balanced.rmse))return result.quality;
  const candidate=result[kind];
  return qualityFromError(candidate.rmse,result.noise,candidate.approximation);
}
export function renderFormula(root:HTMLElement,result:SolveResult,kind:Choice='balanced'):CandidateResult {
  const candidate=result[kind];
  const target=root.querySelector<HTMLElement>('[data-formula]');
  const quality=root.querySelector<HTMLElement>('[data-quality]');
  if(target){
    const latex=candidate.parametric?candidate.latex:`y=${candidate.latex}`;
    katex.render(latex,target,{throwOnError:false,trust:false,output:'html'});
    target.title=`RMSE: ${candidate.rmse.toPrecision(3)} · Complexity: ${candidate.complexity} · ${candidate.modelFamily??'General'}`;
  }
  if(quality)quality.textContent={excellent:'Excellent match',good:'Good match',approximation:'Approximation',low:'Low confidence'}[chosenQuality(result,kind)]+
    (kind!=='accurate'&&result.simplified?' · Shorter formula within selected limit':'');
  root.querySelectorAll<HTMLButtonElement>('[data-choice]').forEach(button=>{
    const selected=button.dataset.choice===kind;
    button.setAttribute('aria-pressed',String(selected));
  });
  return candidate;
}

export function renderMultiFormula(root:HTMLElement,batch:MultiSolveResult,kind:Choice='balanced'):void {
  const target=root.querySelector<HTMLElement>('[data-formula]');
  const quality=root.querySelector<HTMLElement>('[data-quality]');
  if(target){
    target.replaceChildren();
    batch.groups.forEach((group,index)=>{
      const row=document.createElement('div');row.className='formula-row';
      const label=document.createElement('span');label.className='formula-label';
      label.textContent=batch.mode==='per-stroke'?`Stroke ${group.strokeIndices[0]+1}`:
        `Function ${index+1} · stroke${group.strokeIndices.length===1?'':'s'} ${group.strokeIndices.map(i=>i+1).join(', ')}`;
      const expression=document.createElement('span');expression.className='formula-expression';
      const candidate=group.result[kind];
      katex.render(candidate.parametric?candidate.latex:
        `${batch.groups.length===1?'y':`y_{${index+1}}`}=${candidate.latex}`,
      expression,{throwOnError:false,trust:false,output:'html'});
      expression.title=`RMSE: ${candidate.rmse.toPrecision(3)} · Complexity: ${candidate.complexity} · ${candidate.modelFamily??'General'}`;
      row.append(label,expression);target.append(row);
    });
  }
  if(quality){
    const levels=['excellent','good','approximation','low'];
    const worst=batch.groups.reduce((max,group)=>Math.max(max,levels.indexOf(chosenQuality(group.result,kind))),0);
    const descriptions=['Excellent match','Good match','Approximation','Low confidence'];
    quality.textContent=`${batch.groups.length} function${batch.groups.length===1?'':'s'} · ${descriptions[worst]}`+
      (batch.skipped.length?` · ${batch.skipped.length} short stroke${batch.skipped.length===1?'':'s'} skipped`:'')+
      (kind!=='accurate'&&batch.groups.some(group=>group.result.simplified)?' · Shorter formula within selected limit':'');
  }
  root.querySelectorAll<HTMLButtonElement>('[data-choice]').forEach(button=>
    button.setAttribute('aria-pressed',String(button.dataset.choice===kind)));
}
