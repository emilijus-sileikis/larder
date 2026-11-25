import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { STOCK_LEVELS } from '@/constants/categories';
import { useLarder } from '@/db/LarderContext';
import { STOCK_LEVEL_LABELS } from '@/i18n/translations';
import type { ThemeColors } from '@/theme/colors';
import type { PantryItem, Recipe, StockLevel } from '@/types/larder';
import { hapticLight, hapticSelection, hapticSuccess } from '@/utils/haptics';
import { findMatchingPantryItem } from '@/utils/ingredients';

interface MarkCookedModalProps {
  visible: boolean;
  recipe: Recipe | null;
  onClose: () => void;
  onApplied?: () => void;
}

function MarkCookedContent({
  recipe,
  onClose,
  onApplied,
}: {
  recipe: Recipe;
  onClose: () => void;
  onApplied?: () => void;
}) {
  const { colors, language, t, pantryItems, applyCookedPantryUpdates } = useLarder();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const matchedPantry = useMemo(() => {
    const seen = new Set<number>();
    const list: PantryItem[] = [];
    for (const ing of recipe.ingredients) {
      const m = findMatchingPantryItem(ing.name, pantryItems);
      if (m && !seen.has(m.id)) {
        seen.add(m.id);
        list.push(m);
      }
    }
    return list;
  }, [recipe, pantryItems]);

  const [draftLevels, setDraftLevels] = useState<Record<number, StockLevel>>(() => {
    const init: Record<number, StockLevel> = {};
    for (const p of matchedPantry) {
      init[p.id] = p.stockLevel;
    }
    return init;
  });

  const handleMarkAllLow = () => {
    hapticSelection();
    setDraftLevels((prev) => {
      const next: Record<number, StockLevel> = { ...prev };
      for (const p of matchedPantry) {
        if (next[p.id] === 'in_stock') {
          next[p.id] = 'low';
        }
      }
      return next;
    });
  };

  const handleApply = async () => {
    const updates: { id: number; stockLevel: StockLevel }[] = [];
    for (const p of matchedPantry) {
      const target = draftLevels[p.id];
      if (target && target !== p.stockLevel) {
        updates.push({ id: p.id, stockLevel: target });
      }
    }
    if (updates.length > 0) {
      await applyCookedPantryUpdates(updates);
    }
    hapticSuccess();
    onApplied?.();
    onClose();
  };

  return (
    <View style={[styles.sheet, { paddingTop: Math.max(insets.top, 16) }]}>
      <View style={styles.header}>
        <View style={{ flex: 1, paddingRight: 10 }}>
          <Text style={styles.title}>{t.markCookedTitle}</Text>
          <Text style={styles.subtitle}>{recipe.title}</Text>
        </View>
        <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8}>
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 24) },
        ]}
      >
        <Text style={styles.hint}>{t.markCookedSub}</Text>

        {matchedPantry.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="cube-outline" size={32} color={colors.textMuted} />
            <Text style={styles.emptyText}>{t.markCookedEmpty}</Text>
          </View>
        ) : (
          <>
            <Pressable onPress={handleMarkAllLow} style={styles.quickLowBtn}>
              <Ionicons name="trending-down-outline" size={16} color={colors.warning} />
              <Text style={styles.quickLowText}>{t.markAllLowBtn}</Text>
            </Pressable>

            <View style={styles.card}>
              {matchedPantry.map((item, idx) => {
                const currentLevel = draftLevels[item.id] ?? item.stockLevel;
                return (
                  <View key={item.id}>
                    {idx > 0 ? <View style={styles.divider} /> : null}
                    <View style={styles.row}>
                      <Text style={styles.itemName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <View style={styles.segment}>
                        {STOCK_LEVELS.map((lvl) => {
                          const active = currentLevel === lvl.id;
                          const activeBg =
                            lvl.id === 'in_stock'
                              ? colors.primary
                              : lvl.id === 'low'
                                ? colors.warning
                                : colors.danger;
                          return (
                            <Pressable
                              key={lvl.id}
                              onPress={() => {
                                hapticLight();
                                setDraftLevels((prev) => ({
                                  ...prev,
                                  [item.id]: lvl.id,
                                }));
                              }}
                              style={[
                                styles.pill,
                                active && { backgroundColor: activeBg },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.pillText,
                                  active && { color: colors.white },
                                ]}
                              >
                                {STOCK_LEVEL_LABELS[language][lvl.id]}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}

        <Pressable
          onPress={handleApply}
          style={({ pressed }) => [styles.applyBtn, pressed && { opacity: 0.88 }]}
        >
          <Ionicons name="checkmark-circle-outline" size={19} color={colors.white} />
          <Text style={styles.applyText}>{t.applyPantryUpdatesBtn}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

export function MarkCookedModal({
  visible,
  recipe,
  onClose,
  onApplied,
}: MarkCookedModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      {visible && recipe ? (
        <MarkCookedContent
          key={recipe.id}
          recipe={recipe}
          onClose={onClose}
          onApplied={onApplied}
        />
      ) : null}
    </Modal>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    sheet: {
      flex: 1,
      backgroundColor: c.bg,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    title: {
      fontSize: 20,
      fontWeight: '700',
      color: c.text,
    },
    subtitle: {
      marginTop: 2,
      fontSize: 13,
      color: c.textSecondary,
    },
    closeBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: c.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    content: {
      padding: 20,
    },
    hint: {
      fontSize: 14,
      color: c.textSecondary,
      marginBottom: 14,
    },
    quickLowBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: c.warningSoft,
      marginBottom: 12,
    },
    quickLowText: {
      fontSize: 13,
      fontWeight: '700',
      color: c.warning,
    },
    card: {
      backgroundColor: c.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
    },
    divider: {
      height: 1,
      backgroundColor: c.border,
    },
    row: {
      padding: 13,
      gap: 9,
    },
    itemName: {
      fontSize: 15,
      fontWeight: '700',
      color: c.text,
    },
    segment: {
      flexDirection: 'row',
      backgroundColor: c.surfaceAlt,
      borderRadius: 10,
      padding: 3,
      gap: 3,
    },
    pill: {
      flex: 1,
      paddingVertical: 7,
      borderRadius: 8,
      alignItems: 'center',
    },
    pillText: {
      fontSize: 12,
      fontWeight: '700',
      color: c.textSecondary,
    },
    emptyBox: {
      alignItems: 'center',
      paddingVertical: 32,
      gap: 10,
    },
    emptyText: {
      fontSize: 14,
      color: c.textSecondary,
      textAlign: 'center',
    },
    applyBtn: {
      marginTop: 20,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 14,
      borderRadius: 14,
      backgroundColor: c.primary,
    },
    applyText: {
      fontSize: 15,
      fontWeight: '700',
      color: c.white,
    },
  });
