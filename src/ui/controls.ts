import type {UiState} from './state';
export type CopyFormat='latex'|'plain';
export function renderCopyText(state:UiState,format:CopyFormat):string {
  const candidate=state.result?.[state.selected];
  return candidate?.[format]??'';
}
export async function copyToClipboard(text:string):Promise<boolean>{
  if(!text)return false;
  try{
    if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);return true;}
  }catch{ /* User may have denied Clipboard API; try the local fallback. */ }
  const input=document.createElement('textarea');
  input.value=text;input.style.position='fixed';input.style.opacity='0';
  document.body.append(input);input.select();
  const copied=document.execCommand?.('copy')??false;
  input.remove();return copied;
}
