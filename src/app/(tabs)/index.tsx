// ── Daily — the home bento ──────────────────────────────────────────────
// Today's Hanja (hero), then shortcut panes: Gallery, streak, flashcards,
// Search, Chains, and a breakdown of today's character. Every number comes
// from the content DB or the user store; user panes re-derive live through
// useUserQuery (saving on Detail updates them without a reload).
//
// Today's Hanja is a pure function of the LOCAL date: the pool is the easy
// grades (8급 → 5급, ~500 chars taught first in school), sorted by code point,
// and day N picks pool[(N × STRIDE) mod size]. STRIDE is coprime with the
// pool size, so the sequence visits every pool character once before any
// repeats, and it flips at local midnight (useLocalDay).

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { AppState, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip, Hanja, Txt } from '@/components/ui';
import { type ActivityDay, data, type GalleryEntry, user } from '@/data';
import { useQuery } from '@/hooks/useQuery';
import { useUserQuery } from '@/hooks/useUserQuery';
import { alpha, FONT, RADIUS, SP } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';

const EASY_GRADES = new Set(['8급', '7급Ⅱ', '7급', '6급Ⅱ', '6급', '5급Ⅱ', '5급']);
const STRIDE = 7919; // prime; nudged below if it ever divides the pool size
const MAX_W = 720; // bento stops growing on wide web
const STREAK_WEEKS = 3;
const EXAMPLE_COUNT = 5;
const WORD_SAMPLE = 100; // word count shown up to this, then "100개 이상" (fetches one extra to know)

type IconName = keyof typeof Ionicons.glyphMap;

// ── Date helpers (local calendar days) ──────────────────────────────────
const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayNumber = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
};
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

