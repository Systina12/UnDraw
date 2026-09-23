import { describe, expect, it } from "vitest";
import { add, c, exprToPlain, mul, sin, x } from "../src/expr/ast";
import { beautifyCandidate } from "../src/beautify/beautify";
import { makeCandidate } from "../src/search/candidates";
import type { CurveData } from "../src/core/types";

const data = {
  raw: Array.from({ length: 64 }, (_, index) => {
    const x = -2 + (4 * index) / 63;
    return { x, y: 2 * Math.sin(Math.PI * x), t: index };
  }),
  smooth: [], normalized: [], x: Array.from({ length: 64 }, (_, index) => -2 + (4 * index) / 63),
  y: Array.from({ length: 64 }, (_, index) => 2 * Math.sin(Math.PI * (-2 + (4 * index) / 63))), smoothY: [], normalizedX: [], normalizedY: [],
  normalization: { xc: 0, xs: 1, yc: 0, ys: 1 }, domain: [-2, 2] as [number, number], noise: 0.02, sourcePoints: [],
} satisfies CurveData;

describe("constant beautification", () => {
  it("prefers simple integer and pi constants when their error is at noise level", () => {
    const raw = mul(c(1.9987), sin(mul(c(3.1419), x())));
    const candidate = makeCandidate(raw, "sinusoid", data);
    const pretty = beautifyCandidate(candidate, data);
    expect(pretty.error).toBeLessThan(0.02);
    expect(pretty.expr).toMatchObject({ kind: "mul" });
    expect(exprToPlain(pretty.expr)).toContain("π");
    expect(pretty.modelFamily).toBe("sinusoid");
  });

  it("stops constant search as soon as its time budget expires", () => {
    const raw = add(Array.from({ length: 6 }, (_, index) => sin(mul(c(0.21 + index * 0.13), x()))));
    const candidate = makeCandidate(raw, "sinusoid", data);
    let checks = 0;
    const boundedBeautify = beautifyCandidate as unknown as (
      item: typeof candidate,
      curve: typeof data,
      shouldStop: () => boolean,
    ) => typeof candidate;

    boundedBeautify(candidate, data, () => { checks += 1; return true; });

    expect(checks).toBe(1);
  });
});
