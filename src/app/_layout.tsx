import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { attachDatabase, DB_NAME } from '@/data';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';

// Copied from the bundle into the app's documents dir on first launch. DB_NAME
// carries a content hash, so a rebuilt asset gets a fresh copy.
const DB_ASSET = { assetId: require('../../assets/db/hanja.db') };

function RootStack() {
  const { t, scheme } = useTheme();
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: t.bg },
          headerTintColor: t.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: t.bg },
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="character/[hanja]" options={{ title: '', headerBackTitle: 'Back' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SQLiteProvider databaseName={DB_NAME} assetSource={DB_ASSET} onInit={attachDatabase}>
        <ThemeProvider>
          <RootStack />
        </ThemeProvider>
      </SQLiteProvider>
    </GestureHandlerRootView>
  );
}
