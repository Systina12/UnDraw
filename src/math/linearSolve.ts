/** Pivoted elimination for tiny square systems outside the least-squares path. */
export function solveLinear(matrix:Float64Array,rhs:Float64Array):Float64Array|null{
  const n=rhs.length;if(matrix.length!==n*n)return null;
  const a=matrix.slice(),b=rhs.slice();
  for(let k=0;k<n;k++){
    let pivot=k;
    for(let i=k+1;i<n;i++)if(Math.abs(a[i*n+k])>Math.abs(a[pivot*n+k]))pivot=i;
    if(Math.abs(a[pivot*n+k])<1e-14)return null;
    if(pivot!==k){for(let j=k;j<n;j++)[a[pivot*n+j],a[k*n+j]]=[a[k*n+j],a[pivot*n+j]];[b[k],b[pivot]]=[b[pivot],b[k]];}
    for(let i=k+1;i<n;i++){
      const factor=a[i*n+k]/a[k*n+k];
      for(let j=k;j<n;j++)a[i*n+j]-=factor*a[k*n+j];
      b[i]-=factor*b[k];
    }
  }
  const solution=new Float64Array(n);
  for(let i=n-1;i>=0;i--){let v=b[i];for(let j=i+1;j<n;j++)v-=a[i*n+j]*solution[j];solution[i]=v/a[i*n+i];}
  return solution;
}
