// ── Chains — the traversal tree ─────────────────────────────────────────
// Each node is a word shown as syllable↔Hanja columns. Tapping a column
// branches out to other words sharing that Hanja; tapping a column on one of
// those hops further. The active path is accented and mirrored in the
// breadcrumb; everything off the path stays visible but dimmed. Stepping back
// (back button / breadcrumb) prunes the branches below the new end of the chain.
//
// Entry points: /chains (default seed), /chains?word=학교, /chains?hanja=學
// (or ?word=學 — an all-Hanja param is treated as a character).

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Hanja, Txt } from '@/components/ui';
import { data, isHanja, type ChainWord, type HanjaChar } from '@/data';
import { useQuery } from '@/hooks/useQuery';
import { alpha, RADIUS, SP } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';

const DEFAULT_SEED = '낙관적';
const PAGE = 12; // neighbors revealed per "more" tap (lists can run to ~400)
const INDENT = 18;

// One word in the tree. `expanded` is the syllable column whose Hanja branched
// out; `neighbors` is the full ranked list, `shown` how many are rendered, and
// `children` the nodes for those shown (kept so sub-branches survive "more").
type ChainNode = {
  word: ChainWord;
  expanded: number | null;
  neighbors: ChainWord[] | null; // null while loading
  shown: number;
  children: ChainNode[];
};

const leaf = (word: ChainWord): ChainNode => ({ word, expanded: null, neighbors: null, shown: 0, children: [] });

type Path = number[]; // child indexes from the root

// Immutable update of the node at `path`.
function updateAt(node: ChainNode, path: Path, fn: (n: ChainNode) => ChainNode): ChainNode {
  if (!path.length) return fn(node);
  const [i, ...rest] = path;
  const children = node.children.slice();
  children[i] = updateAt(children[i], rest, fn);
  return { ...node, children };
}

function nodeAt(node: ChainNode, path: Path): ChainNode | undefined {
  let n: ChainNode | undefined = node;
  for (const i of path) n = n?.children[i];
  return n;
}

const samePath = (a: Path, b: Path) => a.length === b.length && a.every((v, i) => v === b[i]);
const isPrefix = (p: Path, of: Path) => p.length <= of.length && p.every((v, i) => v === of[i]);

const collapsed = (n: ChainNode): ChainNode => ({ ...n, expanded: null, neighbors: null, shown: 0, children: [] });

// A seed resolved from route params: the root word, plus which column to open.
type Seed = { word: ChainWord; open: number | null; note?: string };

// Last resort when even the default seed can't be loaded (keeps the screen usable).
const FALLBACK_SEED: ChainWord = {
  wordKo: DEFAULT_SEED,
  hanjaForm: '樂觀的',
  syllables: [
    { syllable: '낙', hanja: '樂' },
    { syllable: '관', hanja: '觀' },
    { syllable: '적', hanja: '的' },
  ],
};

// Route params can arrive as arrays (?word=a&word=b) — take the first.
const firstParam = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v);

async function resolveSeed(word?: string, hanja?: string): Promise<Seed | undefined> {
  const raw = (hanja ?? word ?? '').trim();
  const asHanja = raw && [...raw].every(isHanja) ? [...raw][0] : undefined;
  if (asHanja) {
    // Start from the top-ranked word using this Hanja, opened on it.
    const [top] = await data.chainNeighbors(asHanja);
    if (top) return { word: top, open: top.syllables.findIndex((s) => s.hanja === asHanja) };
    const fallback = await data.toChainWord(DEFAULT_SEED);
    return fallback && { word: fallback, open: null, note: `No words found for ${asHanja}.` };
  }
  if (raw) {
    const w = await data.toChainWord(raw);
    if (w && w.syllables.length) return { word: w, open: null };
    const fallback = await data.toChainWord(DEFAULT_SEED);
    return fallback && { word: fallback, open: null, note: `“${raw}” isn't a Hanja word in the dataset.` };
  }
  const w = await data.toChainWord(DEFAULT_SEED);
  return w && { word: w, open: null };
}

