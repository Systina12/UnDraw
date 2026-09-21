import type { Point, SolverOptions, Viewport, WorkerRequest, WorkerResponse } from "../core/types";

export interface WorkerLike {
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null;
  onerror?: ((event: ErrorEvent) => void) | null;
  postMessage(message: WorkerRequest): void;
  terminate(): void;
}

export type WorkerFactory = () => WorkerLike;
export type ResponseHandler = (response: WorkerResponse) => void;

export class SolverWorkerClient {
  private sequence = 0;
  private active: { id: number; worker: WorkerLike } | null = null;

  public constructor(private readonly factory: WorkerFactory) {}

  public solve(points: readonly Point[], view: Viewport, options: Partial<SolverOptions>, onResponse: ResponseHandler): number {
    this.cancel();
    const id = ++this.sequence;
    const worker = this.factory();
    this.active = { id, worker };
    worker.onmessage = (event) => {
      if (this.active?.id !== id || this.active.worker !== worker || event.data.id !== id) return;
      onResponse(event.data);
      if (event.data.type === "done" || event.data.type === "invalid") this.active = null;
    };
    worker.onerror = () => {
      if (this.active?.id !== id || this.active.worker !== worker) return;
      onResponse({ type: "invalid", id, reason: "The solver worker failed. Please draw again." });
      this.active = null;
    };
    const { progress: _progress, now: _now, ...serializableOptions } = options;
    worker.postMessage({ id, points: [...points], view, options: serializableOptions });
    return id;
  }

  public cancel(): void {
    this.active?.worker.terminate();
    this.active = null;
  }
}
