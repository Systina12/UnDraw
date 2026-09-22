import {expect,it,vi} from 'vitest';
import {WorkerClient} from '../../src/worker/client';
import type {WorkerResponse} from '../../src/worker/protocol';
import type {Point,Viewport} from '../../src/core/types';

it('ignores late messages after a new request and terminates the previous worker',()=>{
  const workers:{onmessage:((event:MessageEvent<WorkerResponse>)=>void)|null;postMessage:ReturnType<typeof vi.fn>;terminate:ReturnType<typeof vi.fn>}[]=[];
  const client=new WorkerClient(()=>{
    const fake={onmessage:null,postMessage:vi.fn(),terminate:vi.fn()};
    workers.push(fake);return fake as unknown as Worker;
  });
  const onMessage=vi.fn(),view:Viewport={xMin:-5,xMax:5,yMin:-5,yMax:5},points:Point[]=[];
  const first=client.solve(points,view,{},onMessage);
  const previous=workers[0].onmessage!;
  const second=client.solve(points,view,{},onMessage);
  expect(second).toBe(first+1);
  expect(workers[0].terminate).toHaveBeenCalledOnce();
  previous({data:{type:'progress',id:first,stage:'old'}} as MessageEvent<WorkerResponse>);
  expect(onMessage).not.toHaveBeenCalled();
  workers[1].onmessage!({data:{type:'progress',id:second,stage:'fresh'}} as MessageEvent<WorkerResponse>);
  expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({id:second}));
  client.cancel(second);
});
