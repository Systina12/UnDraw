export interface Complex {
  re: number;
  im: number;
}

function fft(values: readonly Complex[]): Complex[] {
  const n = values.length;
  if (n <= 1) return values.map((value) => ({ ...value }));
  const even = fft(values.filter((_, index) => index % 2 === 0));
  const odd = fft(values.filter((_, index) => index % 2 === 1));
  const result = Array.from({ length: n }, () => ({ re: 0, im: 0 }));
  for (let k = 0; k < n / 2; k += 1) {
    const angle = (-2 * Math.PI * k) / n;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const oddValue = odd[k] ?? { re: 0, im: 0 };
    const rotated = { re: cosine * oddValue.re - sine * oddValue.im, im: sine * oddValue.re + cosine * oddValue.im };
    const evenValue = even[k] ?? { re: 0, im: 0 };
    result[k] = { re: evenValue.re + rotated.re, im: evenValue.im + rotated.im };
    result[k + n / 2] = { re: evenValue.re - rotated.re, im: evenValue.im - rotated.im };
  }
  return result;
}

export function realFFT(samples: readonly number[]): number[] {
  const size = 2 ** Math.ceil(Math.log2(Math.max(2, samples.length)));
  const padded = Array.from({ length: size }, (_, index) => ({ re: samples[index] ?? 0, im: 0 }));
  const transformed = fft(padded);
  return transformed.slice(0, size / 2 + 1).map((value, index) => {
    const scale = index === 0 || index === size / 2 ? 1 / size : 2 / size;
    return Math.hypot(value.re, value.im) * scale;
  });
}

export function dominantFrequencies(samples: readonly number[], count = 5): number[] {
  const spectrum = realFFT(samples);
  return spectrum
    .map((magnitude, frequency) => ({ frequency, magnitude }))
    .slice(1)
    .sort((a, b) => b.magnitude - a.magnitude)
    .slice(0, count)
    .map((item) => item.frequency);
}
