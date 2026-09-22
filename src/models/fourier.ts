import type {CurveData} from '../core/normalize';
import type {CandidateDraft} from '../search/producer';
import {fitHarmonic} from './sinusoid';
export function fitFourier(data:CurveData,k:number):CandidateDraft[]{return k>=2&&k<=8?fitHarmonic(data,k):[];}
