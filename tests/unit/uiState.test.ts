import {it,expect} from 'vitest';
import {createUiState,appendStroke,undo,clear,selectCandidate} from '../../src/ui/state';
import {renderCopyText} from '../../src/ui/controls';
import katex from 'katex';
import type {SolveResult,MultiSolveResult} from '../../src/core/types';

it('keeps an undo history, clears drawings and tracks candidate selection',()=>{
  const first=appendStroke(createUiState(),[{x:0,y:1,t:0},{x:1,y:2,t:1}]);
  const second=appendStroke(first,[{x:0,y:2,t:2},{x:1,y:3,t:3}]);
  expect(second.strokes).toHaveLength(2);
  expect(undo(second).strokes).toEqual(first.strokes);
  expect(clear(second).strokes).toEqual([]);
  const sample:MultiSolveResult={kind:'multi',mode:'per-stroke',groups:[{strokeIndices:[0],result:{balanced:{latex:'x'},accurate:{latex:'x^2'},simple:{latex:'1'}} as SolveResult}],skipped:[]};
  const chosen=selectCandidate({...second,result:sample},'accurate');
  expect(chosen.selected).toBe('accurate');
  expect(renderCopyText(chosen,'latex')).toContain('x^2');
  const two=selectCandidate({...second,result:{...sample,groups:[...sample.groups,...sample.groups]}},'balanced');
  const copied=renderCopyText(two,'latex');
  expect(copied).toContain('y_{1}');
  expect(copied).toContain('y_{2}');
  expect(()=>katex.renderToString(copied,{throwOnError:true})).not.toThrow();
});

it('does not revive a result from a different fit mode when undoing a stroke',()=>{
  const first=appendStroke(createUiState(),[{x:0,y:1,t:0},{x:1,y:2,t:1}]);
  const oldResult:MultiSolveResult={kind:'multi',mode:'per-stroke',groups:[],skipped:[]};
  const second=appendStroke({...first,result:oldResult,phase:'result'},
    [{x:0,y:2,t:2},{x:1,y:3,t:3}]);
  const restored=undo({...second,mode:'auto'});
  expect(restored.strokes).toEqual(first.strokes);
  expect(restored.result).toBeNull();
  expect(restored.phase).toBe('idle');
  expect(undo({...second,mode:'per-stroke'}).result).toBe(oldResult);
});
