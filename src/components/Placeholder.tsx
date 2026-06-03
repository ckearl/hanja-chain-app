import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Txt } from '@/components/ui';
import { SP } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';

// Temporary stub for tabs not yet in the vertical slice.
export function Placeholder({ title, note }: { title: string; note?: string }) {
  const { t } = useTheme();
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: SP.sm, padding: SP.xl }}>
        <Txt kind="title">{title}</Txt>
        <Txt kind="secondary" style={{ textAlign: 'center' }}>
          {note ?? 'Coming next.'}
        </Txt>
      </View>
    </SafeAreaView>
  );
}
