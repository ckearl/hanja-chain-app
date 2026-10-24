// ── Review — SM-2 flashcard session ─────────────────────────────────────
// The due queue is snapshotted once at session start (later saves don't
// join mid-session). Front: the glyph alone; tap to reveal reading, meaning,
// English and a few example words. Grading writes through user.review()
// immediately, so Daily's due count drops live. A card graded 다시 (< 3) is
// re-queued at the end of this session — it is also due again tomorrow, per
// SM-2 — and the session ends when the queue is empty.
//
// Button → SM-2 grade: 다시 = 1 (forgot), 어려움 = 3, 좋음 = 4, 쉬움 = 5.
// Each button previews the interval it would schedule (pure, no write).

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Hanja, Surface, Txt } from '@/components/ui';
import { data, type Grade, previewSchedule, type SrsCard, user } from '@/data';
import { useQuery } from '@/hooks/useQuery';
import { alpha, FONT, RADIUS, SP } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';

const SESSION_LIMIT = 100; // most-overdue first
const EXAMPLE_COUNT = 3;
const MAX_W = 560;

const BUTTONS: { label: string; grade: Grade }[] = [
  { label: '다시', grade: 1 },
  { label: '어려움', grade: 3 },
  { label: '좋음', grade: 4 },
  { label: '쉬움', grade: 5 },
];

const intervalLabel = (days: number) =>
  days <= 1 ? '내일' : days < 30 ? `${days}일` : days < 365 ? `${Math.round(days / 30)}개월` : `${(days / 365).toFixed(1)}년`;

type Tally = { cards: number; reviews: number; again: number };