// Today's local day key; re-renders just after local midnight, and on
// resume (AppState 'active'; visibilitychange on web) in case the timer went
// stale while the app was backgrounded or the device slept across midnight.
function useLocalDay() {
  const [key, setKey] = useState(() => dayKey(new Date()));
  useEffect(() => {
    const refresh = () => setKey(dayKey(new Date()));
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
    const id = setTimeout(refresh, next.getTime() - now.getTime());
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    return () => {
      clearTimeout(id);
      sub.remove();
    };
  }, [key]);
  return key;
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

function pickDaily(index: GalleryEntry[], day: number): string | undefined {
  const easy = index.filter((e) => e.level && EASY_GRADES.has(e.level));
  const pool = (easy.length ? easy : index).map((e) => e.hanja).sort();
  if (!pool.length) return undefined;
  let stride = STRIDE;
  while (gcd(stride, pool.length) !== 1) stride++;
  return pool[(day * (stride % pool.length)) % pool.length]; // day > 0, product stays well within 2^53
}

// ── Gallery facts — computed, never invented; one is shown per day ──────
function galleryFacts(index: GalleryEntry[], saved: string[]): string[] {
  const savedSet = new Set(saved);
  const facts: string[] = [];

  const basics = index.filter((e) => e.level === '8급');
  if (basics.length) {
    const n = basics.filter((e) => savedSet.has(e.hanja)).length;
    facts.push(
      n
        ? `8급 기초 ${basics.length}자 중 ${n}자 저장 (${Math.round((n / basics.length) * 100)}%)`
        : `가장 먼저 배우는 8급 기초 한자는 ${basics.length}자예요`,
    );
  }

  const bySound = new Map<string, GalleryEntry[]>();
  index.forEach((e) => bySound.set(e.primarySound, [...(bySound.get(e.primarySound) ?? []), e]));
  const [sound, group] = [...bySound].sort((a, b) => b[1].length - a[1].length)[0] ?? [];
  if (sound && group) {
    const n = group.filter((e) => savedSet.has(e.hanja)).length;
    facts.push(
      `가장 흔한 음은 '${sound}' — ${group.length}자가 같은 음` + (n ? `, 그중 ${n}자 저장` : ''),
    );
  }

  if (saved.length) {
    const grades = new Map<string, number>();
    index
      .filter((e) => savedSet.has(e.hanja) && e.level)
      .forEach((e) => grades.set(e.level!, (grades.get(e.level!) ?? 0) + 1));
    const [grade, n] = [...grades].sort((a, b) => b[1] - a[1])[0] ?? [];
    if (grade) facts.push(`저장한 한자 중 가장 많은 급수는 ${grade} (${n}자)`);
    const newest = index.find((e) => e.hanja === saved[0]);
    if (newest) {
      const reading = [newest.meaningKo, newest.primarySound].filter(Boolean).join(' ');
      facts.push(`최근 저장: ${newest.hanja} (${reading})`);
    }
  } else {
    facts.push(`서랍에는 ${index.length.toLocaleString()}자 — 8급부터 특급까지 모두 들어 있어요`);
  }
  return facts;
}

export default function DailyScreen() {
  const { t } = useTheme();
  const router = useRouter();
  const today = useLocalDay();
  const dayNum = dayNumber(today);

  // Content: today's char and its words.
  const { data: index } = useQuery(() => data.galleryIndex(), []);
  const hanja = useMemo(() => (index ? pickDaily(index, dayNum) : undefined), [index, dayNum]);
  const { data: char } = useQuery(async () => (hanja ? data.getCharacter(hanja) : undefined), [hanja]);
  const { data: words } = useQuery(
    async () => (hanja ? data.compoundsForChar(hanja, WORD_SAMPLE + 1) : []),
    [hanja],
  );
  const examples = (words ?? []).slice(0, EXAMPLE_COUNT);
  const seedWord = examples[0];
  const { data: chainWord } = useQuery(
    async () => (seedWord ? data.toChainWord(seedWord.wordKo) : undefined),
    [seedWord?.wordKo],
  );

  // User state (live).
  const { data: stats } = useUserQuery(() => user.stats(), []);
  const { data: saved } = useUserQuery(() => user.savedHanja(), []);
  const { data: activity } = useUserQuery(() => user.activity(STREAK_WEEKS * 7), [today]);

  const facts = useMemo(() => (index ? galleryFacts(index, saved ?? []) : []), [index, saved]);
  const fact = facts.length ? facts[dayNum % facts.length] : undefined;

  const date = new Date();
  const dateLabel = `${WEEKDAYS[date.getDay()]} · ${date.getMonth() + 1}월 ${date.getDate()}일`;

  const savedCount = stats?.savedCount ?? 0;
  const streak = stats?.streak ?? 0;
  const due = stats?.dueCount ?? 0;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: SP.lg, paddingBottom: SP.xxl }}>
        <View style={{ width: '100%', maxWidth: MAX_W, alignSelf: 'center', gap: SP.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: SP.sm, paddingTop: SP.sm }}>
            <Txt kind="title">오늘의 한자</Txt>
            <Txt kind="label">{dateLabel}</Txt>
          </View>

          {/* Hero — today's character */}
          <Pane
            onPress={hanja ? () => router.push(`/character/${hanja}`) : undefined}
            label={`Today's Hanja: ${char ? `${char.hanja}, ${char.meaningKo ?? ''} ${char.primarySound}` : 'loading'}`}
            style={{ alignItems: 'center', paddingVertical: SP.xl }}>
            <View style={{ flexDirection: 'row', alignSelf: 'stretch', alignItems: 'center' }}>
              <Txt kind="label" style={{ flex: 1 }}>
                오늘의 한자
              </Txt>
              {char?.level ? <Chip label={char.level} /> : null}
              <Ionicons name="chevron-forward" size={16} color={t.text3} style={{ marginLeft: SP.sm }} />
            </View>
            {char ? (
              <>
                <Hanja char={char.hanja} size={FONT.hanjaHero} style={{ marginTop: SP.sm }} />
                <Txt style={{ fontSize: 22, marginTop: SP.md, letterSpacing: 2 }}>
                  {char.meaningKo ? `${char.meaningKo} ` : ''}
                  {char.primarySound}
                </Txt>
                {char.meaningEn ? (
                  <Txt kind="secondary" style={{ marginTop: SP.xs, textAlign: 'center' }}>
                    {char.meaningEn}
                  </Txt>
                ) : null}
                {examples.length > 0 && (
                  <View
                    style={{
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      justifyContent: 'center',
                      gap: SP.sm,
                      marginTop: SP.lg,
                    }}>
                    {examples.map((w) => (
                      <WordPill key={w.id} word={w.wordKo} hanja={w.hanjaForm} />
                    ))}
                  </View>
                )}
              </>
            ) : (
              <View style={{ height: FONT.hanjaHero + 120 }} />
            )}
          </Pane>

          {/* Gallery + streak */}
          <View style={{ flexDirection: 'row', gap: SP.md }}>
            <Pane
              half
              onPress={() => router.navigate('/gallery')}
              label={`Gallery: ${savedCount} saved`}>
              <PaneHead icon="grid-outline" title="Gallery" />
              {savedCount > 0 ? (
                <BigNum value={savedCount} unit="자" />
              ) : (
                <Txt style={{ fontSize: 17, fontWeight: '600', marginTop: SP.sm }}>첫 한자를 저장해 보세요</Txt>
              )}
              {fact ? (
                <Txt kind="secondary" style={{ fontSize: 13, lineHeight: 19 }}>
                  {fact}
                </Txt>
              ) : null}
            </Pane>

            <Pane half label={`Study streak: ${streak} days`}>
              <PaneHead icon="flame-outline" title="연속 학습" />
              {streak > 0 ? (
                <BigNum value={streak} unit="일" />
              ) : (
                <Txt style={{ fontSize: 17, fontWeight: '600', marginTop: SP.sm }}>오늘 시작해요</Txt>
              )}
              <StreakGrid today={today} days={activity ?? []} />
              {streak === 0 && (
                <Txt kind="tertiary" style={{ lineHeight: 17 }}>
                  한자를 하나 열어 보면 기록이 시작돼요
                </Txt>
              )}
            </Pane>
          </View>

          {/* Flashcards + search */}
          <View style={{ flexDirection: 'row', gap: SP.md }}>
            {/* TODO(review): navigate to the flashcard review screen once it
                exists (next task). Until then the pane is display-only. */}
            <Pane half label={`Flashcards: ${due} due today`}>
              <PaneHead icon="albums-outline" title="Flashcards" badge={due > 0 ? due : undefined} />
              {due > 0 ? (
                <Txt style={{ fontSize: 16, lineHeight: 23, marginTop: SP.xs }}>
                  오늘 복습할{'\n'}카드 <Txt style={{ fontWeight: '700', fontSize: 16 }}>{due}</Txt>장
                </Txt>
              ) : savedCount > 0 ? (
                <Txt style={{ fontSize: 16, lineHeight: 23, marginTop: SP.xs }}>
                  오늘 복습 완료{'\n'}
                  <Txt kind="secondary" style={{ fontSize: 13 }}>
                    카드 {savedCount}장 · 다음 복습 대기 중
                  </Txt>
                </Txt>
              ) : (
                <Txt kind="secondary" style={{ fontSize: 13, lineHeight: 19, marginTop: SP.xs }}>
                  저장한 한자가 플래시카드가 돼요
                </Txt>
              )}
            </Pane>

            <Pane half onPress={() => router.navigate('/search')} label="Search">
              <PaneHead icon="search-outline" title="Search" />
              <View
                style={{
                  marginTop: SP.xs,
                  paddingHorizontal: SP.md,
                  paddingVertical: SP.sm + 2,
                  borderRadius: RADIUS.sm,
                  borderWidth: 1,
                  borderColor: t.border2,
                  backgroundColor: t.surface2,
                }}>
                <Txt kind="tertiary" numberOfLines={1} style={{ fontSize: 13 }}>
                  한자, 한국어, English…
                </Txt>
              </View>
            </Pane>
          </View>

          {/* Chains — seeded with today's top example word */}
          <Pane
            onPress={() =>
              router.navigate(seedWord ? { pathname: '/chains', params: { word: seedWord.wordKo } } : '/chains')
            }
            label={seedWord ? `Chains: start from ${seedWord.wordKo}` : 'Chains'}>
            <PaneHead icon="git-network-outline" title="Chains" />
            {chainWord ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SP.md, flexWrap: 'wrap' }}>
                <View style={{ flexDirection: 'row', gap: SP.xs }}>
                  {chainWord.syllables.map((s, i) => (
                    <SyllableTile key={i} syllable={s.syllable} hanja={s.hanja} active={s.hanja === hanja} />
                  ))}
                </View>
                <Txt kind="secondary" style={{ flex: 1, minWidth: 140, fontSize: 13, lineHeight: 19 }}>
                  {chainWord.wordKo}에서 출발해 같은 한자를 쓰는 단어로 이어 가기
                </Txt>
                <Ionicons name="arrow-forward" size={16} color={t.accent} />
              </View>
            ) : (
              <Txt kind="secondary" style={{ fontSize: 13 }}>
                단어 → 한자 → 단어로 이어 가기
              </Txt>
            )}
          </Pane>

          {/* Breakdown of today's character. TODO(etymology): the content DB has
              no etymology/history text yet; until it does, show only facts
              derived from real columns rather than invented stories. */}
          {char ? (
            <Pane
              onPress={() => router.push(`/character/${char.hanja}`)}
              label={`Character breakdown for ${char.hanja}`}>
              <PaneHead icon="document-text-outline" title="글자 풀이" />
              <BreakdownLines
                hanja={char.hanja}
                sound={char.primarySound}
                radical={char.radical}
                strokes={char.totalStrokes}
                coreLevel={char.coreLevel}
                readings={char.readings.map((r) => `${r.meaningKo ? `${r.meaningKo} ` : ''}${r.reading}`)}
                wordCount={words?.length ?? 0}
              />
            </Pane>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────

function Pane({
  children,
  onPress,
  half,
  label,
  style,
}: {
  children: ReactNode;
  onPress?: () => void;
  half?: boolean;
  label: string;
  style?: object;
}) {
  const { t } = useTheme();
  const base = {
    flex: half ? 1 : undefined,
    flexBasis: half ? 0 : undefined,
    minWidth: 0,
    padding: SP.lg,
    gap: SP.sm,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: t.border,
    backgroundColor: t.surface,
  };
  // Display-only panes stay plain Views (not disabled buttons) for a11y.
  if (!onPress) {
    return (
      <View accessible accessibilityLabel={label} style={[base, style]}>
        {children}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [base, { opacity: pressed ? 0.7 : 1 }, style]}>
      {children}
    </Pressable>
  );
}

function PaneHead({ icon, title, badge }: { icon: IconName; title: string; badge?: number }) {
  const { t } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: SP.sm }}>
      <Ionicons name={icon} size={17} color={t.accent} />
      <Txt kind="secondary" style={{ flex: 1, fontSize: 14 }} numberOfLines={1}>
        {title}
      </Txt>
      {badge != null && (
        <View
          style={{
            minWidth: 22,
            paddingHorizontal: 7,
            paddingVertical: 2,
            borderRadius: RADIUS.pill,
            backgroundColor: t.accent,
            alignItems: 'center',
          }}>
          <Txt style={{ color: t.bg, fontSize: 12, fontWeight: '700' }}>{badge}</Txt>
        </View>
      )}
    </View>
  );
}

