import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LarderProvider, useLarder } from '@/db/LarderContext';

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
    <SafeAreaProvider>
      <LarderProvider>
        <AppShell />
      </LarderProvider>
    </SafeAreaProvider>
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