export default function ReviewScreen() {
  const { t } = useTheme();
  const [queue, setQueue] = useState<SrsCard[]>();
  const [total, setTotal] = useState(0);
  const [done, setDone] = useState(0); // cards passed this session
  const [tally, setTally] = useState<Tally>({ cards: 0, reviews: 0, again: 0 });
  const [revealed, setRevealed] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const busy = useRef(false); // sync guard: a double-tap must not grade twice
  const failed = useRef(new Set<string>());

  // Snapshot the due queue once.
  useEffect(() => {
    let alive = true;
    user
      .dueCards(SESSION_LIMIT)
      .then((cards) => {
        if (!alive) return;
        setQueue(cards);
        setTotal(cards.length);
      })
      .catch((err) => {
        console.error('[dueCards]', err);
        if (alive) {
          setLoadError(true);
          setQueue([]);
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  const card = queue?.[0];

  async function grade(g: Grade) {
    if (!card || busy.current) return;
    busy.current = true;
    try {
      const next = await user.review(card.hanja, g);
      const pass = g >= 3;
      const firstFail = !pass && !failed.current.has(card.hanja);
      if (!pass) failed.current.add(card.hanja);
      setTally((s) => ({
        cards: s.cards + (pass ? 1 : 0),
        reviews: s.reviews + 1,
        again: s.again + (firstFail ? 1 : 0),
      }));
      if (pass) setDone((n) => n + 1);
      setQueue((q) => (q ? [...q.slice(1), ...(pass ? [] : [next])] : q));
      setRevealed(false);
    } catch (err) {
      console.error('[review]', err);
    } finally {
      busy.current = false;
    }
  }

  if (!queue) return <View style={{ flex: 1, backgroundColor: t.bg }} />;
  if (loadError) return <LoadErrorState />;
  if (total === 0) return <EmptyState />;
  if (!card) return <Summary tally={tally} />;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ padding: SP.lg, flexGrow: 1 }}>
      <View style={{ width: '100%', maxWidth: MAX_W, alignSelf: 'center', gap: SP.lg, flexGrow: 1 }}>
        <Progress done={done} total={total} />
        {/* keyed so a new card never shows the previous card's back while loading */}
        <Card key={card.hanja} card={card} revealed={revealed} onReveal={() => setRevealed(true)} />
        {revealed ? (
          <View style={{ flexDirection: 'row', gap: SP.sm }}>
            {BUTTONS.map((b) => (
              <GradeButton
                key={b.grade}
                label={b.label}
                sub={intervalLabel(previewSchedule(card, b.grade).interval)}
                again={b.grade < 3}
                onPress={() => grade(b.grade)}
              />
            ))}
          </View>
        ) : (
          <Pressable
            onPress={() => setRevealed(true)}
            accessibilityRole="button"
            style={({ pressed }) => ({
              paddingVertical: SP.md + 2,
              borderRadius: RADIUS.md,
              backgroundColor: t.accent,
              alignItems: 'center',
              opacity: pressed ? 0.7 : 1,
            })}>
            <Txt style={{ color: t.bg, fontWeight: '700' }}>정답 보기</Txt>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────

function Progress({ done, total }: { done: number; total: number }) {
  const { t } = useTheme();
  return (
    <View style={{ gap: SP.xs }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Txt kind="label">진행</Txt>
        <Txt kind="secondary" accessibilityLabel={`${done} of ${total} cards done`}>
          {done} / {total}
        </Txt>
      </View>
      <View style={{ height: 4, borderRadius: RADIUS.pill, backgroundColor: t.surface3, overflow: 'hidden' }}>
        <View style={{ height: 4, width: `${(done / total) * 100}%`, backgroundColor: t.accent }} />
      </View>
    </View>
  );
}

function Card({ card, revealed, onReveal }: { card: SrsCard; revealed: boolean; onReveal: () => void }) {
  const { t } = useTheme();
  const { data: char } = useQuery(() => data.getCharacter(card.hanja), [card.hanja]);
  const { data: words } = useQuery(() => data.compoundsForChar(card.hanja, EXAMPLE_COUNT), [card.hanja]);
  return (
    <Pressable
      onPress={onReveal}
      disabled={revealed}
      accessibilityRole="button"
      accessibilityLabel={revealed ? undefined : `Flashcard ${card.hanja}. Tap to reveal`}
      style={{
        flexGrow: 1,
        minHeight: 320,
        alignItems: 'center',
        justifyContent: 'center',
        padding: SP.xl,
        gap: SP.sm,
        borderRadius: RADIUS.lg,
        borderWidth: 1,
        borderColor: t.border,
        backgroundColor: t.surface,
      }}>
      <Hanja char={card.hanja} size={FONT.hanjaHero} />
      {!revealed ? (
        <Txt kind="tertiary" style={{ marginTop: SP.lg }}>
          탭하여 뜻과 음 보기
        </Txt>
      ) : char ? (
        <>
          <Txt style={{ fontSize: 22, marginTop: SP.sm, letterSpacing: 2 }}>
            {char.meaningKo ? `${char.meaningKo} ` : ''}
            {char.primarySound}
          </Txt>
          {char.meaningEn ? (
            <Txt kind="secondary" style={{ textAlign: 'center' }}>
              {char.meaningEn}
            </Txt>
          ) : null}
          {words && words.length > 0 ? (
            <View style={{ alignSelf: 'stretch', gap: SP.xs, marginTop: SP.lg }}>
              {words.map((w) => (
                <View
                  key={w.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'baseline',
                    gap: SP.sm,
                    paddingHorizontal: SP.md,
                    paddingVertical: SP.sm,
                    borderRadius: RADIUS.sm,
                    backgroundColor: t.surface2,
                  }}>
                  <Txt style={{ fontSize: 16 }}>{w.wordKo}</Txt>
                  <Txt kind="tertiary" style={{ fontSize: 13 }}>
                    {w.hanjaForm}
                  </Txt>
                  {w.englishGloss ? (
                    <Txt kind="secondary" numberOfLines={1} style={{ flex: 1, fontSize: 13, textAlign: 'right' }}>
                      {w.englishGloss}
                    </Txt>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}
        </>
      ) : null}
    </Pressable>
  );
}

function GradeButton({
  label,
  sub,
  again,
  onPress,
}: {
  label: string;
  sub: string;
  again: boolean;
  onPress: () => void;
}) {
  const { t } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}, next review ${sub}`}
      style={({ pressed }) => ({
        flex: 1,
        alignItems: 'center',
        gap: 2,
        paddingVertical: SP.md,
        borderRadius: RADIUS.md,
        borderWidth: 1,
        borderColor: again ? t.border2 : alpha(t.accent, 0.5),
        backgroundColor: again ? t.surface2 : alpha(t.accent, 0.14),
        opacity: pressed ? 0.6 : 1,
      })}>
      <Txt style={{ fontSize: 15, fontWeight: '600', color: again ? t.text : t.accent }}>{label}</Txt>
      <Txt kind="tertiary">{sub}</Txt>
    </Pressable>
  );
}

function Summary({ tally }: { tally: Tally }) {
  const router = useRouter();
  const rows = [
    { label: '복습한 카드', value: `${tally.cards}장` },
    { label: '다시 본 카드', value: `${tally.again}장` },
    { label: '총 채점', value: `${tally.reviews}회` },
  ];
  return (
    <Centered icon="checkmark-circle-outline" title="오늘 복습 완료" note={tally.again ? '다시 고른 카드는 내일 다시 나와요.' : '모든 카드를 기억했어요.'}>
      <Surface style={{ alignSelf: 'stretch', padding: SP.lg, gap: SP.sm }}>
        {rows.map((r) => (
          <View key={r.label} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Txt kind="secondary">{r.label}</Txt>
            <Txt style={{ fontWeight: '600' }}>{r.value}</Txt>
          </View>
        ))}
      </Surface>
      <ActionButton label="홈으로" primary onPress={() => (router.canGoBack() ? router.back() : router.navigate('/'))} />
    </Centered>
  );
}

function EmptyState() {
  const router = useRouter();
  return (
    <Centered
      icon="albums-outline"
      title="오늘 복습할 카드가 없어요"
      note="한자를 저장하면 플래시카드가 돼요. 갤러리나 검색에서 한자를 열고 저장해 보세요.">
      <View style={{ flexDirection: 'row', gap: SP.sm, alignSelf: 'stretch' }}>
        <ActionButton label="Gallery" onPress={() => router.navigate('/gallery')} />
        <ActionButton label="Search" onPress={() => router.navigate('/search')} />
      </View>
    </Centered>
  );
}

function LoadErrorState() {
  const router = useRouter();
  return (
    <Centered
      icon="alert-circle-outline"
      title="카드를 불러오지 못했어요"
      note="잠시 후 다시 시도해 주세요.">
      <ActionButton label="Back" onPress={() => router.back()} />
    </Centered>
  );
}

function Centered({
  icon,
  title,
  note,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  note: string;
  children: ReactNode;
}) {
  const { t } = useTheme();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: SP.lg }}>
      <View style={{ width: '100%', maxWidth: MAX_W / 1.4, alignSelf: 'center', alignItems: 'center', gap: SP.md }}>
        <Ionicons name={icon} size={44} color={t.accent} />
        <Txt style={{ fontSize: 20, fontWeight: '700' }}>{title}</Txt>
        <Txt kind="secondary" style={{ textAlign: 'center', lineHeight: 20, marginBottom: SP.sm }}>
          {note}
        </Txt>
        {children}
      </View>
    </ScrollView>
  );
}

function ActionButton({ label, primary, onPress }: { label: string; primary?: boolean; onPress: () => void }) {
  const { t } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flex: primary ? undefined : 1,
        alignSelf: primary ? 'stretch' : undefined,
        alignItems: 'center',
        paddingVertical: SP.md,
        borderRadius: RADIUS.md,
        borderWidth: primary ? 0 : 1,
        borderColor: t.border2,
        backgroundColor: primary ? t.accent : t.surface2,
        opacity: pressed ? 0.7 : 1,
      })}>
      <Txt style={{ fontWeight: '600', color: primary ? t.bg : t.text }}>{label}</Txt>
    </Pressable>
  );
}
