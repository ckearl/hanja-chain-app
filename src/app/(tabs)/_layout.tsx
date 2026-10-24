import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { type ColorValue } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

type IconName = keyof typeof Ionicons.glyphMap;

function icon(name: IconName) {
  // RN 0.88 widened ColorValue (null | number); @expo/vector-icons still types color as
  // string | OpaqueColorValue. Our tint colors are always hex strings.
  return ({ color, size }: { color: ColorValue; size: number }) => (
    <Ionicons name={name} color={color as string} size={size} />
  );
}

export default function TabsLayout() {
  const { t } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: t.bg },
        headerTitleStyle: { color: t.text },
        headerShadowVisible: false,
        tabBarStyle: { backgroundColor: t.surface, borderTopColor: t.border },
        tabBarActiveTintColor: t.accent,
        tabBarInactiveTintColor: t.text3,
      }}>
      <Tabs.Screen name="index" options={{ title: 'Daily', tabBarIcon: icon('today-outline') }} />
      <Tabs.Screen name="gallery" options={{ title: 'Gallery', tabBarIcon: icon('grid-outline') }} />
      <Tabs.Screen name="search" options={{ title: 'Search', tabBarIcon: icon('search-outline') }} />
      <Tabs.Screen name="chains" options={{ title: 'Chains', tabBarIcon: icon('git-network-outline') }} />
    </Tabs>
  );
}
