import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLarder } from '@/db/LarderContext';
import type { ThemeColors } from '@/theme/colors';
import { hapticSelection } from '@/utils/haptics';

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  onOpenSettings: () => void;
  rightSlot?: React.ReactNode;
}

export function AppHeader({
  title,
  subtitle,
  onOpenSettings,
  rightSlot,
}: AppHeaderProps) {
  const { colors } = useLarder();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <View style={styles.titleBlock}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={styles.actions}>
        {rightSlot}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open settings"
          onPress={() => {
            hapticSelection();
            onOpenSettings();
          }}
          style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
          hitSlop={8}
        >
          <Ionicons name="settings-outline" size={20} color={colors.textSecondary} />
        </Pressable>
      </View>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 18,
      paddingTop: 10,
      paddingBottom: 12,
    },
    titleBlock: {
      flex: 1,
      paddingRight: 12,
    },
    title: {
      fontSize: 28,
      fontWeight: '700',
      color: c.text,
      letterSpacing: -0.5,
    },
    subtitle: {
      marginTop: 2,
      fontSize: 13,
      color: c.textSecondary,
    },
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    iconBtn: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressed: {
      opacity: 0.72,
    },
  });
