import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';

import { Chip, Hanja, Surface, Txt } from '@/components/ui';
import { data, type Compound, type HanjaChar } from '@/data';
import { useQuery } from '@/hooks/useQuery';
import { alpha, FONT, RADIUS, SP } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';

export default function CharacterDetail() {
  const { t } = useTheme();
  const { hanja } = useLocalSearchParams<{ hanja: string }>();
  const key = decodeURIComponent(hanja);

  const { data: char, loading } = useQuery<HanjaChar | undefined>(() => data.getCharacter(key), [key]);
  const { data: compounds } = useQuery<Compound[]>(() => data.compoundsForChar(key), [key]);

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
        <Hanja char={char.hanja} size={FONT.hanjaHero} />
        <Txt style={{ fontSize: 22, marginTop: SP.sm }}>
          {char.meaningKo} {char.primarySound}
        </Txt>
        {char.meaningEn ? <Txt kind="secondary" style={{ fontSize: 15 }}>{char.meaningEn}</Txt> : null}
      </View>

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
