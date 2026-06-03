// Small themed UI kit shared across screens.
import { Platform, Pressable, Text, type TextProps, View, type ViewProps } from 'react-native';

import { alpha, FONT, RADIUS, SP } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';

const SERIF = Platform.select({ ios: 'ui-serif', android: 'serif', default: 'serif' });

type TxtKind = 'body' | 'secondary' | 'tertiary' | 'label' | 'title' | 'mono';

export function Txt({
  kind = 'body',
  style,
  ...rest
}: TextProps & { kind?: TxtKind }) {
  const { t } = useTheme();
  const map = {
    body: { color: t.text, fontSize: 15 },
    secondary: { color: t.text2, fontSize: 14 },
    tertiary: { color: t.text3, fontSize: 12 },
    label: { color: t.text2, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' as const },
    title: { color: t.text, fontSize: 26, fontWeight: '700' as const },
    mono: { color: t.text2, fontSize: 13, fontFamily: Platform.select({ ios: 'ui-monospace', default: 'monospace' }) },
  };
  return <Text style={[map[kind], style]} {...rest} />;
}

// Large editorial Hanja — the visual centerpiece.
export function Hanja({
  char,
  size = FONT.hanjaMd,
  color,
  style,
  ...rest
}: TextProps & { char: string; size?: number; color?: string }) {
  const { t } = useTheme();
  return (
    <Text
      style={[{ fontFamily: SERIF, fontSize: size, color: color ?? t.ink, lineHeight: size * 1.06 }, style]}
      {...rest}>
      {char}
    </Text>
  );
}

export function Surface({ style, level = 1, ...rest }: ViewProps & { level?: 1 | 2 | 3 }) {
  const { t } = useTheme();
  const bg = level === 1 ? t.surface : level === 2 ? t.surface2 : t.surface3;
  return (
    <View
      style={[{ backgroundColor: bg, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: t.border }, style]}
      {...rest}
    />
  );
}

// Compact compound/example pill (e.g. 학교).
export function Pill({
  label,
  onPress,
  active,
}: {
  label: string;
  onPress?: () => void;
  active?: boolean;
}) {
  const { t } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: SP.md,
        paddingVertical: SP.sm,
        borderRadius: RADIUS.pill,
        borderWidth: 1,
        borderColor: active ? t.accent : t.border2,
        backgroundColor: active ? alpha(t.accent, 0.16) : t.surface2,
        opacity: pressed ? 0.6 : 1,
      })}>
      <Text style={{ color: active ? t.accent : t.text, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

// A small grade/meta chip.
export function Chip({ label }: { label: string }) {
  const { t } = useTheme();
  return (
    <View
      style={{
        paddingHorizontal: SP.sm,
        paddingVertical: 3,
        borderRadius: RADIUS.sm,
        backgroundColor: t.surface3,
      }}>
      <Text style={{ color: t.text2, fontSize: 11, letterSpacing: 0.5 }}>{label}</Text>
    </View>
  );
}
