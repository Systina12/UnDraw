import type {Point,MultiSolveResult,FitMode} from '../core/types';
import type {Choice} from './formulaPanel';

export interface UiSnapshot {strokes:Point[][];result:MultiSolveResult|null}
export interface UiState extends UiSnapshot {
  draft:Point[];
  mode:FitMode;
  phase:'idle'|'drawing'|'solving'|'result'|'invalid';
  selected:Choice;
  history:UiSnapshot[];
}
export function createUiState():UiState {
  return {phase:'idle',strokes:[],draft:[],result:null,mode:'per-stroke',selected:'balanced',history:[]};
}
export function appendStroke(state:UiState,stroke:Point[]):UiState {
  if(stroke.length<2)return {...state,draft:[],phase:state.result?'result':'idle'};
  return {...state,history:[...state.history,{strokes:state.strokes,result:state.result}].slice(-20),
    strokes:[...state.strokes,[...stroke]],draft:[],result:null,phase:'idle'};
}
export function clear(state:UiState):UiState {
  if(!state.strokes.length&&!state.draft.length)return state;
  return {...state,history:[...state.history,{strokes:state.strokes,result:state.result}].slice(-20),
    strokes:[],draft:[],result:null,phase:'idle'};
}
export function undo(state:UiState):UiState {
  if(!state.history.length)return {...state,strokes:[],draft:[],result:null,phase:'idle'};
  const last=state.history.at(-1)!;
  const result=last.result?.mode===state.mode?last.result:null;
  return {...state,strokes:last.strokes,draft:[],result,history:state.history.slice(0,-1),
    phase:result?'result':'idle'};
}
export function selectCandidate(state:UiState,selected:Choice):UiState {
  return {...state,selected};
}
