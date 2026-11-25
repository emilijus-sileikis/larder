import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLarder } from '@/db/LarderContext';
import type { ThemeColors } from '@/theme/colors';
import type { IoniconName } from '@/types/larder';

interface EmptyStateProps {
  icon: IoniconName;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  const { colors } = useLarder();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <View style={styles.iconCircle}>
        <Ionicons name={icon} size={30} color={colors.primary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          style={({ pressed }) => [styles.button, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.buttonText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 28,
      paddingVertical: 42,
    },
    iconCircle: {
      width: 64,
      height: 64,
      borderRadius: 20,
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      color: c.text,
      textAlign: 'center',
    },
    description: {
      marginTop: 6,
      fontSize: 14,
      lineHeight: 20,
      color: c.textSecondary,
      textAlign: 'center',
    },
    button: {
      marginTop: 18,
      paddingHorizontal: 18,
      paddingVertical: 11,
      borderRadius: 12,
      backgroundColor: c.primary,
    },
    buttonText: {
      fontSize: 14,
      fontWeight: '700',
      color: c.white,
    },
  });
