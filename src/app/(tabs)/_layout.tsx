import React, { useMemo } from 'react';
import { Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLarder } from '@/db/LarderContext';
import { isExpiringSoon } from '@/utils/dates';

export default function TabsLayout() {
  const { colors, t, groceryItems, pantryItems } = useLarder();
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, Platform.OS === 'android' ? 10 : 12);

  const uncheckedCount = useMemo(
    () => groceryItems.filter((g) => !g.checked).length,
    [groceryItems]
  );

  const expiringCount = useMemo(
    () =>
      pantryItems.filter(
        (p) => p.stockLevel !== 'out' && isExpiringSoon(p.expiresAt, 3)
      ).length,
    [pantryItems]
  );

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 58 + bottomPad,
          paddingBottom: bottomPad,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
        tabBarBadgeStyle: {
          backgroundColor: colors.accent,
          color: colors.white,
          fontSize: 10,
          fontWeight: '700',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t.tabGroceries,
          tabBarBadge: uncheckedCount > 0 ? uncheckedCount : undefined,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'cart' : 'cart-outline'}
              size={size}
              color={typeof color === 'string' ? color : colors.textMuted}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="recipes"
        options={{
          title: t.tabRecipes,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'book' : 'book-outline'}
              size={size}
              color={typeof color === 'string' ? color : colors.textMuted}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="meal-plan"
        options={{
          title: t.tabMealPlan,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'calendar' : 'calendar-outline'}
              size={size}
              color={typeof color === 'string' ? color : colors.textMuted}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="pantry"
        options={{
          title: t.tabPantry,
          tabBarBadge: expiringCount > 0 ? expiringCount : undefined,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'cube' : 'cube-outline'}
              size={size}
              color={typeof color === 'string' ? color : colors.textMuted}
            />
          ),
        }}
      />
    </Tabs>
  );
}
