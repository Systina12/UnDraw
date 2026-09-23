import type {Point,SolveResult} from '../core/types';
import type {Choice} from './formulaPanel';

export interface UiSnapshot {stroke:Point[];result:SolveResult|null}
export interface UiState extends UiSnapshot {
  phase:'idle'|'drawing'|'solving'|'result'|'invalid';
  selected:Choice;
  history:UiSnapshot[];
  activeRequestId:number;
}
export function createUiState():UiState {
  return {phase:'idle',stroke:[],result:null,selected:'balanced',history:[],activeRequestId:0};
}
export function commitStroke(state:UiState,stroke:Point[]):UiState {
  return {...state,history:[...state.history,{stroke:state.stroke,result:state.result}].slice(-20),
    stroke:[...stroke],result:null,phase:'solving'};
}
export function clear(state:UiState):UiState {
  if(!state.stroke.length&&!state.result)return state;
  return {...state,history:[...state.history,{stroke:state.stroke,result:state.result}].slice(-20),
    stroke:[],result:null,phase:'idle'};
}
export function undo(state:UiState):UiState {
  if(!state.history.length)return {...state,stroke:[],result:null,phase:'idle'};
  const last=state.history.at(-1)!;
  return {...state,stroke:last.stroke,result:last.result,history:state.history.slice(0,-1),
    phase:last.result?'result':last.stroke.length?'idle':'idle'};
}
export function selectCandidate(state:UiState,selected:Choice):UiState {
  return {...state,selected};
}
