import React, { useMemo, useState } from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLarder } from '@/db/LarderContext';
import type { ThemeColors } from '@/theme/colors';
import { hapticMedium } from '@/utils/haptics';

interface SwipeableRowProps {
  children: React.ReactNode;
  onDelete: () => void;
  deleteLabel?: string;
}

const SWIPE_THRESHOLD = -86;

export function SwipeableRow({
  children,
  onDelete,
  deleteLabel,
}: SwipeableRowProps) {
  const { colors, t } = useLarder();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [translateX] = useState(() => new Animated.Value(0));

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_evt, gesture) =>
          gesture.dx < -14 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.6,
        onPanResponderMove: (_evt, gesture) => {
          translateX.setValue(Math.min(0, Math.max(gesture.dx, -135)));
        },
        onPanResponderRelease: (_evt, gesture) => {
          if (gesture.dx <= SWIPE_THRESHOLD) {
            hapticMedium();
            Animated.timing(translateX, {
              toValue: -360,
              duration: 160,
              useNativeDriver: true,
            }).start(() => {
              onDelete();
            });
          } else {
            Animated.spring(translateX, {
              toValue: 0,
              useNativeDriver: true,
              bounciness: 6,
            }).start();
          }
        },
        onPanResponderTerminate: () => {
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        },
      }),
    [translateX, onDelete]
  );

  return (
    <View style={styles.container}>
      <View style={styles.deleteBackdrop}>
        <Ionicons name="trash-outline" size={18} color={colors.white} />
        <Text style={styles.deleteText}>{deleteLabel ?? t.deleteLabel}</Text>
      </View>
      <Animated.View
        style={[styles.foreground, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      position: 'relative',
      overflow: 'hidden',
      backgroundColor: c.surface,
    },
    deleteBackdrop: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backgroundColor: c.danger,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      paddingRight: 20,
      gap: 6,
    },
    deleteText: {
      fontSize: 13,
      fontWeight: '700',
      color: c.white,
    },
    foreground: {
      backgroundColor: c.surface,
    },
  });
