import { getShareExtensionKey } from 'expo-share-intent';

/**
 * Redirects incoming Android Share Intent deep links straight to /(tabs)/recipes
 * so Expo Router never flashes an "Unmatched Route" screen.
 */
export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}) {
  try {
    if (
      path.includes(`dataUrl=${getShareExtensionKey()}`) ||
      path.includes('dataUrl=')
    ) {
      return '/(tabs)/recipes';
    }
    return path;
  } catch {
    return '/';
  }
}