export default function ChainsScreen() {
  const { t } = useTheme();
  const router = useRouter();
  const rawParams = useLocalSearchParams<{ word?: string | string[]; hanja?: string | string[] }>();
  const params = { word: firstParam(rawParams.word), hanja: firstParam(rawParams.hanja) };

  const [root, setRoot] = useState<ChainNode>();
  const [active, setActive] = useState<Path>([]);
  const [note, setNote] = useState<string>();
  const [draft, setDraft] = useState('');
  const loadSeq = useRef(0); // drops seed/neighbor loads made stale by a newer reseed

  const expand = useCallback((path: Path, col: number, word: ChainWord) => {
    const hanja = word.syllables[col]?.hanja;
    if (!hanja) return;
    const seq = loadSeq.current;
    setActive(path);
    setRoot((r) => r && updateAt(r, path, (n) => ({ ...collapsed(n), expanded: col })));
    data
      .chainNeighbors(hanja, word.wordKo)
      .then((neighbors) => {
        if (seq !== loadSeq.current) return;
        setRoot((r) => {
          if (!r) return r;
          const n = nodeAt(r, path);
          // Ignore if the user moved on to another column meanwhile.
          if (!n || n.expanded !== col || n.word !== word) return r;
          const shown = Math.min(PAGE, neighbors.length);
          return updateAt(r, path, (x) => ({ ...x, neighbors, shown, children: neighbors.slice(0, shown).map(leaf) }));
        });
      })
      .catch((err) => console.error('[chains]', err));
  }, []);

  const start = useCallback(
    async (word?: string, hanja?: string) => {
      const seq = ++loadSeq.current;
      let seed: Seed | undefined;
      try {
        seed = await resolveSeed(word, hanja);
      } catch (err) {
        console.error('[chains]', err);
      }
      if (seq !== loadSeq.current) return; // a newer reseed won
      seed ??= { word: FALLBACK_SEED, open: null, note: "Couldn't load that chain — starting from the default word." };
      setNote(seed.note);
      setActive([]);
      setRoot(leaf(seed.word));
      if (seed.open != null && seed.open >= 0) expand([], seed.open, seed.word);
    },
    [expand],
  );

  // (Re)seed whenever the route params change, e.g. a link from Detail/Search.
  useEffect(() => {
    start(params.word, params.hanja);
  }, [params.word, params.hanja, start]);

  const onTapColumn = (path: Path, col: number, node: ChainNode) => {
    if (node.expanded === col) {
      // Tapping the open column folds that branch; the chain ends here.
      setRoot((r) => r && updateAt(r, path, collapsed));
      setActive(path);
    } else {
      expand(path, col, node.word);
    }
  };

  // Step back to `path` (a prefix of the active path): the hop out of it is
  // undone — the next word along the chain folds up — but `path`'s own branch
  // stays open so its siblings remain visible to pick a different hop.
  const stepTo = (path: Path) => {
    const next = active.slice(0, path.length + 1);
    setRoot((r) => r && updateAt(r, next, collapsed));
    setActive(path);
  };
  const stepBack = () => {
    if (active.length) stepTo(active.slice(0, -1));
    else if (root?.expanded != null) setRoot((r) => r && collapsed(r));
  };

  const showMore = (path: Path) =>
    setRoot(
      (r) =>
        r &&
        updateAt(r, path, (n) => {
          if (!n.neighbors) return n;
          const shown = Math.min(n.shown + PAGE, n.neighbors.length);
          return { ...n, shown, children: [...n.children, ...n.neighbors.slice(n.shown, shown).map(leaf)] };
        }),
    );

  const reset = () => {
    setDraft('');
    if (params.word || params.hanja) router.setParams({ word: undefined, hanja: undefined });
    else start();
  };

  const submitDraft = () => {
    const q = draft.trim();
    if (!q) return;
    setDraft('');
    // Same word as the current params → setParams is a no-op, so reseed directly.
    if (q === params.word && !params.hanja) start(q);
    else router.setParams({ word: q, hanja: undefined });
  };

  // Breadcrumb: the words along the active path.
  const trail: { word: ChainWord; path: Path }[] = [];
  if (root) {
    let n: ChainNode | undefined = root;
    trail.push({ word: root.word, path: [] });
    active.forEach((idx, depth) => {
      n = n?.children[idx];
      if (n) trail.push({ word: n.word, path: active.slice(0, depth + 1) });
    });
  }
  const canStepBack = active.length > 0 || root?.expanded != null;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ paddingHorizontal: SP.lg, paddingTop: SP.sm, gap: SP.md }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Txt kind="title">체인</Txt>
          <Pressable
            onPress={reset}
            accessibilityRole="button"
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: SP.xs,
              paddingHorizontal: SP.md,
              paddingVertical: 7,
              borderRadius: RADIUS.pill,
              borderWidth: 1,
              borderColor: t.border2,
              opacity: pressed ? 0.6 : 1,
            })}>
            <Ionicons name="add" size={16} color={t.text} />
            <Txt style={{ fontSize: 13 }}>새 체인</Txt>
          </Pressable>
        </View>

        {/* Start from any word */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: SP.sm,
            paddingHorizontal: SP.md,
            height: 40,
            borderRadius: RADIUS.md,
            borderWidth: 1,
            borderColor: t.border,
            backgroundColor: t.surface,
          }}>
          <Ionicons name="git-branch-outline" size={16} color={t.text3} />
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={submitDraft}
            placeholder="Start from a word or 漢字…"
            placeholderTextColor={t.text3}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            style={{ flex: 1, color: t.text, fontSize: 15 }}
          />
          {draft.trim().length > 0 && (
            <Pressable onPress={submitDraft} hitSlop={8} accessibilityLabel="Start chain">
              <Ionicons name="arrow-forward-circle" size={20} color={t.accent} />
            </Pressable>
          )}
        </View>

        {/* Breadcrumb + step back */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SP.sm }}>
          <Pressable
            onPress={stepBack}
            disabled={!canStepBack}
            hitSlop={8}
            accessibilityLabel="Step back"
            style={{ opacity: canStepBack ? 1 : 0.3 }}>
            <Ionicons name="arrow-undo-outline" size={18} color={t.text2} />
          </Pressable>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ alignItems: 'center' }}>
            {trail.map((c, i) => {
              const last = i === trail.length - 1;
              return (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {i > 0 && <Ionicons name="chevron-forward" size={12} color={t.text3} style={{ marginHorizontal: 4 }} />}
                  <Pressable onPress={() => !last && stepTo(c.path)} disabled={last} hitSlop={6}>
                    <Txt style={{ fontSize: 13, color: last ? t.accent : t.text2, fontWeight: last ? '600' : '400' }}>
                      {c.word.wordKo}
                    </Txt>
                  </Pressable>
                </View>
              );
            })}
          </ScrollView>
        </View>

        {note ? <Txt kind="tertiary">{note}</Txt> : null}
      </View>

      {!root ? (
        <View style={{ paddingTop: SP.xxl, alignItems: 'center' }}>
          <ActivityIndicator color={t.text3} />
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: SP.lg, paddingBottom: SP.xxl * 2 }}>
          {/* Deep chains get wide — let the tree scroll sideways. */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View>
              <TreeNode
                node={root}
                path={[]}
                active={active}
                onTapColumn={onTapColumn}
                onSelect={setActive}
                onMore={showMore}
                onOpenHanja={(h) => router.push(`/character/${h}`)}
              />
            </View>
          </ScrollView>
          {root.expanded == null && (
            <Txt kind="tertiary" style={{ marginTop: SP.lg, textAlign: 'center' }}>
              음절을 눌러 같은 한자를 쓰는 단어로 가지를 뻗어보세요{'\n'}Tap a syllable to branch out to words sharing its Hanja
            </Txt>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

type TreeHandlers = {
  active: Path;
  onTapColumn: (path: Path, col: number, node: ChainNode) => void;
  onSelect: (path: Path) => void;
  onMore: (path: Path) => void;
  onOpenHanja: (hanja: string) => void;
};

function TreeNode({ node, path, ...h }: { node: ChainNode; path: Path } & TreeHandlers) {
  const { t } = useTheme();
  const onPath = isPrefix(path, h.active);
  const isEnd = samePath(path, h.active);
  const open = node.expanded != null ? node.word.syllables[node.expanded] : undefined;

  return (
    <View>
      <WordNode
        word={node.word}
        expandedCol={node.expanded}
        onPath={onPath}
        isEnd={isEnd}
        onTapColumn={(col) => h.onTapColumn(path, col, node)}
        onSelect={() => h.onSelect(path)}
      />

      {open && (
        <View style={{ marginLeft: INDENT, paddingLeft: SP.md, borderLeftWidth: 1, borderColor: onPath ? alpha(t.accent, 0.5) : t.border, marginTop: SP.sm, gap: SP.sm }}>
          <BranchHeader key={open.hanja} hanja={open.hanja} count={node.neighbors?.length} dim={!onPath} onOpen={() => h.onOpenHanja(open.hanja)} />
          {node.neighbors == null ? (
            <ActivityIndicator color={t.text3} style={{ alignSelf: 'flex-start' }} />
          ) : node.neighbors.length === 0 ? (
            <Txt kind="tertiary">No other words use {open.hanja} yet.</Txt>
          ) : (
            <>
              {node.children.map((c, i) => (
                <TreeNode key={`${c.word.wordKo}|${c.word.hanjaForm}|${i}`} node={c} path={[...path, i]} {...h} />
              ))}
              {node.shown < node.neighbors.length && (
                <Pressable
                  onPress={() => h.onMore(path)}
                  style={({ pressed }) => ({ paddingVertical: SP.xs, opacity: pressed ? 0.6 : 1 })}>
                  <Txt style={{ fontSize: 13, color: t.accent }}>
                    {moreLabel(node.neighbors.length - node.shown)}
                  </Txt>
                </Pressable>
              )}
            </>
          )}
        </View>
      )}
    </View>
  );
}

const moreLabel = (left: number) => (left > PAGE ? `더 보기 · ${PAGE} more of ${left}` : `더 보기 · ${left} more`);

// "學 배울 학 · 238 words  [detail ›]" — labels a branch and links to the character.
function BranchHeader({ hanja, count, dim, onOpen }: { hanja: string; count?: number; dim: boolean; onOpen: () => void }) {
  const { t } = useTheme();
  const { data: char } = useQuery<HanjaChar | undefined>(() => data.getCharacter(hanja), [hanja]);
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="link"
      accessibilityLabel={`Open ${hanja} details`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: SP.sm,
        alignSelf: 'flex-start',
        paddingVertical: 2,
        opacity: pressed ? 0.6 : dim ? 0.55 : 1,
      })}>
      <Hanja char={hanja} size={16} color={t.accent} />
      <Txt kind="tertiary">
        {char ? `${char.meaningKo ?? ''} ${char.primarySound}`.trim() : ''}
        {count != null ? ` · ${count} word${count === 1 ? '' : 's'}` : ''}
      </Txt>
      <Ionicons name="open-outline" size={13} color={t.text3} />
    </Pressable>
  );
}

