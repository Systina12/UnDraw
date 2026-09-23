import {it,expect} from 'vitest';
import {createUiState,commitStroke,undo,clear,selectCandidate} from '../../src/ui/state';
import {renderCopyText} from '../../src/ui/controls';
import type {SolveResult} from '../../src/core/types';

it('keeps an undo history, clears drawings and tracks candidate selection',()=>{
  const first=commitStroke(createUiState(),[{x:0,y:1,t:0}]);
  const second=commitStroke(first,[{x:0,y:2,t:1}]);
  expect(undo(second).stroke).toEqual(first.stroke);
  expect(clear(second).stroke).toEqual([]);
  const sample={balanced:{latex:'x'},accurate:{latex:'x^2'},simple:{latex:'1'}} as SolveResult;
  const chosen=selectCandidate({...second,result:sample},'accurate');
  expect(chosen.selected).toBe('accurate');
  expect(renderCopyText(chosen,'latex')).toBe('x^2');
});
