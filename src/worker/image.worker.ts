import {detectEdges,type EdgeDetail} from '../image/edges';

self.onmessage=(event:MessageEvent<{id:number;width:number;height:number;
  pixels:Uint8ClampedArray;detail:EdgeDetail}>)=>{
  const {id,width,height,pixels,detail}=event.data;
  try{self.postMessage({id,contours:detectEdges(pixels,width,height,detail)});}
  catch{self.postMessage({id,error:'Could not detect edges in this image.'});}
};
