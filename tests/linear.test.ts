import { describe, expect, it } from "vitest";
import { leastSquares, matrixMultiply, transpose } from "../src/math/matrix";

describe("stable least squares", () => {
  it("recovers a line without forming normal equations", () => {
    const x = [-2, -1, 0, 1, 2];
    const design = x.map((value) => [1, value]);
    const solution = leastSquares(design, [5, 3, 1, -1, -3]);
    expect(solution).toHaveLength(2);
    expect(solution[0]).toBeCloseTo(1, 10);
    expect(solution[1]).toBeCloseTo(-2, 10);
  });

  it("multiplies rectangular matrices with compatible dimensions", () => {
    expect(matrixMultiply([[1, 2]], [[3], [4]])).toEqual([[11]]);
    expect(transpose([[1, 2], [3, 4]])).toEqual([[1, 3], [2, 4]]);
  });
});
