// Geometry for stroke-order graphics: median polylines (animation brush paths)
// and matching a finger-drawn stroke against the expected one. All coordinates
// are in the data's 1024-unit box (y up, see StrokeOrder in @/data).

export type Pt = [number, number];

// Screen y (down, 0..1024) ↔ graphics y (up); matches the
// scale(1,-1) translate(0,-900) transform the outlines are drawn with.
export const GRAPHICS_BASELINE = 900;

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function polylineLength(pts: Pt[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1], pts[i]);
  return len;
}

// The median stretched a little past both ends, so the clipped brush reaches
// the stroke's tips (medians stop short of the outline).
export function extendMedian(median: Pt[], by = 60): Pt[] {
  if (median.length < 2) return median;
  const push = (from: Pt, to: Pt): Pt => {
    const d = dist(from, to) || 1;
    return [to[0] + ((to[0] - from[0]) / d) * by, to[1] + ((to[1] - from[1]) / d) * by];
  };
  return [push(median[1], median[0]), ...median.slice(1, -1), push(median.at(-2)!, median.at(-1)!)];
}

export function toPathD(pts: Pt[]): string {
  return pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');
}

// n points evenly spaced along the polyline (by arc length).
export function resample(pts: Pt[], n: number): Pt[] {
  if (pts.length === 0) return [];
  const total = polylineLength(pts);
  if (pts.length === 1 || total === 0) return Array.from({ length: n }, () => pts[0]);
  const out: Pt[] = [pts[0]];
  const step = total / (n - 1);
  let seg = 1;
  let segStart = 0; // arc length at pts[seg - 1]
  for (let k = 1; k < n - 1; k++) {
    const target = k * step;
    while (seg < pts.length - 1 && segStart + dist(pts[seg - 1], pts[seg]) < target) {
      segStart += dist(pts[seg - 1], pts[seg]);
      seg++;
    }
    const a = pts[seg - 1];
    const b = pts[seg];
    const f = Math.min(1, (target - segStart) / (dist(a, b) || 1));
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
  }
  out.push(pts.at(-1)!);
  return out;
}

// How far the drawn stroke is from the expected median (mean point gap), or
// null when it doesn't pass. Compares the two shapes point-for-point after
// resampling, so drawing a stroke backwards fails even if it covers the same
// pixels. Units are 1024ths of the card; `leniency` > 1 loosens every threshold.
export function strokeDistance(drawn: Pt[], median: Pt[], leniency = 1): number | null {
  const medianLen = polylineLength(median);
  const drawnLen = polylineLength(drawn);

  // Dots (丶 in 主, 心…) are short; a tap near one counts. Anything longer
  // than a tap is judged as a stroke, direction included.
  if (drawnLen < 40) {
    const mid = resample(median, 3)[1];
    const gap = dist(drawn[0], mid);
    return medianLen < 150 && gap < 160 * leniency ? gap : null;
  }
  if (drawnLen < medianLen * 0.3) return null;

  const N = 24;
  const d = resample(drawn, N);
  const m = resample(median, N);
  let sum = 0;
  for (let i = 0; i < N; i++) sum += dist(d[i], m[i]);
  const avg = sum / N;

  // Overall direction must agree; short strokes can otherwise pass backwards.
  const dv = [d[N - 1][0] - d[0][0], d[N - 1][1] - d[0][1]];
  const mv = [m[N - 1][0] - m[0][0], m[N - 1][1] - m[0][1]];
  const cos = (dv[0] * mv[0] + dv[1] * mv[1]) / (Math.hypot(dv[0], dv[1]) * Math.hypot(mv[0], mv[1]) || 1);

  const ok =
    cos > 0.5 &&
    avg < 130 * leniency &&
    dist(d[0], m[0]) < 220 * leniency &&
    dist(d[N - 1], m[N - 1]) < 220 * leniency &&
    drawnLen < medianLen * 2.5 + 150;
  return ok ? avg : null;
}

// Which not-yet-drawn stroke the learner drew: the closest passing match among
// medians[from…], or -1. Parallel strokes (三, 言…) are near enough to pass for
// each other, so the caller accepts only when this is the expected stroke.
export function closestStroke(drawn: Pt[], medians: Pt[][], from: number, leniency = 1): number {
  let best = -1;
  let bestDist = Infinity;
  for (let i = from; i < medians.length; i++) {
    const d = strokeDistance(drawn, medians[i], i === from ? leniency : 1);
    if (d !== null && d < bestDist) {
      best = i;
      bestDist = d;
    }
  }
  return best;
}
