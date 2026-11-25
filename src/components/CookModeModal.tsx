import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLarder } from '@/db/LarderContext';
import type { ThemeColors } from '@/theme/colors';
import type { Recipe } from '@/types/larder';
import { hapticLight, hapticSelection, hapticSuccess } from '@/utils/haptics';
import { formatIngredientLine } from '@/utils/ingredients';

interface CookModeModalProps {
  visible: boolean;
  recipe: Recipe;
  scaleMultiplier: number;
  onClose: () => void;
  onMarkCooked?: () => void;
}

function CookModeContent({
  recipe,
  scaleMultiplier,
  onClose,
  onMarkCooked,
}: {
  recipe: Recipe;
  scaleMultiplier: number;
  onClose: () => void;
  onMarkCooked?: () => void;
}) {
  useKeepAwake('larder-cook-mode');
  const { colors, t } = useLarder();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [completedSteps, setCompletedSteps] = useState<Record<number, boolean>>({});
  const [showIngredients, setShowIngredients] = useState(false);

  const completedCount = Object.values(completedSteps).filter(Boolean).length;
  const totalSteps = recipe.steps.length;
  const progressPct = totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0;

  const toggleStep = (idx: number) => {
    setCompletedSteps((prev) => {
      const nextVal = !prev[idx];
      const next = { ...prev, [idx]: nextVal };
      const done = Object.values(next).filter(Boolean).length;
      if (nextVal && done === totalSteps && totalSteps > 0) {
        hapticSuccess();
      } else {
        hapticLight();
      }
      return next;
    });
  };

  return (
    <View style={[styles.root, { paddingTop: Math.max(insets.top, 16) }]}>
      <View style={styles.header}>
        <View style={{ flex: 1, paddingRight: 10 }}>
          <View style={styles.awakeBadge}>
            <Ionicons name="sunny" size={12} color={colors.primary} />
            <Text style={styles.awakeText}>{t.cookModeAwake}</Text>
          </View>
          <Text style={styles.title} numberOfLines={2}>
            {recipe.title}
          </Text>
        </View>
        <Pressable
          onPress={onClose}
          style={styles.closeBtn}
          accessibilityLabel="Exit cook mode"
        >
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>
      </View>

      {/* Progress bar */}
      <View style={styles.progressWrap}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
        </View>
        <Text style={styles.progressLabel}>
          {t.stepsProgress(completedCount, totalSteps)}
        </Text>
      </View>

      {/* Collapsible scaled ingredients drawer */}
      <Pressable
        onPress={() => {
          hapticSelection();
          setShowIngredients((v) => !v);
        }}
        style={styles.ingredientsToggle}
      >
        <View style={styles.ingredientsToggleLeft}>
          <Ionicons name="list-outline" size={18} color={colors.accent} />
          <Text style={styles.ingredientsToggleText}>
            {t.cookIngredientsHeader(
              Math.round(recipe.servings * scaleMultiplier * 10) / 10
            )}
          </Text>
        </View>
        <Ionicons
          name={showIngredients ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={colors.textSecondary}
        />
      </Pressable>

      {showIngredients ? (
        <View style={styles.ingredientsDrawer}>
          {recipe.ingredients.map((ing) => {
            const scaledQty =
              ing.quantity !== null ? ing.quantity * scaleMultiplier : null;
            return (
              <Text key={ing.id} style={styles.ingredientItem}>
                • {formatIngredientLine(ing.name, scaledQty, ing.unit)}
              </Text>
            );
          })}
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={[
          styles.stepsList,
          { paddingBottom: Math.max(insets.bottom, 28) },
        ]}
      >
        {recipe.steps.length === 0 ? (
          <Text style={styles.emptyText}>{t.noStepsListed}</Text>
        ) : (
          recipe.steps.map((step, idx) => {
            const done = Boolean(completedSteps[idx]);
            return (
              <Pressable
                key={idx}
                onPress={() => toggleStep(idx)}
                style={[styles.stepCard, done && styles.stepCardDone]}
              >
                <View style={[styles.stepBadge, done && styles.stepBadgeDone]}>
                  {done ? (
                    <Ionicons name="checkmark" size={18} color={colors.white} />
                  ) : (
                    <Text style={styles.stepNum}>{idx + 1}</Text>
                  )}
                </View>
                <Text style={[styles.stepText, done && styles.stepTextDone]}>
                  {step}
                </Text>
              </Pressable>
            );
          })
        )}

        {totalSteps > 0 && completedCount === totalSteps ? (
          <View style={styles.doneBanner}>
            <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
            <Text style={styles.doneBannerText}>{t.allStepsComplete}</Text>
          </View>
        ) : null}

        {onMarkCooked ? (
          <Pressable
            onPress={() => {
              hapticSuccess();
              onClose();
              onMarkCooked();
            }}
            style={({ pressed }) => [styles.cookedBtn, pressed && { opacity: 0.88 }]}
          >
            <Ionicons name="cube-outline" size={18} color={colors.white} />
            <Text style={styles.cookedBtnText}>{t.finishAndUpdatePantry}</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

export function CookModeModal({
  visible,
  recipe,
  scaleMultiplier,
  onClose,
  onMarkCooked,
}: CookModeModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      {visible ? (
        <CookModeContent
          key={`${recipe.id}-${scaleMultiplier}`}
          recipe={recipe}
          scaleMultiplier={scaleMultiplier}
          onClose={onClose}
          onMarkCooked={onMarkCooked}
        />
      ) : null}
    </Modal>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: c.bg,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingBottom: 12,
    },
    awakeBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 5,
      backgroundColor: c.primarySoft,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      marginBottom: 6,
    },
    awakeText: {
      fontSize: 12,
      fontWeight: '700',
      color: c.primaryText,
    },
    title: {
      fontSize: 22,
      fontWeight: '700',
      color: c.text,
    },
    closeBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    progressWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 20,
      paddingBottom: 12,
    },
    progressTrack: {
      flex: 1,
      height: 6,
      borderRadius: 3,
      backgroundColor: c.surfaceAlt,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      borderRadius: 3,
      backgroundColor: c.primary,
    },
    progressLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: c.textSecondary,
    },
    ingredientsToggle: {
      marginHorizontal: 20,
      marginBottom: 10,
      paddingHorizontal: 14,
      paddingVertical: 11,
      borderRadius: 12,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    ingredientsToggleLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    ingredientsToggleText: {
      fontSize: 14,
      fontWeight: '600',
      color: c.text,
    },
    ingredientsDrawer: {
      marginHorizontal: 20,
      marginBottom: 12,
      padding: 14,
      borderRadius: 12,
      backgroundColor: c.surfaceAlt,
      gap: 6,
    },
    ingredientItem: {
      fontSize: 14,
      color: c.text,
      lineHeight: 20,
    },
    stepsList: {
      paddingHorizontal: 20,
      paddingTop: 4,
      gap: 12,
    },
    stepCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 14,
      padding: 18,
      borderRadius: 16,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    stepCardDone: {
      backgroundColor: c.primarySoft,
      borderColor: c.primary,
    },
    stepBadge: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: c.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },
    stepBadgeDone: {
      backgroundColor: c.primary,
    },
    stepNum: {
      fontSize: 14,
      fontWeight: '700',
      color: c.text,
    },
    stepText: {
      flex: 1,
      fontSize: 17,
      lineHeight: 25,
      color: c.text,
    },
    stepTextDone: {
      textDecorationLine: 'line-through',
      color: c.textSecondary,
    },
    doneBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      padding: 16,
      borderRadius: 14,
      backgroundColor: c.primarySoft,
      marginTop: 6,
    },
    doneBannerText: {
      fontSize: 15,
      fontWeight: '700',
      color: c.primaryText,
    },
    cookedBtn: {
      marginTop: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 14,
      borderRadius: 14,
      backgroundColor: c.primary,
    },
    cookedBtnText: {
      fontSize: 15,
      fontWeight: '700',
      color: c.white,
    },
    emptyText: {
      textAlign: 'center',
      color: c.textSecondary,
      marginTop: 32,
      fontSize: 15,
    },
  });
