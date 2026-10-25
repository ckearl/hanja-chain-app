import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, PanResponder, Pressable, useWindowDimensions, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { Hanja, Txt } from '@/components/ui';
import { type StrokeOrder } from '@/data';
import { ACCENTS, alpha, RADIUS, SP } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';

import { closestStroke, GRAPHICS_BASELINE, polylineLength, type Pt } from './geometry';
import { StrokeCanvas } from './StrokeCanvas';

export type Rect = { x: number; y: number; width: number; height: number };

type Phase = 'intro' | 'demo' | 'practice' | 'done';

const FLY_MS = 800;
const MISSES_BEFORE_HINT = 2;

// Demo pace: longer strokes take longer, within limits.
const strokeMs = (median: Pt[]) => Math.min(900, Math.max(320, 200 + polylineLength(median) * 0.7));

// Full-screen stroke-order lesson. The card spins in from `origin` (the hero
// glyph's window rect) to the center, the character turns hollow and its
// strokes fill in one by one, then the learner traces each stroke in order.
export function StrokePractice({
  hanja,
  order,
  origin,
  onClose,
}: {
  hanja: string;
  order: StrokeOrder;
  origin: Rect | null;
  onClose: () => void;
}) {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const total = order.strokes.length;

  // Card geometry: square, centered, nudged up to leave room for the controls.
  const S = Math.round(Math.min(W - SP.xl * 2, H * 0.5, 440));
  const cardLeft = (W - S) / 2;
  const cardTop = Math.max(insets.top + 72, (H - S) / 2 - 48);
  const from = useMemo(() => {
    if (!origin) return { dx: 0, dy: H / 3, scale: 0.3 };
    return {
      dx: origin.x + origin.width / 2 - (cardLeft + S / 2),
      dy: origin.y + origin.height / 2 - (cardTop + S / 2),
      scale: Math.max(0.15, origin.width / S),
    };
  }, [origin, cardLeft, cardTop, S, H]);

  const fly = useSharedValue(0); // 0 = at the hero glyph, 1 = centered
  const reveal = useSharedValue(0); // 0 = font glyph, 1 = stroke canvas
  const progress = useSharedValue(0); // strokes filled (fractional mid-stroke)

  const [phase, setPhase] = useState<Phase>('intro');
  const [current, setCurrent] = useState(0); // next stroke to draw
  const [misses, setMisses] = useState(0);
  const [trace, setTrace] = useState<Pt[]>([]);
  const [traceMissed, setTraceMissed] = useState(false);

  // ── Demo ───────────────────────────────────────────────────────────
  const startPractice = useCallback(() => {
    cancelAnimation(progress);
    progress.value = withTiming(0, { duration: 350 });
    setCurrent(0);
    setMisses(0);
    setTrace([]);
    setPhase('practice');
  }, [progress]);

  const playDemo = useCallback(() => {
    cancelAnimation(progress);
    progress.value = 0;
    setTrace([]);
    setPhase('demo');
    const steps = order.medians.map((m, i) =>
      withDelay(
        i === 0 ? 300 : 140,
        withTiming(
          i + 1,
          { duration: strokeMs(m as Pt[]), easing: Easing.inOut(Easing.quad) },
          i === total - 1
            ? (finished) => {
                if (finished) scheduleOnRN(onDemoEnd);
              }
            : undefined,
        ),
      ),
    );
    progress.value = withSequence(...steps);
  }, [order, total, progress]);

  // Hold the finished character a beat, then hand over to the learner.
  const demoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function onDemoEnd() {
    demoTimer.current = setTimeout(startPractice, 700);
  }
  useEffect(() => () => {
    if (demoTimer.current) clearTimeout(demoTimer.current);
  }, []);

  // ── Entrance / exit ────────────────────────────────────────────────
  const beginDemo = useCallback(() => {
    reveal.value = withTiming(1, { duration: 350 });
    playDemo();
  }, [reveal, playDemo]);

  useEffect(() => {
    fly.value = withTiming(
      1,
      { duration: reduceMotion ? 0 : FLY_MS, easing: Easing.out(Easing.cubic) },
      (finished) => {
        if (finished) scheduleOnRN(beginDemo);
      },
    );
    // Mount-only: the entrance runs once.
  }, []);

  const closing = useRef(false);
  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    if (demoTimer.current) clearTimeout(demoTimer.current);
    cancelAnimation(progress);
    fly.value = withTiming(
      0,
      { duration: reduceMotion ? 0 : FLY_MS * 0.6, easing: Easing.in(Easing.cubic) },
      () => scheduleOnRN(onClose),
    );
  }, [fly, progress, reduceMotion, onClose]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: fly.value }));
  const cardStyle = useAnimatedStyle(() => {
    const f = fly.value;
    return {
      opacity: Math.min(1, f * 3),
      transform: [
        { perspective: 1200 },
        { translateX: (1 - f) * from.dx },
        { translateY: (1 - f) * from.dy },
        { scale: from.scale + (1 - from.scale) * f },
        { rotateY: `${f * 360}deg` },
      ],
    };
  });
  const glyphStyle = useAnimatedStyle(() => ({ opacity: 1 - reveal.value }));
  const canvasStyle = useAnimatedStyle(() => ({ opacity: reveal.value }));
  const chromeStyle = useAnimatedStyle(() => ({ opacity: Math.max(0, fly.value * 2 - 1) }));

  // ── Practice: finger tracing ───────────────────────────────────────
  // The responder outlives renders, so it reads live state through a ref.
  const live = useRef({ phase, current, misses });
  live.current = { phase, current, misses };
  const points = useRef<Pt[]>([]);
  const missTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (missTimer.current) clearTimeout(missTimer.current);
  }, []);

  const k = 1024 / S; // card px → graphics units
  const kRef = useRef(k);
  kRef.current = k;

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => live.current.phase === 'practice',
        onMoveShouldSetPanResponder: () => live.current.phase === 'practice',
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          if (missTimer.current) clearTimeout(missTimer.current);
          setTraceMissed(false);
          const { locationX, locationY } = e.nativeEvent;
          points.current = [[locationX * kRef.current, locationY * kRef.current]];
          setTrace(points.current);
        },
        onPanResponderMove: (e) => {
          const { locationX, locationY } = e.nativeEvent;
          const p: Pt = [locationX * kRef.current, locationY * kRef.current];
          const last = points.current.at(-1)!;
          if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 8) return;
          points.current = [...points.current, p];
          setTrace(points.current);
        },
        onPanResponderRelease: () => finishStroke(),
        onPanResponderTerminate: () => finishStroke(),
      }),
    [],
  );

  function finishStroke() {
    const { phase: ph, current: idx, misses: m } = live.current;
    if (ph !== 'practice' || points.current.length === 0) return;
    // Screen space (y down) → graphics space (y up).
    const drawn = points.current.map(([x, y]): Pt => [x, GRAPHICS_BASELINE - y]);
    points.current = [];
    const ok = closestStroke(drawn, order.medians as Pt[][], idx, m >= MISSES_BEFORE_HINT ? 1.35 : 1) === idx;
    if (ok) {
      setTrace([]);
      setMisses(0);
      progress.value = withTiming(idx + 1, { duration: 260, easing: Easing.out(Easing.quad) });
      setCurrent(idx + 1);
      if (idx + 1 === total) setPhase('done');
    } else {
      setMisses(m + 1);
      setTraceMissed(true);
      missTimer.current = setTimeout(() => {
        setTrace([]);
        setTraceMissed(false);
      }, 450);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────
  const miss = ACCENTS.seal.hex;
  const status =
    phase === 'intro' || phase === 'demo'
      ? '획순을 잘 보세요'
      : phase === 'practice'
        ? misses >= MISSES_BEFORE_HINT
          ? '표시된 획부터 써 보세요'
          : traceMissed
            ? '다시 한 번 써 보세요'
            : '손가락으로 따라 쓰세요'
        : '완성! 잘 썼어요';
  const shown = phase === 'practice' || phase === 'done' ? current : null;

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={close}>
      <Animated.View
        style={[{ position: 'absolute', inset: 0, backgroundColor: alpha(t.bg, 0.94) }, backdropStyle]}
      />

      {/* Header */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: insets.top + SP.md,
            left: SP.lg,
            right: SP.lg,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          },
          chromeStyle,
        ]}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: SP.sm }}>
          <Txt kind="title" style={{ fontSize: 22 }}>
            획순
          </Txt>
          <Txt kind="secondary">
            {shown != null ? `${shown} / ${total}획` : `${total}획`}
          </Txt>
        </View>
        <IconButton icon="close" label="닫기" onPress={close} />
      </Animated.View>

      {/* Card */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: cardLeft,
            top: cardTop,
            width: S,
            height: S,
            borderRadius: RADIUS.lg,
            borderWidth: 1,
            borderColor: t.border2,
            backgroundColor: t.surface,
            shadowColor: t.shadow,
            shadowOpacity: 1,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 12 },
            elevation: 12,
            overflow: 'hidden',
          },
          cardStyle,
        ]}>
        <Guides size={S} color={t.border} />
        <Animated.View
          style={[{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }, glyphStyle]}>
          <Hanja char={hanja} size={S * 0.72} />
        </Animated.View>
        <Animated.View style={[{ position: 'absolute', inset: 0 }, canvasStyle]}>
          <StrokeCanvas
            order={order}
            size={S}
            progress={progress}
            ink={t.ink}
            hint={phase === 'practice' && misses >= MISSES_BEFORE_HINT ? { index: current, color: t.accent } : null}
            trace={trace}
            traceColor={traceMissed ? miss : t.accent}
          />
        </Animated.View>
        {/* Touch layer: childless so locationX/Y are relative to the card. */}
        <View
          {...responder.panHandlers}
          accessible
          accessibilityLabel={`${hanja} 따라 쓰기 영역`}
          style={{ position: 'absolute', inset: 0 }}
        />
      </Animated.View>

      {/* Status + controls */}
      <Animated.View
        style={[
          { position: 'absolute', top: cardTop + S + SP.xl, left: SP.lg, right: SP.lg, alignItems: 'center', gap: SP.lg },
          chromeStyle,
        ]}>
        <Txt style={{ fontSize: 16, color: traceMissed ? miss : phase === 'done' ? t.accent : t.text }}>
          {status}
        </Txt>
        <View style={{ flexDirection: 'row', gap: SP.md }}>
          <TextButton icon="play-outline" label="다시 보기" onPress={playDemo} disabled={phase === 'intro'} />
          <TextButton
            icon="brush-outline"
            label={phase === 'practice' || phase === 'done' ? '처음부터 쓰기' : '바로 쓰기'}
            onPress={startPractice}
            disabled={phase === 'intro'}
            primary={phase === 'done'}
          />
        </View>
      </Animated.View>
    </Modal>
  );
}

