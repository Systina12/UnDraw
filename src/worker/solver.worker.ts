/// <reference lib="webworker" />

import { solveCurve } from "../core/solver";
import type { WorkerRequest, WorkerResponse } from "../core/types";

const scope = self as DedicatedWorkerGlobalScope;

scope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  const result = solveCurve(request.points, {
    ...request.options,
    progress: (candidate) => scope.postMessage({ type: "progress", id: request.id, stage: "search", candidate } satisfies WorkerResponse),
  });
  if (result.mode === "invalid") {
    scope.postMessage({ type: "invalid", id: request.id, reason: result.reason } satisfies WorkerResponse);
  } else {
    scope.postMessage({ type: "done", id: request.id, result } satisfies WorkerResponse);
  }
};
