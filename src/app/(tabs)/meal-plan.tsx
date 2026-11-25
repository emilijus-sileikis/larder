import React, { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '@/components/AppHeader';
import { EmptyState } from '@/components/EmptyState';
import { MarkCookedModal } from '@/components/MarkCookedModal';
import { RecipePickerModal } from '@/components/RecipePickerModal';
import { SettingsModal } from '@/components/SettingsModal';
import { useLarder } from '@/db/LarderContext';
import { MEAL_SLOT_LABELS } from '@/i18n/translations';
import type { ThemeColors } from '@/theme/colors';
import type { MealPlanEntry, MealSlot, Recipe } from '@/types/larder';
import {
  formatWeekRange,
  getDayLabel,
  getWeekStartIso,
  shiftWeekIso,
} from '@/utils/dates';
import { hapticLight, hapticSelection, hapticSuccess } from '@/utils/haptics';

const DAY_INDICES = [0, 1, 2, 3, 4, 5, 6];

export default function MealPlanScreen() {
  const {
    colors,
    language,
    t,
    recipes,
    mealPlanEntries,
    addMealPlanEntry,
    setMealPlanServings,
    removeMealPlanEntry,
    clearWeekMealPlan,
    generateGroceriesForWeek,
  } = useLarder();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const currentWeekStart = useMemo(() => getWeekStartIso(), []);
  const [weekStart, setWeekStart] = useState(currentWeekStart);
  const [excludePantry, setExcludePantry] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [cookedRecipe, setCookedRecipe] = useState<Recipe | null>(null);

  const [pickerTarget, setPickerTarget] = useState<{
    dayIndex: number;
    heading: string;
  } | null>(null);

  const recipeById = useMemo(
    () => new Map(recipes.map((r) => [r.id, r])),
    [recipes]
  );

  const weekEntries = useMemo(
    () => mealPlanEntries.filter((e) => e.weekStart === weekStart),
    [mealPlanEntries, weekStart]
  );

  const queueEntries = useMemo(
    () => weekEntries.filter((e) => e.dayIndex === -1),
    [weekEntries]
  );

  const entriesByDay = useMemo(() => {
    const map = new Map<number, MealPlanEntry[]>();
    for (const entry of weekEntries) {
      if (entry.dayIndex < 0) continue;
      const list = map.get(entry.dayIndex) ?? [];
      list.push(entry);
      map.set(entry.dayIndex, list);
    }
    return map;
  }, [weekEntries]);

  const handlePickRecipe = async (
    recipe: Recipe,
    servings: number,
    mealSlot: MealSlot
  ) => {
    if (!pickerTarget) return;
    await addMealPlanEntry({
      weekStart,
      dayIndex: pickerTarget.dayIndex,
      mealSlot,
      recipeId: recipe.id,
      servings,
    });
  };

  const handleGenerateGroceries = async () => {
    if (weekEntries.length === 0) {
      Alert.alert(t.noMealsPlannedTitle, t.noMealsPlannedMsg);
      return;
    }

    const res = await generateGroceriesForWeek(weekStart, excludePantry);
    hapticSuccess();

    const summary =
      res.added === 0 && res.merged === 0
        ? t.groceryListAllInPantry
        : t.addedSummary(res.added, res.merged, res.skippedInPantry);

    Alert.alert(t.groceryListUpdatedTitle, summary, [
      { text: t.stayHere, style: 'cancel' },
      { text: t.viewGroceries, onPress: () => router.navigate('/(tabs)') },
    ]);
  };

  const handleClearWeek = () => {
    if (weekEntries.length === 0) return;
    Alert.alert(
      t.clearWeekTitle,
      t.clearWeekMsg(weekEntries.length, formatWeekRange(weekStart, language)),
      [
        { text: t.cancel, style: 'cancel' },
        {
          text: t.clearWeekConfirm,
          style: 'destructive',
          onPress: async () => {
            await clearWeekMealPlan(weekStart);
            hapticLight();
          },
        },
      ]
    );
  };

  const renderEntryCard = (entry: MealPlanEntry) => {
    const recipe = recipeById.get(entry.recipeId);
    if (!recipe) return null;

    return (
      <View key={entry.id} style={styles.mealCard}>
        <Pressable
          onPress={() => {
            hapticSelection();
            router.push(`/recipe/${recipe.id}`);
          }}
          style={{ flex: 1 }}
        >
          <View style={styles.mealTop}>
            <View style={styles.slotBadge}>
              <Text style={styles.slotBadgeText}>
                {MEAL_SLOT_LABELS[language][entry.mealSlot]}
              </Text>
            </View>
            <Text style={styles.mealTime}>
              {t.minutesShort(recipe.prepMinutes + recipe.cookMinutes)}
            </Text>
          </View>
          <Text style={styles.mealTitle} numberOfLines={2}>
            {recipe.title}
          </Text>
        </Pressable>

        <View style={styles.mealRight}>
          <View style={styles.miniStepper}>
            <Pressable
              onPress={() => {
                hapticSelection();
                setMealPlanServings(entry.id, Math.max(1, entry.servings - 1));
              }}
              style={styles.miniStepBtn}
              hitSlop={6}
            >
              <Ionicons name="remove" size={14} color={colors.text} />
            </Pressable>
            <Text style={styles.miniStepVal}>{entry.servings}s</Text>
            <Pressable
              onPress={() => {
                hapticSelection();
                setMealPlanServings(entry.id, Math.min(20, entry.servings + 1));
              }}
              style={styles.miniStepBtn}
              hitSlop={6}
            >
              <Ionicons name="add" size={14} color={colors.text} />
            </Pressable>
          </View>

          <Pressable
            onPress={() => {
              hapticSelection();
              setCookedRecipe(recipe);
            }}
            style={styles.cookedIconBtn}
            hitSlop={6}
            accessibilityLabel={t.markCookedBtn}
          >
            <Ionicons name="checkmark-done-outline" size={16} color={colors.primary} />
          </Pressable>

          <Pressable
            onPress={() => {
              hapticLight();
              removeMealPlanEntry(entry.id);
            }}
            style={styles.removeBtn}
            hitSlop={8}
            accessibilityLabel={`Remove ${recipe.title}`}
          >
            <Ionicons name="close" size={17} color={colors.textMuted} />
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AppHeader
        title={t.mealPlanTitle}
        subtitle={t.mealPlanSubtitle(weekEntries.length)}
        onOpenSettings={() => setSettingsOpen(true)}
        rightSlot={
          weekEntries.length > 0 ? (
            <Pressable
              onPress={handleClearWeek}
              style={styles.clearWeekBtn}
              hitSlop={6}
            >
              <Text style={styles.clearWeekText}>{t.clear}</Text>
            </Pressable>
          ) : null
        }
      />

      {/* Week switcher */}
      <View style={styles.weekBar}>
        <Pressable
          onPress={() => {
            hapticSelection();
            setWeekStart((w) => shiftWeekIso(w, -1));
          }}
          style={styles.weekArrow}
          accessibilityLabel="Previous week"
        >
          <Ionicons name="chevron-back" size={18} color={colors.text} />
        </Pressable>

        <View style={styles.weekCenter}>
          <Text style={styles.weekRange}>{formatWeekRange(weekStart, language)}</Text>
          {weekStart !== currentWeekStart ? (
            <Pressable
              onPress={() => {
                hapticSelection();
                setWeekStart(currentWeekStart);
              }}
            >
              <Text style={styles.jumpToday}>{t.backToThisWeek}</Text>
            </Pressable>
          ) : (
            <Text style={styles.weekSub}>{t.thisWeek}</Text>
          )}
        </View>

        <Pressable
          onPress={() => {
            hapticSelection();
            setWeekStart((w) => shiftWeekIso(w, 1));
          }}
          style={styles.weekArrow}
          accessibilityLabel="Next week"
        >
          <Ionicons name="chevron-forward" size={18} color={colors.text} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Generate Grocery List card */}
        <View style={styles.generateCard}>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={styles.toggleTitle}>{t.skipPantryTitle}</Text>
              <Text style={styles.toggleDesc}>{t.skipPantryDesc}</Text>
            </View>
            <Switch
              value={excludePantry}
              onValueChange={(v) => {
                hapticSelection();
                setExcludePantry(v);
              }}
              trackColor={{ false: colors.borderStrong, true: colors.primary }}
              thumbColor={colors.white}
            />
          </View>

          <Pressable
            onPress={handleGenerateGroceries}
            style={({ pressed }) => [
              styles.generateBtn,
              weekEntries.length === 0 && { opacity: 0.55 },
              pressed && { opacity: 0.88 },
            ]}
          >
            <Ionicons name="cart-outline" size={19} color={colors.white} />
            <Text style={styles.generateBtnText}>
              {t.generateGroceriesBtn(weekEntries.length)}
            </Text>
          </Pressable>
        </View>

        {recipes.length === 0 ? (
          <EmptyState
            icon="calendar-outline"
            title={t.noRecipesPlanTitle}
            description={t.noRecipesPlanDesc}
            actionLabel={t.createRecipeBtn}
            onAction={() => router.push('/recipe/editor')}
          />
        ) : (
          <>
            {/* Flexible "This Week's Meals" Queue */}
            <View style={styles.dayCard}>
              <View style={styles.dayHeader}>
                <View style={styles.dayTitleWrap}>
                  <Ionicons name="layers-outline" size={16} color={colors.accent} />
                  <Text style={styles.dayName}>{t.flexibleQueueTitle}</Text>
                  <Text style={styles.dayDate}>{t.flexibleQueueSub}</Text>
                </View>
                <Pressable
                  onPress={() => {
                    hapticSelection();
                    setPickerTarget({
                      dayIndex: -1,
                      heading: `${t.flexibleQueueTitle} (${formatWeekRange(weekStart, language)})`,
                    });
                  }}
                  style={styles.dayAddBtn}
                >
                  <Ionicons name="add" size={17} color={colors.primary} />
                  <Text style={styles.dayAddText}>{t.add}</Text>
                </Pressable>
              </View>
              {queueEntries.length > 0 ? (
                <View style={styles.entriesWrap}>
                  {queueEntries.map(renderEntryCard)}
                </View>
              ) : (
                <Text style={styles.emptyDayText}>{t.flexibleQueueEmpty}</Text>
              )}
            </View>

            {/* 7-Day Planner */}
            {DAY_INDICES.map((dayIdx) => {
              const dayInfo = getDayLabel(weekStart, dayIdx, language);
              const entries = entriesByDay.get(dayIdx) ?? [];
              return (
                <View
                  key={dayIdx}
                  style={[styles.dayCard, dayInfo.isToday && styles.dayCardToday]}
                >
                  <View style={styles.dayHeader}>
                    <View style={styles.dayTitleWrap}>
                      <Text style={styles.dayName}>{dayInfo.fullName}</Text>
                      <Text style={styles.dayDate}>{dayInfo.dateLabel}</Text>
                      {dayInfo.isToday ? (
                        <View style={styles.todayPill}>
                          <Text style={styles.todayPillText}>{t.todayBadge}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Pressable
                      onPress={() => {
                        hapticSelection();
                        setPickerTarget({
                          dayIndex: dayIdx,
                          heading: `${dayInfo.fullName}, ${dayInfo.dateLabel}`,
                        });
                      }}
                      style={styles.dayAddBtn}
                    >
                      <Ionicons name="add" size={17} color={colors.primary} />
                      <Text style={styles.dayAddText}>{t.planBtn}</Text>
                    </Pressable>
                  </View>

                  {entries.length > 0 ? (
                    <View style={styles.entriesWrap}>
                      {entries.map(renderEntryCard)}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>

      <RecipePickerModal
        visible={pickerTarget !== null}
        heading={pickerTarget?.heading ?? ''}
        onClose={() => setPickerTarget(null)}
        onPick={handlePickRecipe}
      />
      <MarkCookedModal
        visible={cookedRecipe !== null}
        recipe={cookedRecipe}
        onClose={() => setCookedRecipe(null)}
      />
      <SettingsModal visible={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </SafeAreaView>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: c.bg,
    },
    clearWeekBtn: {
      paddingHorizontal: 12,
      height: 40,
      borderRadius: 12,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      justifyContent: 'center',
    },
    clearWeekText: {
      fontSize: 13,
      fontWeight: '600',
      color: c.danger,
    },
    weekBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginHorizontal: 16,
      marginBottom: 12,
      padding: 6,
      borderRadius: 14,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    weekArrow: {
      width: 38,
      height: 38,
      borderRadius: 10,
      backgroundColor: c.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    weekCenter: {
      alignItems: 'center',
    },
    weekRange: {
      fontSize: 15,
      fontWeight: '700',
      color: c.text,
    },
    weekSub: {
      fontSize: 11,
      fontWeight: '600',
      color: c.textMuted,
      marginTop: 1,
    },
    jumpToday: {
      fontSize: 11,
      fontWeight: '700',
      color: c.primary,
      marginTop: 1,
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingBottom: 32,
      gap: 10,
    },
    generateCard: {
      backgroundColor: c.surface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: c.border,
      padding: 14,
      gap: 12,
      marginBottom: 4,
    },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    toggleTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: c.text,
    },
    toggleDesc: {
      marginTop: 2,
      fontSize: 12,
      color: c.textSecondary,
    },
    generateBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 13,
      borderRadius: 13,
      backgroundColor: c.primary,
    },
    generateBtnText: {
      fontSize: 15,
      fontWeight: '700',
      color: c.white,
    },
    dayCard: {
      backgroundColor: c.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      padding: 13,
    },
    dayCardToday: {
      borderColor: c.primary,
    },
    dayHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    dayTitleWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    dayName: {
      fontSize: 15,
      fontWeight: '700',
      color: c.text,
    },
    dayDate: {
      fontSize: 13,
      color: c.textMuted,
    },
    todayPill: {
      backgroundColor: c.primarySoft,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 999,
    },
    todayPillText: {
      fontSize: 11,
      fontWeight: '700',
      color: c.primaryText,
    },
    dayAddBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 10,
      backgroundColor: c.primarySoft,
    },
    dayAddText: {
      fontSize: 12,
      fontWeight: '700',
      color: c.primaryText,
    },
    emptyDayText: {
      marginTop: 8,
      fontSize: 12,
      color: c.textMuted,
    },
    entriesWrap: {
      marginTop: 10,
      gap: 8,
    },
    mealCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 11,
      borderRadius: 12,
      backgroundColor: c.surfaceAlt,
    },
    mealTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 3,
    },
    slotBadge: {
      backgroundColor: c.accentSoft,
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 6,
    },
    slotBadgeText: {
      fontSize: 10,
      fontWeight: '700',
      textTransform: 'uppercase',
      color: c.accentText,
    },
    mealTime: {
      fontSize: 11,
      color: c.textMuted,
      fontWeight: '600',
    },
    mealTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: c.text,
    },
    mealRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    miniStepper: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.surface,
      borderRadius: 9,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 4,
      paddingVertical: 3,
      gap: 4,
    },
    miniStepBtn: {
      width: 24,
      height: 24,
      borderRadius: 6,
      alignItems: 'center',
      justifyContent: 'center',
    },
    miniStepVal: {
      fontSize: 12,
      fontWeight: '700',
      color: c.text,
      minWidth: 20,
      textAlign: 'center',
    },
    cookedIconBtn: {
      width: 28,
      height: 28,
      borderRadius: 8,
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    removeBtn: {
      padding: 4,
    },
  });
