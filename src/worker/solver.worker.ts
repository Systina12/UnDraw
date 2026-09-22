/// <reference lib="webworker" />

import { solveCurve } from "../core/solver";
import type { WorkerRequest, WorkerResponse } from "../core/types";

const scope = self as DedicatedWorkerGlobalScope;

scope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  const requestId = Number.isInteger(request?.id) ? request.id : -1;
  try {
    if (!request || !Array.isArray(request.points)) throw new Error("Invalid worker request");
    const result = solveCurve(request.points, {
      ...request.options,
      progress: (candidate) => scope.postMessage({ type: "progress", id: requestId, stage: "search", candidate } satisfies WorkerResponse),
    });
    if (result.mode === "invalid") {
      scope.postMessage({ type: "invalid", id: requestId, reason: result.reason } satisfies WorkerResponse);
    } else {
      scope.postMessage({ type: "done", id: requestId, result } satisfies WorkerResponse);
    }
  } catch {
    scope.postMessage({ type: "invalid", id: requestId, reason: "The stroke could not be analyzed. Please draw again." } satisfies WorkerResponse);
  }
};
