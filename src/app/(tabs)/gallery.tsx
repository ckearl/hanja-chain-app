// ── Gallery — browse every core Hanja ───────────────────────────────────
// A nested, cumulative filter in the style of pinned browser tabs:
// 초성 (folded, ㄲ→ㄱ) → 중성 (folded, ㅘ→ㅗ) → full syllable. Each level only
// offers options that exist under the levels above it, and removing a pinned
// filter also removes everything below it. The whole index (~1,800 rows, no
// readings join) loads once; filtering and chip derivation happen in memory.
//
// User state ("saved" characters) doesn't exist yet. GalleryBrowser takes an
// `only` set as the seam: once saving lands, pass the saved Hanja to narrow
// the browser to them. Until then the tab browses everything.

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { memo, useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Hanja, Txt } from '@/components/ui';
import { data, decompose, type GalleryEntry } from '@/data';
import { useQuery } from '@/hooks/useQuery';
import { alpha, RADIUS, SP } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';

// Display order for chips (folded jamo only — decompose never returns tense
// initials or compound vowels other than ㅐ/ㅔ).
const CHO_ORDER = ['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅅ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const JUNG_ORDER = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅗ', 'ㅛ', 'ㅜ', 'ㅠ', 'ㅡ', 'ㅣ'];
// All 21 medial vowels in Unicode order — to name the actual (unfolded) vowels
// behind a folded chip, e.g. ㅜ covers ㅜ·ㅝ·ㅟ.
const RAW_JUNG = ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ','ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ'];
const rawVowel = (syllable: string) => {
  const code = syllable.charCodeAt(0) - 0xac00;
  return code >= 0 && code <= 11171 ? RAW_JUNG[Math.floor((code % 588) / 28)] : '';
};

const CELL_MIN = 76; // target cell width; columns = floor(width / CELL_MIN)
const CELL_H = 104;
const PAD = SP.lg;
const GAP = SP.sm;

type Row = GalleryEntry & { cho: string | null; jung: string | null; vowel: string };
type Opt = { value: string; count: number; label?: string };

export default function GalleryScreen() {
  return <GalleryBrowser />;
}

// TODO(user-state): pass `only={savedHanja}` once saving exists.
function GalleryBrowser({ only }: { only?: ReadonlySet<string> }) {
  const { t } = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();

  const { data: index, loading } = useQuery(() => data.galleryIndex(), []);
  const rows = useMemo<Row[]>(
    () =>
      (index ?? [])
        .filter((e) => !only || only.has(e.hanja))
        .map((e) => ({ ...e, ...decompose(e.primarySound), vowel: rawVowel(e.primarySound) })),
    [index, only],
  );

  const [cho, setCho] = useState<string | null>(null);
  const [jung, setJung] = useState<string | null>(null);
  const [syl, setSyl] = useState<string | null>(null);

  // Cumulative: picking/clearing a level resets everything below it.
  const pickCho = (c: string | null) => {
    setCho(c);
    setJung(null);
    setSyl(null);
  };
  const pickJung = (v: string | null) => {
    setJung(v);
    setSyl(null);
  };

  const byCho = useMemo(() => (cho ? rows.filter((r) => r.cho === cho) : rows), [rows, cho]);
  const byJung = useMemo(() => (jung ? byCho.filter((r) => r.jung === jung) : byCho), [byCho, jung]);
  const results = useMemo(() => (syl ? byJung.filter((r) => r.primarySound === syl) : byJung), [byJung, syl]);

  // Options present at each level, with counts.
  const choOpts = useMemo(() => countBy(rows, (r) => r.cho, CHO_ORDER), [rows]);
  // Folded vowel chips are labelled with the real vowels they cover (ㅜ·ㅝ·ㅟ).
  const jungOpts = useMemo<Opt[]>(() => {
    if (!cho) return [];
    return countBy(byCho, (r) => r.jung, JUNG_ORDER).map((o) => {
      const present = new Set(byCho.filter((r) => r.jung === o.value).map((r) => r.vowel));
      return { ...o, label: RAW_JUNG.filter((v) => present.has(v)).join('·') };
    });
  }, [byCho, cho]);
  const jungLabel = jungOpts.find((o) => o.value === jung)?.label ?? jung;
  const sylOpts = useMemo(() => (jung ? countBy(byJung, (r) => r.primarySound) : []), [byJung, jung]);

  const cols = Math.max(3, Math.floor((width - PAD * 2 + GAP) / (CELL_MIN + GAP)));
  const cellW = (width - PAD * 2 - GAP * (cols - 1)) / cols;

  const open = useCallback((h: string) => router.push(`/character/${h}`), [router]);
  const renderItem = useCallback(
    ({ item }: { item: Row }) => <Cell entry={item} width={cellW} onOpen={open} />,
    [cellW, open],
  );

  const scope = syl ? `음 ${syl}` : cho && jung ? `${cho} + ${jungLabel}` : cho ? `초성 ${cho}` : null;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ paddingHorizontal: PAD, paddingTop: SP.sm, gap: SP.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: SP.sm }}>
          <Txt kind="title">서랍</Txt>
          <Txt kind="label">Gallery · {rows.length.toLocaleString()}자</Txt>
        </View>
      </View>

      {/* Pinned filter trail */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ paddingHorizontal: PAD, paddingVertical: SP.md, gap: SP.sm, alignItems: 'center' }}>
        <Txt kind="label" style={{ marginRight: 2 }}>
          필터
        </Txt>
        <TrailTab label="전체" active={!cho} onPress={() => pickCho(null)} />
        {cho && <TrailTab label={cho} pinned onRemove={() => pickCho(null)} />}
        {cho && jung && <TrailTab label={`${cho} ${jungLabel}`} pinned onRemove={() => pickJung(null)} />}
        {syl && <TrailTab label={syl} pinned strong onRemove={() => setSyl(null)} />}
      </ScrollView>

      <ChipRow opts={choOpts} selected={cho} onPick={(c) => pickCho(c === cho ? null : c)} />
      {cho && <ChipRow opts={jungOpts} selected={jung} prefix={cho} onPick={(v) => pickJung(v === jung ? null : v)} />}
      {jung && <ChipRow opts={sylOpts} selected={syl} onPick={(s) => setSyl(s === syl ? null : s)} />}

      <View style={{ paddingHorizontal: PAD, paddingTop: SP.sm, paddingBottom: SP.sm }}>
        <Txt kind="secondary">
          <Txt style={{ fontWeight: '700' }}>{results.length.toLocaleString()}</Txt>자
          {scope ? <Txt kind="tertiary"> · {scope}</Txt> : null}
        </Txt>
      </View>

      {loading && !index ? (
        <View style={{ paddingTop: SP.xxl, alignItems: 'center' }}>
          <ActivityIndicator color={t.accent} />
        </View>
      ) : (
        <FlatList
          key={cols} // numColumns can't change on the fly
          data={results}
          keyExtractor={(r) => r.hanja}
          numColumns={cols}
          renderItem={renderItem}
          // With numColumns, getItemLayout is called per ROW (index = row index).
          getItemLayout={(_, i) => ({ length: CELL_H + GAP, offset: (CELL_H + GAP) * i, index: i })}
          columnWrapperStyle={{ gap: GAP }}
          contentContainerStyle={{ paddingHorizontal: PAD, paddingBottom: SP.xxl, gap: GAP }}
          initialNumToRender={8} // rows, not items
          maxToRenderPerBatch={6}
          windowSize={5}
          removeClippedSubviews
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingTop: SP.xxl }}>
              <Txt kind="secondary">이 조건에 맞는 한자가 없어요.</Txt>
            </View>
          }
          style={{ flex: 1 }}
        />
      )}
    </SafeAreaView>
  );
}

