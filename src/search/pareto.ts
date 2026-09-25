import type {Candidate} from './producer';
export function paretoPrune(candidates:Candidate[],max=Infinity):Candidate[] {
  const sorted=[...candidates].sort((a,b)=>a.complexity-b.complexity||a.metrics.rmse-b.metrics.rmse||a.score-b.score);
  const kept:Candidate[]=[];
  let lowest=Infinity;
  for(const candidate of sorted){
    if(candidate.metrics.rmse>=lowest-1e-9)continue;
    kept.push(candidate);lowest=candidate.metrics.rmse;
  }
  // Preserve the lowest error even if a caller requests a compact display frontier.
  if(kept.length<=max)return kept;
  if(max<=1)return [kept.at(-1)!];
  const indices=new Set([0,kept.length-1]);
  for(let i=1;indices.size<max;i++)indices.add(Math.round(i*(kept.length-1)/(max-1)));
  return kept.filter((_,index)=>indices.has(index));
}
export function selectRepresentatives(frontier:Candidate[],noise:number):{simple:Candidate;balanced:Candidate;accurate:Candidate} {
  if(!frontier.length)throw new RangeError('No valid candidates');
  const accurate=[...frontier].sort((a,b)=>a.metrics.rmse-b.metrics.rmse||a.complexity-b.complexity)[0];
  const limit=2.5*Math.max(noise,accurate.metrics.rmse);
  const allowed=frontier.filter(c=>c.metrics.rmse<=limit+1e-9);
  const simple=[...allowed].sort((a,b)=>a.complexity-b.complexity||a.metrics.rmse-b.metrics.rmse)[0];
  const balanced=[...frontier].sort((a,b)=>a.score-b.score||a.complexity-b.complexity)[0];
  return {simple,balanced,accurate};
}
