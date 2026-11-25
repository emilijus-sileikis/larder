import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLarder } from '@/db/LarderContext';
import type { ThemeColors } from '@/theme/colors';
import { hapticSelection } from '@/utils/haptics';

interface UndoSnackbarProps {
  message: string | null;
  onUndo?: () => void;
  bottomOffset?: number;
}

export function UndoSnackbar({
  message,
  onUndo,
  bottomOffset = 14,
}: UndoSnackbarProps) {
  const { colors, t } = useLarder();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (!message) return null;

  return (
    <View style={[styles.wrap, { bottom: bottomOffset }]}>
      <Ionicons name="information-circle" size={18} color={colors.white} />
      <Text style={styles.text} numberOfLines={1}>
        {message}
      </Text>
      {onUndo ? (
        <Pressable
          onPress={() => {
            hapticSelection();
            onUndo();
          }}
          style={styles.undoBtn}
          hitSlop={8}
        >
          <Text style={styles.undoText}>{t.undoBtn}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    wrap: {
      position: 'absolute',
      left: 16,
      right: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: '#23201C',
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 14,
      shadowColor: c.shadow,
      shadowOpacity: 0.24,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
      elevation: 6,
    },
    text: {
      flex: 1,
      fontSize: 13,
      fontWeight: '600',
      color: '#FFFFFF',
    },
    undoBtn: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 8,
      backgroundColor: c.primary,
    },
    undoText: {
      fontSize: 13,
      fontWeight: '700',
      color: '#FFFFFF',
    },
  });