// Present values of `key` (in `order`, if given; else first-seen order) with counts.
function countBy(rows: Row[], key: (r: Row) => string | null, order?: string[]): Opt[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const k = key(r);
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const keys = order ? order.filter((k) => counts.has(k)) : [...counts.keys()];
  return keys.map((k) => ({ value: k, count: counts.get(k)! }));
}

function TrailTab({
  label,
  active,
  pinned,
  strong,
  onPress,
  onRemove,
}: {
  label: string;
  active?: boolean;
  pinned?: boolean;
  strong?: boolean;
  onPress?: () => void;
  onRemove?: () => void;
}) {
  const { t } = useTheme();
  const on = active || pinned;
  return (
    <Pressable
      onPress={onPress ?? onRemove}
      accessibilityRole="button"
      accessibilityLabel={pinned ? `${label} 필터 해제` : label}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingLeft: SP.md,
        paddingRight: pinned ? SP.sm : SP.md,
        paddingVertical: 6,
        borderRadius: RADIUS.sm,
        borderWidth: 1,
        borderColor: on ? t.accent : t.border2,
        backgroundColor: strong ? t.accent : on ? alpha(t.accent, 0.16) : 'transparent',
        opacity: pressed ? 0.6 : 1,
      })}>
      <Txt style={{ fontSize: 15, fontWeight: '600', color: strong ? t.bg : on ? t.accent : t.text2 }}>{label}</Txt>
      {pinned && <Ionicons name="close" size={14} color={strong ? t.bg : t.accent} />}
    </Pressable>
  );
}

function ChipRow({
  opts,
  selected,
  prefix = '',
  onPick,
}: {
  opts: Opt[];
  selected: string | null;
  prefix?: string;
  onPick: (v: string) => void;
}) {
  const { t } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0 }}
      contentContainerStyle={{ paddingHorizontal: PAD, paddingBottom: SP.sm, gap: 6 }}>
      {opts.map(({ value, count, label }) => {
        const on = value === selected;
        return (
          <Pressable
            key={value}
            onPress={() => onPick(value)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={({ pressed }) => ({
              minWidth: 44,
              alignItems: 'center',
              paddingHorizontal: SP.sm,
              paddingVertical: 5,
              borderRadius: RADIUS.sm,
              borderWidth: 1,
              borderColor: on ? t.accent : t.border,
              backgroundColor: on ? t.accent : t.surface,
              opacity: pressed ? 0.6 : 1,
            })}>
            <Txt style={{ fontSize: 16, color: on ? t.bg : t.text }}>
              {prefix}
              {label ?? value}
            </Txt>
            <Txt style={{ fontSize: 10, color: on ? t.bg : t.text3 }}>{count}</Txt>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const Cell = memo(function Cell({
  entry,
  width,
  onOpen,
}: {
  entry: Row;
  width: number;
  onOpen: (h: string) => void;
}) {
  const { t } = useTheme();
  return (
    <Pressable
      onPress={() => onOpen(entry.hanja)}
      accessibilityLabel={[entry.hanja, entry.meaningKo, entry.primarySound].filter(Boolean).join(' ')}
      style={({ pressed }) => ({
        width,
        height: CELL_H,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        borderRadius: RADIUS.md,
        borderWidth: 1,
        borderColor: t.border,
        backgroundColor: pressed ? t.surface2 : t.surface,
      })}>
      <Hanja char={entry.hanja} size={40} />
      <Txt kind="tertiary" numberOfLines={1} style={{ paddingHorizontal: 4 }}>
        {entry.meaningKo ? `${entry.meaningKo} ` : ''}
        <Txt style={{ fontSize: 12, color: t.text2, fontWeight: '600' }}>{entry.primarySound}</Txt>
      </Txt>
    </Pressable>
  );
});
