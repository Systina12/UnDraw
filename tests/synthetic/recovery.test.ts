import {describe,it,expect} from 'vitest';
import {solveCurve} from '../../src/core/solver';
import {makeStroke} from '../fixtures/generateStroke';

const cases:[string,(x:number)=>number,number,number][]=[
  ['linear',x=>2*x+1,-2,2],
  ['quadratic',x=>x*x,-2,2],
  ['cubic',x=>x*x*x-x,-2,2],
  ['pi sinusoid',x=>2*Math.sin(Math.PI*x),-2,2],
  ['sinusoid with trend',x=>x+.5*Math.sin(3*x),-2,2],
  ['exponential',x=>Math.exp(.7*x),-2,2],
  ['logarithm',x=>Math.log(x+2),-1,2],
  ['absolute',x=>Math.abs(x-1),-1,3],
  ['rational',x=>1/(x+2),-1,2],
  ['gaussian',x=>Math.exp(-x*x),-2,2],
  ['damped sinusoid',x=>Math.exp(-.2*x)*Math.sin(4*x),-2,2],
  ['chirp',x=>Math.sin(x*x),-2,2],
];

describe('recovery from hand-drawn strokes',()=>{
  it.each(cases)('%s',(_family,f,min,max)=>{
    const seed=2309;
    const result=solveCurve(makeStroke(f,{min,max,noise:.018,seed,wobble:.004,
      dropRate:.055,outliers:1,xJitter:.0005,reverse:true,nonuniform:true}),{timeBudgetMs:450});
    const report=`seed=${seed}, family=${_family}, mode=${result.mode}, noise=${result.noise}, `+
      `RMSE=${result.balanced.rmse}, latex=${result.balanced.latex}`;
    expect(result.mode,report).toBe('function');
    expect(result.balanced.rmse,report).toBeLessThanOrEqual(Math.max(1.5*result.noise,.055));
    expect(result.balanced.plot.y.every(Number.isFinite),report).toBe(true);
    if(_family==='pi sinusoid'){
      expect(result.balanced.latex,report).toContain('\\pi');
      expect(result.balanced.complexity,report).toBeLessThan(14);
    }
  },20_000);

  it('reconstructs random Chebyshev and Fourier combinations with a bounded approximation',()=>{
    const functions:[string,(x:number)=>number][]=[
      ['Chebyshev',x=>.3+1.1*x-.25*(2*x*x-1)+.4*(4*x*x*x-3*x)],
      ['Fourier',x=>.3+.6*Math.sin(2*x)+.25*Math.cos(4*x)-.18*Math.sin(6*x)],
    ];
    for(const [family,f] of functions){
      const result=solveCurve(makeStroke(f,{min:-1,max:1,noise:.016,seed:43,dropRate:.07,
        wobble:.005,outliers:1,xJitter:.0005,nonuniform:true}));
      expect(result.mode,family).toBe('function');
      expect(result.balanced.rmse,family).toBeLessThan(.09);
      expect(result.accurate.plot.y.every(Number.isFinite),family).toBe(true);
    }
  },20_000);
});
