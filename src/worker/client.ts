import type { Point, SolverOptions, Viewport, WorkerRequest, WorkerResponse } from "../core/types";
import { limitInputPoints } from "../core/preprocess";

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
    let worker: WorkerLike;
    try {
      worker = this.factory();
    } catch {
      onResponse({ type: "invalid", id, reason: "The solver worker could not be started. Please reload the page and try again." });
      return id;
    }
    this.active = { id, worker };
    worker.onmessage = (event) => {
      const response = event.data;
      if (!response || this.active?.id !== id || this.active.worker !== worker || response.id !== id) return;
      if (response.type === "done" || response.type === "invalid") {
        this.finishWorker(id, worker);
      }
      onResponse(response);
    };
    worker.onerror = () => {
      if (this.active?.id !== id || this.active.worker !== worker) return;
      this.finishWorker(id, worker);
      onResponse({ type: "invalid", id, reason: "The solver worker failed. Please draw again." });
    };
    const { progress: _progress, now: _now, ...serializableOptions } = options;
    try {
      worker.postMessage({ id, points: limitInputPoints(points), view, options: serializableOptions });
    } catch {
      if (this.active?.id === id && this.active.worker === worker) {
        this.finishWorker(id, worker);
        onResponse({ type: "invalid", id, reason: "The stroke could not be sent to the solver worker." });
      }
    }
    return id;
  }

  public cancel(): void {
    this.active?.worker.terminate();
    this.active = null;
  }

  private finishWorker(id: number, worker: WorkerLike): void {
    if (this.active?.id === id && this.active.worker === worker) this.active = null;
    worker.terminate();
  }
}