function BigNum({ value, unit }: { value: number; unit: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
      <Txt style={{ fontSize: 38, fontWeight: '700', letterSpacing: 1 }}>{value.toLocaleString()}</Txt>
      <Txt kind="tertiary" style={{ fontSize: 14 }}>
        {unit}
      </Txt>
    </View>
  );
}

// Compact example word: Hangul over its Hanja form (학교 / 學校).
function WordPill({ word, hanja }: { word: string; hanja: string }) {
  const { t } = useTheme();
  return (
    <View
      style={{
        alignItems: 'center',
        paddingHorizontal: SP.md,
        paddingVertical: SP.xs + 2,
        borderRadius: RADIUS.sm,
        borderWidth: 1,
        borderColor: t.border2,
        backgroundColor: t.surface2,
      }}>
      <Txt style={{ fontSize: 15 }}>{word}</Txt>
      <Txt kind="tertiary" style={{ fontSize: 11 }}>
        {hanja}
      </Txt>
    </View>
  );
}

function SyllableTile({ syllable, hanja, active }: { syllable: string; hanja: string; active: boolean }) {
  const { t } = useTheme();
  return (
    <View
      style={{
        alignItems: 'center',
        minWidth: 40,
        paddingVertical: SP.xs,
        borderRadius: RADIUS.sm,
        borderWidth: 1,
        borderColor: active ? t.accent : t.border2,
        backgroundColor: active ? alpha(t.accent, 0.16) : t.surface2,
      }}>
      <Txt style={{ fontSize: 15 }}>{syllable}</Txt>
      <Hanja char={hanja} size={16} color={active ? t.accent : t.text2} />
    </View>
  );
}

