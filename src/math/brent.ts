export interface ScalarMinimum {
  x: number;
  value: number;
}

export function brentMinimize(fn: (x: number) => number, lower: number, upper: number, tolerance = 1e-6, maxIterations = 80): ScalarMinimum {
  let a = Math.min(lower, upper);
  let b = Math.max(lower, upper);
  const golden = 0.3819660112501051;
  let x = a + golden * (b - a);
  let w = x;
  let v = x;
  let fx = fn(x);
  let fw = fx;
  let fv = fx;
  let d = 0;
  let e = 0;

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const midpoint = 0.5 * (a + b);
    const toleranceX = tolerance * Math.abs(x) + tolerance;
    if (Math.abs(x - midpoint) <= 2 * toleranceX - 0.5 * (b - a)) break;
    let step = golden * (x < midpoint ? b - x : a - x);
    const r = (x - w) * (fx - fv);
    const q = (x - v) * (fx - fw);
    const p = (x - v) * q - (x - w) * r;
    const q2 = 2 * (q - r);
    if (Math.abs(e) > toleranceX && Math.abs(q2) > 1e-20) {
      const candidate = p / q2;
      if (candidate > Math.min(a - x, b - x) && candidate < Math.max(a - x, b - x) && Math.abs(candidate) < 0.5 * Math.abs(e)) {
        step = candidate;
      }
    }
    e = d;
    d = Math.abs(step) >= toleranceX ? step : step >= 0 ? toleranceX : -toleranceX;
    const u = x + d;
    const fu = fn(u);
    if (fu <= fx) {
      if (u < x) b = x; else a = x;
      v = w; fv = fw;
      w = x; fw = fx;
      x = u; fx = fu;
    } else {
      if (u < x) a = u; else b = u;
      if (fu <= fw || w === x) {
        v = w; fv = fw;
        w = u; fw = fu;
      } else if (fu <= fv || v === x || v === w) {
        v = u; fv = fu;
      }
    }
  }
  return { x, value: fx };
}
