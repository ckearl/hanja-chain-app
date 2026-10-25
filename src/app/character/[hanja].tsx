import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { type Rect, StrokePractice } from '@/components/strokes/StrokePractice';
import { Chip, Hanja, Surface, Txt } from '@/components/ui';
import { data, type Compound, type HanjaChar, type StrokeOrder, user } from '@/data';
import { useQuery } from '@/hooks/useQuery';
import { useUserQuery } from '@/hooks/useUserQuery';
import { alpha, FONT, RADIUS, SP } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';

export default function CharacterDetail() {
  const { t } = useTheme();
  const { hanja } = useLocalSearchParams<{ hanja: string }>();
  const key = decodeURIComponent(hanja);

  const { data: char, loading } = useQuery<HanjaChar | undefined>(() => data.getCharacter(key), [key]);
  const { data: compounds } = useQuery<Compound[]>(() => data.compoundsForChar(key), [key]);
  const { data: saved } = useUserQuery(() => user.isSaved(key), [key]);
  const { data: strokes } = useQuery<StrokeOrder | undefined>(() => data.strokeOrder(key), [key]);

  // Stroke practice opens from the hero glyph's on-screen rect so the card can
  // spin out of it.
  const heroRef = useRef<ComponentRef<typeof View>>(null);
  const [practiceFrom, setPracticeFrom] = useState<Rect | null | undefined>(undefined);
  const openPractice = () => {
    const hero = heroRef.current;
    if (!hero) return setPracticeFrom(null);
    hero.measureInWindow((x, y, width, height) => setPracticeFrom({ x, y, width, height }));
  };

  // Log the visit (feeds Search's "Recently viewed" and the streak) once the
  // character is known to exist.
  const found = char?.hanja;
  useEffect(() => {
    if (found) user.recordView(found).catch((err) => console.error('[recordView]', err));
  }, [found]);

  if (loading) return <View style={{ flex: 1, backgroundColor: t.bg }} />;
  if (!char) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg }}>
        <Txt kind="secondary">{key} not found in the current dataset.</Txt>
      </View>
    );
  }

  const meta = [
    char.level && { label: 'Grade', value: char.level },
    char.coreLevel && { label: 'Core', value: char.coreLevel === 'middle' ? 'Middle school' : 'High school' },
    char.radical && { label: 'Radical', value: char.radical },
    char.totalStrokes != null && { label: 'Strokes', value: String(char.totalStrokes) },
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ padding: SP.lg, gap: SP.lg }}>
      {/* Hero */}
      <View style={{ alignItems: 'center', gap: SP.sm, paddingVertical: SP.lg }}>
        <SaveToggle hanja={char.hanja} saved={!!saved} />
        <Pressable
          ref={heroRef}
          onPress={openPractice}
          disabled={!strokes}
          accessibilityRole="button"
          accessibilityLabel={`${char.hanja} 획순 연습`}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          <Hanja char={char.hanja} size={FONT.hanjaHero} />
        </Pressable>
        <Txt style={{ fontSize: 22, marginTop: SP.sm }}>
          {char.meaningKo} {char.primarySound}
        </Txt>
        {char.meaningEn ? <Txt kind="secondary" style={{ fontSize: 15 }}>{char.meaningEn}</Txt> : null}
        {strokes ? <PracticeButton onPress={openPractice} /> : null}
      </View>

      {strokes && practiceFrom !== undefined ? (
        <StrokePractice
          hanja={char.hanja}
          order={strokes}
          origin={practiceFrom}
          onClose={() => setPracticeFrom(undefined)}
        />
      ) : null}

      {/* Meta chips */}
      {meta.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SP.sm, justifyContent: 'center' }}>
          {meta.map((m) => (
            <Chip key={m.label} label={`${m.label} · ${m.value}`} />
          ))}
        </View>
      )}

      {/* Readings (multi-reading chars like 樂) */}
      {char.readings.length > 1 && (
        <Surface level={1} style={{ padding: SP.lg, gap: SP.sm }}>
          <Txt kind="label">Readings</Txt>
          {char.readings.map((r) => (
            <View key={r.reading} style={{ flexDirection: 'row', alignItems: 'center', gap: SP.sm }}>
              <Hanja char={char.hanja} size={FONT.hanjaSm} />
              <Txt style={{ fontSize: 17 }}>{r.reading}</Txt>
              {r.meaningKo ? <Txt kind="secondary">{r.meaningKo}</Txt> : null}
              {r.isPrimary ? <Chip label="primary" /> : null}
            </View>
          ))}
        </Surface>
      )}

      {/* Compounds */}
      <View style={{ gap: SP.md }}>
        <Txt kind="label">Words with {char.hanja} ({compounds?.length ?? 0})</Txt>
        {(compounds ?? []).map((c) => (
          <CompoundRow key={c.id} compound={c} focus={char.hanja} />
        ))}
        {compounds && compounds.length === 0 ? (
          <Txt kind="secondary">No compounds yet — more arrive as the dictionary builds.</Txt>
        ) : null}
      </View>
    </ScrollView>
  );
}