// 田-style practice guides: dashed center cross.
function Guides({ size, color }: { size: number; color: string }) {
  const line = { position: 'absolute' as const, borderColor: color, borderStyle: 'dashed' as const };
  return (
    <>
      <View style={[line, { left: 0, right: 0, top: size / 2, borderTopWidth: 1 }]} />
      <View style={[line, { top: 0, bottom: 0, left: size / 2, borderLeftWidth: 1 }]} />
    </>
  );
}

function IconButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const { t } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: RADIUS.pill,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: t.border2,
        opacity: pressed ? 0.6 : 1,
      })}>
      <Ionicons name={icon} size={20} color={t.text2} />
    </Pressable>
  );
}

function TextButton({
  icon,
  label,
  onPress,
  disabled,
  primary,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  const { t } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: SP.sm,
        paddingHorizontal: SP.lg,
        paddingVertical: SP.md,
        borderRadius: RADIUS.pill,
        borderWidth: 1,
        borderColor: primary ? t.accent : t.border2,
        backgroundColor: primary ? alpha(t.accent, 0.16) : t.surface2,
        opacity: disabled ? 0.4 : pressed ? 0.6 : 1,
      })}>
      <Ionicons name={icon} size={16} color={primary ? t.accent : t.text} />
      <Txt style={{ fontSize: 14, color: primary ? t.accent : t.text }}>{label}</Txt>
    </Pressable>
  );
}
