import { memo, useId, useMemo } from 'react';
import Animated, { type SharedValue, useAnimatedProps } from 'react-native-reanimated';
import Svg, { Circle, ClipPath, Defs, G, Path } from 'react-native-svg';

import { type StrokeOrder } from '@/data';

import { extendMedian, GRAPHICS_BASELINE, polylineLength, type Pt, toPathD } from './geometry';

const AnimatedPath = Animated.createAnimatedComponent(Path);

// Brush width for the fill animation; wide enough to cover any stroke once
// clipped to its outline.
const BRUSH = 200;

// A character drawn from stroke outlines. Every stroke shows as a faint
// "hollow" shape; `progress` (in strokes: 2.5 = two done, the third half
// filled) sweeps a clipped brush along each median to fill them in order.
export function StrokeCanvas({
  order,
  size,
  progress,
  ink,
  hollowOpacity = 0.16,
  hint,
  trace,
  traceColor,
}: {
  order: StrokeOrder;
  size: number;
  progress: SharedValue<number>;
  ink: string;
  hollowOpacity?: number;
  hint?: { index: number; color: string } | null; // highlight the stroke to draw next
  trace?: Pt[]; // the finger stroke in progress, in screen-space 1024ths
  traceColor?: string;
}) {
  // useId contains ':' which isn't valid inside url(#…).
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');

  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024">
      <Strokes order={order} uid={uid} progress={progress} ink={ink} hollowOpacity={hollowOpacity} />
      {hint ? <Hint order={order} {...hint} /> : null}
      {trace && trace.length > 0 ? (
        trace.length === 1 ? (
          <Circle cx={trace[0][0]} cy={trace[0][1]} r={18} fill={traceColor ?? ink} />
        ) : (
          <Path
            d={toPathD(trace)}
            stroke={traceColor ?? ink}
            strokeWidth={36}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        )
      ) : null}
    </Svg>
  );
}

// Hollow shapes + animated fills. Memoized so per-move trace updates don't
// re-render every stroke.
const Strokes = memo(function Strokes({
  order,
  uid,
  progress,
  ink,
  hollowOpacity,
}: {
  order: StrokeOrder;
  uid: string;
  progress: SharedValue<number>;
  ink: string;
  hollowOpacity: number;
}) {
  const brushes = useMemo(
    () =>
      order.medians.map((m) => {
        const pts = extendMedian(m as Pt[]);
        return { d: toPathD(pts), len: polylineLength(pts) };
      }),
    [order],
  );

  return (
    <G transform={`scale(1,-1) translate(0,-${GRAPHICS_BASELINE})`}>
      <Defs>
        {order.strokes.map((d, i) => (
          <ClipPath key={i} id={`${uid}c${i}`}>
            <Path d={d} />
          </ClipPath>
        ))}
      </Defs>
      {order.strokes.map((d, i) => (
        <Path key={`h${i}`} d={d} fill={ink} opacity={hollowOpacity} />
      ))}
      {order.strokes.map((d, i) => (
        <FilledStroke
          key={`f${i}`}
          index={i}
          outline={d}
          brush={brushes[i]}
          clipId={`${uid}c${i}`}
          progress={progress}
          ink={ink}
        />
      ))}
    </G>
  );
});

function FilledStroke({
  index,
  outline,
  brush,
  clipId,
  progress,
  ink,
}: {
  index: number;
  outline: string;
  brush: { d: string; len: number };
  clipId: string;
  progress: SharedValue<number>;
  ink: string;
}) {
  const brushProps = useAnimatedProps(() => {
    const p = Math.min(1, Math.max(0, progress.value - index));
    // Hidden until it starts, so the dash's leading edge never shows early.
    return { strokeDashoffset: brush.len * (1 - p), opacity: p > 0 && p < 1 ? 1 : 0 };
  });
  // Once a stroke is done, show its exact outline (the brush can miss slivers).
  const outlineProps = useAnimatedProps(() => ({ opacity: progress.value - index >= 1 ? 1 : 0 }));

  return (
    <>
      <AnimatedPath
        d={brush.d}
        stroke={ink}
        strokeWidth={BRUSH}
        strokeLinecap="butt"
        strokeLinejoin="round"
        fill="none"
        strokeDasharray={[brush.len, brush.len]}
        clipPath={`url(#${clipId})`}
        animatedProps={brushProps}
      />
      <AnimatedPath d={outline} fill={ink} animatedProps={outlineProps} />
    </>
  );
}

// The next stroke tinted, with a dot where it starts.
function Hint({ order, index, color }: { order: StrokeOrder; index: number; color: string }) {
  const start = order.medians[index]?.[0];
  if (!start) return null;
  return (
    <G transform={`scale(1,-1) translate(0,-${GRAPHICS_BASELINE})`}>
      <Path d={order.strokes[index]} fill={color} opacity={0.45} />
      <Circle cx={start[0]} cy={start[1]} r={30} fill={color} />
    </G>
  );
}
