import { describe, expect, it } from "vitest";
import { dominantFrequencies, realFFT } from "../src/math/fft";

describe("spectral features", () => {
  it("finds the dominant discrete frequency of a sampled sine", () => {
    const samples = Array.from({ length: 128 }, (_, index) => Math.sin((2 * Math.PI * 7 * index) / 128));
    const spectrum = realFFT(samples);
    expect(spectrum[7]).toBeGreaterThan(0.45);
    expect(dominantFrequencies(samples, 3)[0]).toBe(7);
  });
});
