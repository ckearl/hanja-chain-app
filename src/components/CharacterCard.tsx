import { Pressable, View } from 'react-native';

import { Chip, Hanja, Pill, Txt } from '@/components/ui';
import { type Compound, type HanjaChar } from '@/data';
import { FONT, SP } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';

// A card showing a character + its top example compounds. Shared by Search and
// Gallery. `compounds` is optional so callers can render without examples.
export function CharacterCard({
  char,
  compounds = [],
  onPress,
  compact,
}: {
  char: HanjaChar;
  compounds?: Compound[];
  onPress?: () => void;
  compact?: boolean;
}) {
  const { t } = useTheme();
  const shown = compounds.slice(0, 4);
  const more = Math.max(0, compounds.length - shown.length);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        gap: SP.lg,
        padding: SP.lg,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: t.border,
        backgroundColor: t.surface,
        opacity: pressed ? 0.7 : 1,
      })}>
      <Hanja char={char.hanja} size={compact ? FONT.hanjaSm : FONT.hanjaMd} style={{ width: compact ? 40 : 56 }} />

      <View style={{ flex: 1, gap: SP.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: SP.sm, flexWrap: 'wrap' }}>
          <Txt kind="body" style={{ fontSize: 16 }}>
            {char.meaningKo} {char.primarySound}
          </Txt>
          {char.level ? <Chip label={char.level} /> : null}
        </View>
        {char.meaningEn ? <Txt kind="secondary">{char.meaningEn}</Txt> : null}

        {shown.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SP.sm, marginTop: 2 }}>
            {shown.map((c) => (
              <Pill key={c.id} label={c.wordKo} />
            ))}
            {more > 0 ? (
              <View style={{ justifyContent: 'center' }}>
                <Txt kind="tertiary">+{more} more</Txt>
              </View>
            ) : null}
          </View>
        )}
      </View>
    </Pressable>
  );
}
