/** Iterative radix-two FFT returning angular frequencies in sample-spacing units. */
export function spectralPeaks(series:Float64Array,spacing:number,limit=5):number[]{
  const n=2**Math.floor(Math.log2(series.length));
  if(n<16||!Number.isFinite(spacing)||spacing<=0)return [];
  const re=new Float64Array(n),im=new Float64Array(n);
  const start=Math.floor((series.length-n)/2);
  // Remove constant and linear drift before applying a Hann window.
  const first=series[start],last=series[start+n-1];
  for(let i=0;i<n;i++)re[i]=(series[start+i]-first-(last-first)*i/(n-1))*(.5-.5*Math.cos(2*Math.PI*i/(n-1)));
  for(let i=1,j=0;i<n;i++){
    let bit=n>>1;
    for(;j&bit;bit>>=1)j^=bit;j^=bit;
    if(i<j){[re[i],re[j]]=[re[j],re[i]];[im[i],im[j]]=[im[j],im[i]];}
  }
  for(let length=2;length<=n;length<<=1){
    const angle=-2*Math.PI/length;
    for(let start=0;start<n;start+=length)for(let j=0;j<length/2;j++){
      const k=start+j,other=k+length/2,cos=Math.cos(angle*j),sin=Math.sin(angle*j);
      const tr=re[other]*cos-im[other]*sin,ti=re[other]*sin+im[other]*cos;
      re[other]=re[k]-tr;im[other]=im[k]-ti;re[k]+=tr;im[k]+=ti;
    }
  }
  const magnitudes=Array.from({length:Math.floor(n/2)},(_,k)=>Math.hypot(re[k],im[k]));
  const indices=Array.from({length:Math.floor(n/2)-1},(_,i)=>i+1).sort((a,b)=>magnitudes[b]-magnitudes[a]);
  const selected:number[]=[];
  for(const bin of indices){
    if(selected.some(k=>Math.abs(k-bin)<=1))continue;
    selected.push(bin);
    if(selected.length>=limit)break;
  }
  return selected.map(k=>k*2*Math.PI/(n*spacing));
}
