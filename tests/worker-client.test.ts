import { describe, expect, it } from "vitest";
import { SolverWorkerClient } from "../src/worker/client";
import type { WorkerResponse } from "../src/core/types";

class FakeWorker {
  public onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null;
  public onerror: ((event: ErrorEvent) => void) | null = null;
  public terminated = false;
  public messages: unknown[] = [];
  public postMessage(message: unknown): void { this.messages.push(message); }
  public terminate(): void { this.terminated = true; }
  public send(response: WorkerResponse): void { this.onmessage?.({ data: response } as MessageEvent<WorkerResponse>); }
  public fail(): void { this.onerror?.({ message: "worker failed" } as ErrorEvent); }
}

describe("worker request replacement", () => {
  it("ignores a late response from the previous worker", () => {
    const workers: FakeWorker[] = [];
    const received: string[] = [];
    const client = new SolverWorkerClient(() => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    });
    client.solve([], { xmin: -1, xmax: 1, ymin: -1, ymax: 1, width: 10, height: 10 }, {}, (response) => received.push(response.type));
    client.solve([], { xmin: -1, xmax: 1, ymin: -1, ymax: 1, width: 10, height: 10 }, {}, (response) => received.push(response.type));
    expect(workers[0]?.terminated).toBe(true);
    workers[0]?.send({ type: "progress", id: 1, stage: "late" });
    workers[1]?.send({ type: "progress", id: 2, stage: "current" });
    expect(received).toEqual(["progress"]);
  });

  it("turns a worker crash into an invalid response", () => {
    let worker: FakeWorker | undefined;
    const received: WorkerResponse[] = [];
    const client = new SolverWorkerClient(() => { worker = new FakeWorker(); return worker; });
    client.solve([], { xmin: -1, xmax: 1, ymin: -1, ymax: 1, width: 10, height: 10 }, {}, (response) => received.push(response));
    worker?.fail();
    expect(received[0]).toMatchObject({ type: "invalid", reason: expect.stringMatching(/worker/i) });
  });
});