// A word as tappable syllable columns (한글 over 漢字).
function WordNode({
  word,
  expandedCol,
  onPath,
  isEnd,
  onTapColumn,
  onSelect,
}: {
  word: ChainWord;
  expandedCol: number | null;
  onPath: boolean;
  isEnd: boolean;
  onTapColumn: (col: number) => void;
  onSelect: () => void;
}) {
  const { t } = useTheme();
  // Show the full word when the columns don't spell it — non-Hanja parts
  // (일일이 = 一一이) or forms whose syllables couldn't be aligned.
  const spelled = word.syllables.map((s) => s.syllable).join('');
  const showWord = spelled !== word.wordKo.replace(/\s/g, '');
  const dim = !onPath;

  return (
    <Pressable
      onPress={onSelect}
      style={{
        alignSelf: 'flex-start',
        padding: SP.xs,
        borderRadius: RADIUS.md,
        borderWidth: 1,
        borderColor: isEnd ? t.accent : onPath ? alpha(t.accent, 0.4) : t.border,
        backgroundColor: onPath ? t.surface2 : t.surface,
        opacity: dim ? 0.6 : 1,
      }}>
      {showWord && (
        <Txt kind="tertiary" style={{ paddingHorizontal: SP.sm, paddingTop: 2 }}>
          {word.wordKo}
          {word.hanjaForm !== word.syllables.map((s) => s.hanja).join('') ? `  ${word.hanjaForm.split('/')[0]}` : ''}
        </Txt>
      )}
      <View style={{ flexDirection: 'row' }}>
        {word.syllables.map((s, i) => {
          const on = expandedCol === i;
          return (
            <Pressable
              key={i}
              onPress={() => onTapColumn(i)}
              accessibilityLabel={`${s.syllable || s.hanja} ${s.hanja}`}
              style={({ pressed }) => ({
                alignItems: 'center',
                minWidth: 34,
                paddingHorizontal: SP.xs,
                paddingVertical: SP.xs,
                borderRadius: RADIUS.sm,
                backgroundColor: on ? alpha(t.accent, 0.18) : pressed ? t.surface3 : 'transparent',
              })}>
              <Txt style={{ fontSize: 17, fontWeight: '600', color: on ? t.accent : s.syllable ? t.text : t.text3 }}>
                {s.syllable || '·'}
              </Txt>
              <Hanja char={s.hanja} size={14} color={on ? t.accent : t.text2} />
            </Pressable>
          );
        })}
      </View>
    </Pressable>
  );
}
