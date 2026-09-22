import katex from 'katex';
import type {SolveResult,CandidateResult} from '../core/types';

export type Choice='simple'|'balanced'|'accurate';
export function renderFormula(root:HTMLElement,result:SolveResult,kind:Choice='balanced'):CandidateResult {
  const candidate=result[kind];
  const target=root.querySelector<HTMLElement>('[data-formula]');
  const quality=root.querySelector<HTMLElement>('[data-quality]');
  if(target){
    const latex=candidate.parametric?`\\begin{aligned}${candidate.parametric.xLatex}\\\\${candidate.parametric.yLatex}\\end{aligned}`:`y=${candidate.latex}`;
    katex.render(latex,target,{throwOnError:false,trust:false,output:'html'});
    target.title=`RMSE: ${candidate.rmse.toPrecision(3)} · Complexity: ${candidate.complexity} · ${candidate.modelFamily??'General'}`;
  }
  if(quality)quality.textContent={excellent:'Excellent match',good:'Good match',approximation:'Approximation',low:'Low confidence'}[result.quality];
  root.querySelectorAll<HTMLButtonElement>('[data-choice]').forEach(button=>{
    const selected=button.dataset.choice===kind;
    button.setAttribute('aria-pressed',String(selected));
  });
  return candidate;
}