// Last STREAK_WEEKS × 7 days ending today, oldest top-left, shaded by how
// much was done that day (views + reviews). Today's cell is outlined.
function StreakGrid({ today, days }: { today: string; days: ActivityDay[] }) {
  const { t } = useTheme();
  const counts = new Map(days.map((d) => [d.day, d.views + d.reviews]));
  const total = STREAK_WEEKS * 7;
  const [y, m, d] = today.split('-').map(Number);
  const keys = Array.from({ length: total }, (_, i) => dayKey(new Date(y, m - 1, d - (total - 1 - i), 12)));
  const shade = (n: number) => (n === 0 ? t.surface3 : alpha(t.accent, n < 3 ? 0.35 : n < 6 ? 0.65 : 1));
  return (
    <View style={{ gap: 4, marginTop: SP.xs }}>
      {Array.from({ length: STREAK_WEEKS }, (_, w) => (
        <View key={w} style={{ flexDirection: 'row', gap: 4 }}>
          {keys.slice(w * 7, w * 7 + 7).map((k) => (
            <View
              key={k}
              style={{
                flex: 1,
                aspectRatio: 1,
                maxWidth: 18,
                borderRadius: 3,
                backgroundColor: shade(counts.get(k) ?? 0),
                borderWidth: k === today ? 1 : 0,
                borderColor: t.text2,
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

// Subject particle 이/가 follows the Hanja's (spoken) reading: 學(학)이, 要(요)가.
const subj = (sound: string) => {
  const code = sound.charCodeAt(sound.length - 1) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0 ? '이' : '가';
};

function BreakdownLines({
  hanja,
  sound,
  radical,
  strokes,
  coreLevel,
  readings,
  wordCount,
}: {
  hanja: string;
  sound: string;
  radical: string | null;
  strokes: number | null;
  coreLevel: 'middle' | 'high' | null;
  readings: string[];
  wordCount: number;
}) {
  const lines = [
    radical && strokes != null && `${hanja}의 부수는 ${radical}, 모두 ${strokes}획으로 써요.`,
    coreLevel && `${coreLevel === 'middle' ? '중학교' : '고등학교'} 교육용 기초 한자예요.`,
    readings.length > 1 && `음이 ${readings.length}가지: ${readings.join(' · ')}`,
    wordCount > 0 &&
      `사전에서 ${hanja}${subj(sound)} 들어간 단어 ${wordCount > WORD_SAMPLE ? `${WORD_SAMPLE}개 이상` : `${wordCount}개`}.`,
  ].filter(Boolean) as string[];
  return (
    <View style={{ gap: SP.xs }}>
      {lines.map((l) => (
        <Txt key={l} kind="secondary" style={{ fontSize: 14, lineHeight: 20 }}>
          {l}
        </Txt>
      ))}
    </View>
  );
}
