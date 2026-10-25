// Bundled serif: subsets of Noto Serif CJK KR (the design Google Fonts ships as
// "Noto Serif KR"), built by scripts/build-font-subset.py. Loaded at runtime with
// useFonts (works in Expo Go and on web; the config plugin needs a dev build).
import { isLoaded } from 'expo-font';
import { Platform, type TextStyle } from 'react-native';

export const FONT_ASSETS = {
  NotoSerifKR: require('../../assets/fonts/NotoSerifKR-Regular.otf'),
  'NotoSerifKR-Bold': require('../../assets/fonts/NotoSerifKR-Bold.otf'),
};

type FontName = keyof typeof FONT_ASSETS;

const SYSTEM_SERIF = Platform.select({ ios: 'ui-serif', android: 'serif', default: 'serif' });

// fontFamily for a bundled face, or the system serif if it failed to load. On web
// the system serif stays in the stack as a per-glyph fallback (native platforms
// fall back per glyph on their own).
export function serif(name: FontName = 'NotoSerifKR'): string {
  if (!isLoaded(name)) return SYSTEM_SERIF;
  return Platform.OS === 'web' ? `${name}, ${SYSTEM_SERIF}` : name;
}

// Bold display style. The bundled Bold face is its own family, so the weight
// stays 400 (otherwise Android/web embolden it a second time); without it, fall
// back to the system font's bold.
export function serifBold(): Pick<TextStyle, 'fontFamily' | 'fontWeight'> {
  return isLoaded('NotoSerifKR-Bold')
    ? { fontFamily: serif('NotoSerifKR-Bold'), fontWeight: '400' }
    : { fontWeight: '700' };
}
