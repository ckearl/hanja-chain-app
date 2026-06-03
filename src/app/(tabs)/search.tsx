import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CharacterCard } from '@/components/CharacterCard';
import { Hanja, Txt } from '@/components/ui';
import { data, type HanjaChar, type SearchMode } from '@/data';
import { useQuery } from '@/hooks/useQuery';
import { RADIUS, SP } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';

const MODES: { id: SearchMode; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'hanja', label: '漢字' },
  { id: 'korean', label: '한국어' },
  { id: 'english', label: 'English' },
];

export default function SearchScreen() {
  const { t } = useTheme();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('auto');

  const { data: results } = useQuery<HanjaChar[]>(() => data.search(query, mode), [query, mode]);
  const { data: recent } = useQuery<HanjaChar[]>(() => data.recent(), []);

  const trimmed = query.trim();
  const showResults = trimmed.length > 0;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ paddingHorizontal: SP.lg, paddingTop: SP.sm, gap: SP.md }}>
        <Txt kind="title">검색</Txt>

        {/* Search bar */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: SP.sm,
            paddingHorizontal: SP.md,
            height: 46,
            borderRadius: RADIUS.md,
            borderWidth: 1,
            borderColor: t.border2,
            backgroundColor: t.surface,
          }}>
          <Ionicons name="search" size={18} color={t.text3} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="한자, 한국어, or English…"
            placeholderTextColor={t.text3}
            autoCapitalize="none"
            autoCorrect={false}
            style={{ flex: 1, color: t.text, fontSize: 16 }}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={t.text3} />
            </Pressable>
          )}
        </View>

        {/* Mode chips */}
        <View style={{ flexDirection: 'row', gap: SP.sm }}>
          {MODES.map((m) => {
            const active = mode === m.id;
            return (
              <Pressable
                key={m.id}
                onPress={() => setMode(m.id)}
                style={{
                  paddingHorizontal: SP.md,
                  paddingVertical: 6,
                  borderRadius: RADIUS.pill,
                  borderWidth: 1,
                  borderColor: active ? t.accent : t.border2,
                  backgroundColor: active ? t.accent : 'transparent',
                }}>
                <Txt style={{ color: active ? '#fff' : t.text2, fontSize: 13 }}>{m.label}</Txt>
              </Pressable>
            );
          })}
        </View>
      </View>

      {showResults ? (
        <ResultsList results={results ?? []} onOpen={(h) => router.push(`/character/${h}`)} />
      ) : (
        <RecentRow recent={recent ?? []} onPick={(h) => setQuery(h)} />
      )}
    </SafeAreaView>
  );
}

function ResultsList({ results, onOpen }: { results: HanjaChar[]; onOpen: (h: string) => void }) {
  const { t } = useTheme();
  return (
    <FlatList
      data={results}
      keyExtractor={(c) => c.hanja}
      contentContainerStyle={{ padding: SP.lg, gap: SP.md }}
      ListHeaderComponent={
        <Txt kind="label" style={{ marginBottom: 2 }}>
          {results.length} result{results.length === 1 ? '' : 's'}
        </Txt>
      }
      ListEmptyComponent={
        <View style={{ alignItems: 'center', paddingTop: SP.xxl }}>
          <Txt kind="secondary">No matches.</Txt>
        </View>
      }
      renderItem={({ item }) => <ResultCardWithExamples char={item} onOpen={onOpen} />}
      keyboardShouldPersistTaps="handled"
      style={{ backgroundColor: t.bg }}
    />
  );
}

function ResultCardWithExamples({ char, onOpen }: { char: HanjaChar; onOpen: (h: string) => void }) {
  const { data: compounds } = useQuery(() => data.compoundsForChar(char.hanja, 4), [char.hanja]);
  return (
    <CharacterCard char={char} compounds={compounds ?? []} onPress={() => onOpen(char.hanja)} compact />
  );
}

function RecentRow({ recent, onPick }: { recent: HanjaChar[]; onPick: (h: string) => void }) {
  const { t } = useTheme();
  return (
    <View style={{ padding: SP.lg, gap: SP.md }}>
      <Txt kind="label">Recently viewed</Txt>
      <View style={{ flexDirection: 'row', gap: SP.md, flexWrap: 'wrap' }}>
        {recent.map((c) => (
          <Pressable
            key={c.hanja}
            onPress={() => onPick(c.hanja)}
            style={{
              width: 64,
              height: 64,
              borderRadius: RADIUS.md,
              borderWidth: 1,
              borderColor: t.border,
              backgroundColor: t.surface,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Hanja char={c.hanja} size={30} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}