function SaveToggle({ hanja, saved }: { hanja: string; saved: boolean }) {
  const { t } = useTheme();
  return (
    <Pressable
      onPress={() => user.toggleSaved(hanja).catch((err) => console.error('[toggleSaved]', err))}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={saved ? `${hanja} 저장 해제` : `${hanja} 저장`}
      accessibilityState={{ selected: saved }}
      style={({ pressed }) => ({
        position: 'absolute',
        top: 0,
        right: 0,
        width: 40,
        height: 40,
        borderRadius: RADIUS.pill,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: saved ? t.accent : t.border2,
        backgroundColor: saved ? alpha(t.accent, 0.16) : 'transparent',
        opacity: pressed ? 0.6 : 1,
      })}>
      <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={18} color={saved ? t.accent : t.text2} />
    </Pressable>
  );
}

function PracticeButton({ onPress }: { onPress: () => void }) {
  const { t } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: SP.xs,
        marginTop: SP.sm,
        paddingHorizontal: SP.md,
        paddingVertical: SP.xs + 2,
        borderRadius: RADIUS.pill,
        borderWidth: 1,
        borderColor: t.border2,
        opacity: pressed ? 0.6 : 1,
      })}>
      <Ionicons name="brush-outline" size={14} color={t.accent} />
      <Txt style={{ fontSize: 13, color: t.accent }}>획순 연습</Txt>
    </Pressable>
  );
}

function CompoundRow({ compound, focus }: { compound: Compound; focus: string }) {
  const { t } = useTheme();
  const router = useRouter();
  const english = compound.englishGloss ?? compound.definitionEn;

  return (
    <Surface level={1} style={{ padding: SP.lg, gap: SP.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: SP.sm }}>
          <Txt style={{ fontSize: 18, fontWeight: '600' }}>{compound.wordKo}</Txt>
          {/* Hanja chain — tap a non-focus char to jump to its detail */}
          <View style={{ flexDirection: 'row' }}>
            {compound.chars.map((ch, i) => {
              const isFocus = ch.hanja === focus;
              return (
                <Pressable
                  key={`${ch.hanja}-${i}`}
                  disabled={isFocus}
                  onPress={() => router.push(`/character/${ch.hanja}`)}>
                  <Hanja
                    char={ch.hanja}
                    size={18}
                    color={isFocus ? t.accent : t.text2}
                    style={isFocus ? { backgroundColor: alpha(t.accent, 0.16), borderRadius: 4 } : undefined}
                  />
                </Pressable>
              );
            })}
          </View>
        </View>
        {english ? (
          <Ionicons name="language-outline" size={16} color={t.text3} />
        ) : null}
      </View>

      {english ? <Txt kind="secondary">{english}</Txt> : null}
      {compound.definitionKo ? (
        <Txt kind="tertiary" numberOfLines={2} style={{ lineHeight: 17 }}>
          {compound.definitionKo}
        </Txt>
      ) : null}
    </Surface>
  );
}
