import React, { useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CookModeModal } from '@/components/CookModeModal';
import { MarkCookedModal } from '@/components/MarkCookedModal';
import { useLarder } from '@/db/LarderContext';
import type { ThemeColors } from '@/theme/colors';
import { hapticSelection, hapticSuccess } from '@/utils/haptics';
import { formatIngredientLine } from '@/utils/ingredients';

const MULTIPLIERS = [0.5, 1, 1.5, 2, 3];

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string | string[] }>();
  const recipeId = Number(Array.isArray(id) ? id[0] : id);
  const {
    colors,
    t,
    recipes,
    recipeMatchMap,
    removeRecipe,
    addMissingRecipeIngredientsToGroceries,
  } = useLarder();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const recipe = useMemo(
    () => recipes.find((r) => r.id === recipeId) ?? null,
    [recipes, recipeId]
  );

  // Target servings can be adjusted directly (-/+) OR via multiplier presets (#10)
  const [targetServingsOverride, setTargetServingsOverride] = useState<number | null>(
    null
  );
  const [cookModeOpen, setCookModeOpen] = useState(false);
  const [markCookedOpen, setMarkCookedOpen] = useState(false);

  if (!recipe) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="arrow-back" size={20} color={colors.text} />
          </Pressable>
        </View>
        <View style={styles.notFound}>
          <Text style={styles.notFoundTitle}>{t.recipeNotFound}</Text>
          <Pressable onPress={() => router.back()} style={styles.primaryBtn}>
            <Text style={styles.primaryBtnText}>{t.goBack}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const baseServings = Math.max(1, recipe.servings);
  const targetServings = targetServingsOverride ?? baseServings;
  const multiplier = targetServings / baseServings;
  const displayServings = Math.round(targetServings * 10) / 10;

  const match = recipeMatchMap[recipe.id];
  const missingCount = match
    ? match.totalCount - match.onHandCount
    : recipe.ingredients.length;

  const handleAddMissing = async () => {
    const res = await addMissingRecipeIngredientsToGroceries(recipe, multiplier);
    hapticSuccess();
    if (res.added === 0 && res.merged === 0) {
      Alert.alert(t.allSetTitle, t.allSetMsg);
      return;
    }
    Alert.alert(
      t.addedToGroceriesTitle,
      t.addedSummary(res.added, res.merged, res.skippedInPantry),
      [
        { text: t.ok, style: 'cancel' },
        { text: t.openGroceries, onPress: () => router.navigate('/(tabs)') },
      ]
    );
  };

  const handleDelete = () => {
    Alert.alert(t.deleteRecipeTitle, t.deleteRecipeMsg(recipe.title), [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.deleteLabel,
        style: 'destructive',
        onPress: async () => {
          await removeRecipe(recipe.id);
          router.back();
        },
      },
    ]);
  };

  const handleOpenSource = async () => {
    if (!recipe.sourceUrl) return;
    try {
      await Linking.openURL(recipe.sourceUrl);
    } catch {
      // Ignore malformed url
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => router.back()}
          style={styles.iconBtn}
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </Pressable>
        <View style={styles.topActions}>
          <Pressable
            onPress={() => {
              hapticSelection();
              setMarkCookedOpen(true);
            }}
            style={styles.cookedChip}
          >
            <Ionicons name="checkmark-done-outline" size={16} color={colors.primaryText} />
            <Text style={styles.cookedChipText}>{t.markCookedBtn}</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              hapticSelection();
              router.push(`/recipe/editor?id=${recipe.id}`);
            }}
            style={styles.iconBtn}
            accessibilityLabel="Edit recipe"
          >
            <Ionicons name="pencil-outline" size={19} color={colors.text} />
          </Pressable>
          <Pressable
            onPress={handleDelete}
            style={styles.iconBtn}
            accessibilityLabel="Delete recipe"
          >
            <Ionicons name="trash-outline" size={19} color={colors.danger} />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {recipe.photoUri ? (
          <Image source={{ uri: recipe.photoUri }} style={styles.heroPhoto} />
        ) : null}

        <Text style={styles.title}>{recipe.title}</Text>
        {recipe.description ? (
          <Text style={styles.description}>{recipe.description}</Text>
        ) : null}

        {recipe.sourceUrl ? (
          <Pressable onPress={handleOpenSource} style={styles.sourceLink}>
            <Ionicons name="open-outline" size={14} color={colors.primary} />
            <Text style={styles.sourceLinkText} numberOfLines={1}>
              {t.openSourceBtn}
            </Text>
          </Pressable>
        ) : null}

        {/* Meta pills */}
        <View style={styles.metaRow}>
          <View style={styles.metaPill}>
            <Ionicons name="timer-outline" size={14} color={colors.primary} />
            <Text style={styles.metaText}>{t.prepLabel(recipe.prepMinutes)}</Text>
          </View>
          <View style={styles.metaPill}>
            <Ionicons name="flame-outline" size={14} color={colors.accent} />
            <Text style={styles.metaText}>{t.cookLabel(recipe.cookMinutes)}</Text>
          </View>
          <View style={styles.metaPill}>
            <Ionicons name="people-outline" size={14} color={colors.textSecondary} />
            <Text style={styles.metaText}>{t.servingsWord(displayServings)}</Text>
          </View>
        </View>

        {recipe.tags.length > 0 ? (
          <View style={styles.tagsRow}>
            {recipe.tags.map((tagItem) => (
              <View key={tagItem} style={styles.tagBadge}>
                <Text style={styles.tagText}>{tagItem}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Primary Action Buttons */}
        <View style={styles.actionRow}>
          <Pressable
            onPress={() => {
              hapticSelection();
              setCookModeOpen(true);
            }}
            style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.88 }]}
          >
            <Ionicons name="restaurant-outline" size={18} color={colors.white} />
            <Text style={styles.primaryBtnText}>{t.cookModeBtn}</Text>
          </Pressable>

          <Pressable
            onPress={handleAddMissing}
            style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.85 }]}
          >
            <Ionicons name="cart-outline" size={18} color={colors.accentText} />
            <Text style={styles.secondaryBtnText}>{t.addMissingBtn(missingCount)}</Text>
          </Pressable>
        </View>

        {/* Ingredients + Exact Servings Stepper (#10) + Multiplier Presets */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.sectionTitle}>{t.ingredientsHeading}</Text>
            {match && match.totalCount > 0 ? (
              <Text style={styles.matchInline}>
                {t.inPantryShort(match.onHandCount, match.totalCount)}
              </Text>
            ) : null}
          </View>

          <View style={styles.servingsControlRow}>
            <Text style={styles.servingsLabel}>{t.targetServingsLabel}</Text>
            <View style={styles.stepper}>
              <Pressable
                onPress={() => {
                  hapticSelection();
                  setTargetServingsOverride(Math.max(1, Math.round(targetServings) - 1));
                }}
                style={styles.stepBtn}
              >
                <Ionicons name="remove" size={17} color={colors.text} />
              </Pressable>
              <Text style={styles.servingsValue}>{displayServings}</Text>
              <Pressable
                onPress={() => {
                  hapticSelection();
                  setTargetServingsOverride(Math.min(30, Math.round(targetServings) + 1));
                }}
                style={styles.stepBtn}
              >
                <Ionicons name="add" size={17} color={colors.text} />
              </Pressable>
            </View>
          </View>

          <View style={styles.multiplierBar}>
            {MULTIPLIERS.map((m) => {
              const active = Math.abs(multiplier - m) < 0.01;
              return (
                <Pressable
                  key={m}
                  onPress={() => {
                    hapticSelection();
                    setTargetServingsOverride(Math.round(baseServings * m * 10) / 10);
                  }}
                  style={[styles.multPill, active && styles.multPillActive]}
                >
                  <Text style={[styles.multText, active && styles.multTextActive]}>
                    {m}x
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.ingList}>
            {recipe.ingredients.map((ing, idx) => {
              const status = match?.ingredientStatus[ing.id] ?? 'missing';
              const scaledQty =
                ing.quantity !== null ? ing.quantity * multiplier : null;
              const statusColor =
                status === 'in_stock'
                  ? colors.primary
                  : status === 'low'
                    ? colors.warning
                    : colors.borderStrong;
              const statusLabel =
                status === 'in_stock'
                  ? t.statusInStock
                  : status === 'low'
                    ? t.statusLow
                    : t.statusNeed;

              return (
                <View key={ing.id}>
                  {idx > 0 ? <View style={styles.rowDivider} /> : null}
                  <View style={styles.ingRow}>
                    <Ionicons
                      name={
                        status === 'in_stock'
                          ? 'checkmark-circle'
                          : status === 'low'
                            ? 'alert-circle'
                            : 'ellipse-outline'
                      }
                      size={18}
                      color={statusColor}
                    />
                    <Text style={styles.ingText}>
                      {formatIngredientLine(ing.name, scaledQty, ing.unit)}
                    </Text>
                    <Text
                      style={[
                        styles.statusTag,
                        { color: status === 'missing' ? colors.textMuted : statusColor },
                      ]}
                    >
                      {statusLabel}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* Instructions */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t.instructionsHeading}</Text>
          {recipe.steps.length === 0 ? (
            <Text style={styles.emptySteps}>{t.noInstructionsYet}</Text>
          ) : (
            <View style={styles.stepsWrap}>
              {recipe.steps.map((step, idx) => (
                <View key={idx} style={styles.stepRow}>
                  <View style={styles.stepNumCircle}>
                    <Text style={styles.stepNumText}>{idx + 1}</Text>
                  </View>
                  <Text style={styles.stepBody}>{step}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <CookModeModal
        visible={cookModeOpen}
        recipe={recipe}
        scaleMultiplier={multiplier}
        onClose={() => setCookModeOpen(false)}
        onMarkCooked={() => setMarkCookedOpen(true)}
      />
      <MarkCookedModal
        visible={markCookedOpen}
        recipe={recipe}
        onClose={() => setMarkCookedOpen(false)}
      />
    </SafeAreaView>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: c.bg,
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    topActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    cookedChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      height: 40,
      paddingHorizontal: 12,
      borderRadius: 12,
      backgroundColor: c.primarySoft,
    },
    cookedChipText: {
      fontSize: 13,
      fontWeight: '700',
      color: c.primaryText,
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
    content: {
      paddingHorizontal: 18,
      paddingBottom: 36,
    },
    heroPhoto: {
      width: '100%',
      height: 210,
      borderRadius: 18,
      marginBottom: 16,
      backgroundColor: c.surfaceAlt,
    },
    title: {
      fontSize: 26,
      fontWeight: '700',
      color: c.text,
      letterSpacing: -0.4,
    },
    description: {
      marginTop: 6,
      fontSize: 15,
      lineHeight: 22,
      color: c.textSecondary,
    },
    sourceLink: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 6,
      marginTop: 10,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: c.primarySoft,
    },
    sourceLinkText: {
      fontSize: 12,
      fontWeight: '700',
      color: c.primaryText,
    },
    metaRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 14,
    },
    metaPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 11,
      paddingVertical: 6,
      borderRadius: 10,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    metaText: {
      fontSize: 13,
      fontWeight: '600',
      color: c.text,
    },
    tagsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 10,
    },
    tagBadge: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: c.surfaceAlt,
    },
    tagText: {
      fontSize: 12,
      fontWeight: '600',
      color: c.textSecondary,
    },
    actionRow: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 18,
      marginBottom: 18,
    },
    primaryBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      paddingVertical: 13,
      borderRadius: 14,
      backgroundColor: c.primary,
    },
    primaryBtnText: {
      fontSize: 15,
      fontWeight: '700',
      color: c.white,
    },
    secondaryBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      paddingVertical: 13,
      borderRadius: 14,
      backgroundColor: c.accentSoft,
    },
    secondaryBtnText: {
      fontSize: 14,
      fontWeight: '700',
      color: c.accentText,
    },
    card: {
      backgroundColor: c.surface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: c.border,
      padding: 16,
      marginBottom: 16,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    sectionTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: c.text,
    },
    matchInline: {
      fontSize: 12,
      fontWeight: '700',
      color: c.primaryText,
    },
    servingsControlRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    servingsLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: c.textSecondary,
    },
    stepper: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    stepBtn: {
      width: 32,
      height: 32,
      borderRadius: 9,
      backgroundColor: c.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    servingsValue: {
      fontSize: 15,
      fontWeight: '700',
      color: c.text,
      minWidth: 26,
      textAlign: 'center',
    },
    multiplierBar: {
      flexDirection: 'row',
      gap: 6,
      marginBottom: 14,
    },
    multPill: {
      flex: 1,
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: c.surfaceAlt,
      alignItems: 'center',
    },
    multPillActive: {
      backgroundColor: c.primary,
    },
    multText: {
      fontSize: 13,
      fontWeight: '700',
      color: c.textSecondary,
    },
    multTextActive: {
      color: c.white,
    },
    ingList: {
      gap: 2,
    },
    rowDivider: {
      height: 1,
      backgroundColor: c.border,
    },
    ingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 11,
    },
    ingText: {
      flex: 1,
      fontSize: 15,
      color: c.text,
    },
    statusTag: {
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    stepsWrap: {
      marginTop: 12,
      gap: 14,
    },
    stepRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    stepNumCircle: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 1,
    },
    stepNumText: {
      fontSize: 13,
      fontWeight: '700',
      color: c.primaryText,
    },
    stepBody: {
      flex: 1,
      fontSize: 15,
      lineHeight: 22,
      color: c.text,
    },
    emptySteps: {
      marginTop: 8,
      fontSize: 14,
      color: c.textMuted,
    },
    notFound: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 14,
      padding: 24,
    },
    notFoundTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: c.text,
    },
  });
