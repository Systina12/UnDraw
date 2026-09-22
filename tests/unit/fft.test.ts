import {it,expect} from 'vitest';
import {spectralPeaks} from '../../src/math/fft';
it('finds a known periodic component in 256 samples',()=>{
  const values=Float64Array.from({length:256},(_,i)=>2*Math.sin(2*Math.PI*4*i/256)+.1*Math.sin(2*Math.PI*9*i/256));
  expect(spectralPeaks(values,1,3)[0]).toBeCloseTo(2*Math.PI*4/256,2);
});
