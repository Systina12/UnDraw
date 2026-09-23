import { describe, expect, it } from "vitest";
import { SolverWorkerClient } from "../src/worker/client";
import type { WorkerRequest, WorkerResponse } from "../src/core/types";
import { MAX_INPUT_POINTS } from "../src/core/preprocess";

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
    expect(worker?.terminated).toBe(true);
  });

  it("terminates a worker after a terminal response", () => {
    let worker: FakeWorker | undefined;
    const client = new SolverWorkerClient(() => { worker = new FakeWorker(); return worker; });
    client.solve([], { xmin: -1, xmax: 1, ymin: -1, ymax: 1, width: 10, height: 10 }, {}, () => undefined);
    worker?.send({ type: "done", id: 1, result: {} as never });
    expect(worker?.terminated).toBe(true);
  });

  it("turns a DataCloneError-style post failure into an invalid response", () => {
    const received: WorkerResponse[] = [];
    const worker = new FakeWorker();
    worker.postMessage = () => { throw new Error("DataCloneError"); };
    const client = new SolverWorkerClient(() => worker);
    client.solve([], { xmin: -1, xmax: 1, ymin: -1, ymax: 1, width: 10, height: 10 }, {}, (response) => received.push(response));
    expect(received[0]).toMatchObject({ type: "invalid", reason: expect.stringMatching(/worker/i) });
    expect(worker.terminated).toBe(true);
  });

  it("reports worker construction failures as invalid results", () => {
    const received: WorkerResponse[] = [];
    const client = new SolverWorkerClient(() => { throw new Error("Workers are blocked"); });
    expect(() => client.solve([], { xmin: -1, xmax: 1, ymin: -1, ymax: 1, width: 10, height: 10 }, {}, (response) => received.push(response))).not.toThrow();
    expect(received[0]).toMatchObject({ type: "invalid", reason: expect.stringMatching(/worker/i) });
  });

  it("caps oversized point payloads before sending them to the worker", () => {
    const worker = new FakeWorker();
    const client = new SolverWorkerClient(() => worker);
    const points = Array.from({ length: MAX_INPUT_POINTS + 20 }, (_, index) => ({ x: index, y: -index, t: index }));
    client.solve(points, { xmin: -1, xmax: 1, ymin: -1, ymax: 1, width: 10, height: 10 }, {}, () => undefined);
    const request = worker.messages[0] as WorkerRequest;
    expect(request.points).toHaveLength(MAX_INPUT_POINTS);
    expect(request.points[0]?.x).toBe(0);
    expect(request.points.at(-1)?.x).toBe(points.at(-1)?.x);
  });

  it("keeps a replacement request started by a terminal response callback", () => {
    const workers: FakeWorker[] = [];
    const received: string[] = [];
    const client = new SolverWorkerClient(() => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    });
    const firstId = client.solve([], { xmin: -1, xmax: 1, ymin: -1, ymax: 1, width: 10, height: 10 }, {}, (response) => {
      received.push(`first:${response.type}`);
      if (response.type === "done") {
        client.solve([], { xmin: -1, xmax: 1, ymin: -1, ymax: 1, width: 10, height: 10 }, {}, (next) => received.push(`next:${next.type}`));
      }
    });
    workers[0]?.send({ type: "done", id: firstId, result: {} as never });
    workers[1]?.send({ type: "progress", id: firstId + 1, stage: "next" });
    expect(received).toEqual(["first:done", "next:progress"]);
    client.cancel();
    expect(workers[1]?.terminated).toBe(true);
  });

  it("keeps a replacement request started by a worker error callback", () => {
    const workers: FakeWorker[] = [];
    const received: string[] = [];
    const client = new SolverWorkerClient(() => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    });
    client.solve([], { xmin: -1, xmax: 1, ymin: -1, ymax: 1, width: 10, height: 10 }, {}, (response) => {
      received.push(`first:${response.type}`);
      if (response.type === "invalid") {
        client.solve([], { xmin: -1, xmax: 1, ymin: -1, ymax: 1, width: 10, height: 10 }, {}, (next) => received.push(`next:${next.type}`));
      }
    });
    workers[0]?.fail();
    workers[1]?.send({ type: "progress", id: 2, stage: "next" });
    expect(received).toEqual(["first:invalid", "next:progress"]);
    client.cancel();
    expect(workers[1]?.terminated).toBe(true);
  });

  it("keeps a replacement request started by a post failure callback", () => {
    const workers: FakeWorker[] = [];
    const received: string[] = [];
    const client = new SolverWorkerClient(() => {
      const worker = new FakeWorker();
      if (workers.length === 0) worker.postMessage = () => { throw new Error("DataCloneError"); };
      workers.push(worker);
      return worker;
    });
    client.solve([], { xmin: -1, xmax: 1, ymin: -1, ymax: 1, width: 10, height: 10 }, {}, (response) => {
      received.push(`first:${response.type}`);
      if (response.type === "invalid") {
        client.solve([], { xmin: -1, xmax: 1, ymin: -1, ymax: 1, width: 10, height: 10 }, {}, (next) => received.push(`next:${next.type}`));
      }
    });
    workers[1]?.send({ type: "progress", id: 2, stage: "next" });
    expect(received).toEqual(["first:invalid", "next:progress"]);
    client.cancel();
    expect(workers[1]?.terminated).toBe(true);
  });
});
