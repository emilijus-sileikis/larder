import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { router, Stack } from 'expo-router';
import { ShareIntentProvider, useShareIntentContext } from 'expo-share-intent';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LarderProvider, useLarder } from '@/db/LarderContext';

const isExpoGo = Constants.appOwnership === 'expo';

function extractUrlFromText(text: string): string | undefined {
  const match = text.match(/https?:\/\/[^\s"'<>]+/i);
  return match ? match[0] : undefined;
}

function ShareIntentBridge() {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  const { setSharedRecipePayload } = useLarder();

  useEffect(() => {
    if (!hasShareIntent) return;
    const rawUrl = shareIntent.webUrl ?? (shareIntent.text ? extractUrlFromText(shareIntent.text) : undefined);
    const rawText = shareIntent.text?.trim() || undefined;

    if (rawUrl || rawText) {
      setSharedRecipePayload({
        url: rawUrl,
        text: rawUrl ? undefined : rawText,
      });
      router.replace('/(tabs)/recipes');
    }
    resetShareIntent();
  }, [hasShareIntent, shareIntent, resetShareIntent, setSharedRecipePayload]);

  return null;
}

function AppShell() {
  const { ready, error, resolvedTheme, colors, t } = useLarder();

  if (!ready) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <StatusBar style={resolvedTheme === 'dark' ? 'light' : 'dark'} />
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
          {t.openingLarder}
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg, padding: 24 }]}>
        <StatusBar style={resolvedTheme === 'dark' ? 'light' : 'dark'} />
        <Text style={[styles.errorTitle, { color: colors.danger }]}>
          {t.dbErrorTitle}
        </Text>
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
          {error}
        </Text>
      </View>
    );
  }

  return (
    <>
      <ShareIntentBridge />
      <StatusBar style={resolvedTheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="recipe/[id]" />
        <Stack.Screen
          name="recipe/editor"
          options={{ presentation: 'modal' }}
        />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <ShareIntentProvider options={{ disabled: isExpoGo, resetOnBackground: true }}>
      <SafeAreaProvider>
        <LarderProvider>
          <AppShell />
        </LarderProvider>
      </SafeAreaProvider>
    </ShareIntentProvider>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
    textAlign: 'center',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
});
