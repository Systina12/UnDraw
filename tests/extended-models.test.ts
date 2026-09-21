import { describe, expect, it } from "vitest";
import { preprocessCurve } from "../src/core/preprocess";
import { fitAbsolute } from "../src/models/absolute";
import { fitDampedSinusoid, fitGaussian, fitLogistic, fitTanh } from "../src/models/nonlinear";
import { fitExponential } from "../src/models/exponential";
import { fitFourier } from "../src/models/fourier";
import { fitLogarithm } from "../src/models/logarithm";
import { fitRational } from "../src/models/rational";
import type { Point } from "../src/core/types";

function dataFor(fn: (x: number) => number, low = -2, high = 2) {
  const points: Point[] = Array.from({ length: 160 }, (_, index) => {
    const x = low + ((high - low) * index) / 159;
    return { x, y: fn(x), t: index };
  });
  const result = preprocessCurve(points, { samples: 96, buckets: 48 });
  expect(result.kind).toBe("ok");
  if (result.kind !== "ok") throw new Error(result.reason);
  return result.data;
}

function bestError(candidates: { error: number }[]): number {
  return Math.min(...candidates.map((candidate) => candidate.error));
}

describe("extended fast model bank", () => {
  it("covers exponential, logarithmic, absolute, and rational curves", () => {
    expect(bestError(fitExponential(dataFor((x) => Math.exp(0.7 * x))))).toBeLessThan(0.12);
    expect(bestError(fitLogarithm(dataFor((x) => Math.log(x + 2), -1.5, 2)))).toBeLessThan(0.12);
    expect(bestError(fitAbsolute(dataFor((x) => Math.abs(x - 0.4))))).toBeLessThan(0.12);
    expect(bestError(fitRational(dataFor((x) => 1 / (x + 2), -1.5, 2)))).toBeLessThan(0.12);
  });

  it("covers smooth nonlinear families and periodic fallback", () => {
    expect(bestError(fitGaussian(dataFor((x) => Math.exp(-x * x))))).toBeLessThan(0.15);
    expect(bestError(fitTanh(dataFor((x) => 1.5 * Math.tanh(2 * x) + 0.2)))).toBeLessThan(0.15);
    expect(bestError(fitLogistic(dataFor((x) => 1.5 / (1 + Math.exp(-2 * (x - 0.3))) - 0.4)))).toBeLessThan(0.15);
    expect(bestError(fitDampedSinusoid(dataFor((x) => Math.exp(-0.2 * x) * Math.sin(4 * x))))).toBeLessThan(0.2);
    expect(bestError(fitFourier(dataFor((x) => Math.sin(2 * x) + 0.3 * Math.cos(4 * x))))).toBeLessThan(0.15);
  });
});
