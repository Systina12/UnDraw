import {expect,it} from 'vitest';
import {solveStrokesProgressive} from '../../src/core/multi';
import {renderFormula,renderMultiFormula} from '../../src/ui/formulaPanel';

it('updates the match label when Accurate restores a precise fit',async()=>{
  const points=Array.from({length:100},(_,i)=>{
    const x=-1+2*i/99;
    return {x,y:1.94*x+.07,t:i};
  });
  const batch=await solveStrokesProgressive([points],'per-stroke',
    {timeBudgetMs:0,simplify:{enabled:true,tolerance:.1,translation:true,scaling:true,
      deformation:false}});
  const root=document.createElement('div');
  root.innerHTML='<div data-formula></div><p data-quality></p>'+
    '<button data-choice="simple"></button><button data-choice="balanced"></button>'+
    '<button data-choice="accurate"></button>';
  renderMultiFormula(root,batch,'balanced');
  expect(root.querySelector('[data-quality]')?.textContent).toContain('Approximation');
  renderMultiFormula(root,batch,'accurate');
  expect(root.querySelector('[data-quality]')?.textContent).toContain('Excellent match');
  expect(root.querySelector('[data-quality]')?.textContent).not.toContain('Shorter formula');
  renderFormula(root,batch.groups[0].result,'balanced');
  expect(root.querySelector('[data-quality]')?.textContent).toContain('Approximation');
  renderFormula(root,batch.groups[0].result,'accurate');
  expect(root.querySelector('[data-quality]')?.textContent).toBe('Excellent match');
});
