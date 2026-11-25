import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MEAL_SLOTS } from '@/constants/categories';
import { useLarder } from '@/db/LarderContext';
import { MEAL_SLOT_LABELS } from '@/i18n/translations';
import type { ThemeColors } from '@/theme/colors';
import type { MealSlot, Recipe } from '@/types/larder';
import { hapticSelection, hapticSuccess } from '@/utils/haptics';

interface RecipePickerModalProps {
  visible: boolean;
  heading: string;
  defaultSlot?: MealSlot;
  onClose: () => void;
  onPick: (recipe: Recipe, servings: number, mealSlot: MealSlot) => Promise<void>;
}

function RecipePickerContent({
  heading,
  defaultSlot,
  onClose,
  onPick,
}: {
  heading: string;
  defaultSlot: MealSlot;
  onClose: () => void;
  onPick: RecipePickerModalProps['onPick'];
}) {
  const { colors, language, t, recipes, recipeMatchMap } = useLarder();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [query, setQuery] = useState('');
  const [mealSlot, setMealSlot] = useState<MealSlot>(defaultSlot);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [servings, setServings] = useState(2);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return recipes;
    return recipes.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.tags.some((t) => t.toLowerCase().includes(q))
    );
  }, [recipes, query]);

  const handleSelectRecipe = (recipe: Recipe) => {
    hapticSelection();
    setSelectedRecipe(recipe);
    setServings(recipe.servings);
  };

  const handleConfirm = async () => {
    if (!selectedRecipe) return;
    await onPick(selectedRecipe, servings, mealSlot);
    hapticSuccess();
    onClose();
  };

  return (
    <View style={[styles.sheet, { paddingTop: Math.max(insets.top, 16) }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>{t.pickRecipeTitle}</Text>
          <Text style={styles.subtitle}>{heading}</Text>
        </View>
        <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8}>
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>
      </View>

      <View style={styles.controls}>
        <View style={styles.slotRow}>
          {MEAL_SLOTS.map((slot) => {
            const active = mealSlot === slot.id;
            return (
              <Pressable
                key={slot.id}
                onPress={() => {
                  hapticSelection();
                  setMealSlot(slot.id);
                }}
                style={[styles.slotPill, active && styles.slotPillActive]}
              >
                <Text style={[styles.slotText, active && styles.slotTextActive]}>
                  {MEAL_SLOT_LABELS[language][slot.id]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={18} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t.searchRecipesPlaceholder}
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
          />
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>
              {recipes.length === 0 ? t.pickRecipeEmptyNone : t.pickRecipeEmptySearch}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const selected = selectedRecipe?.id === item.id;
          const match = recipeMatchMap[item.id];
          const totalMin = item.prepMinutes + item.cookMinutes;
          return (
            <Pressable
              onPress={() => handleSelectRecipe(item)}
              style={[styles.recipeRow, selected && styles.recipeRowSelected]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.recipeTitle}>{item.title}</Text>
                <Text style={styles.recipeMeta}>
                  {t.minutesShort(totalMin)} • {item.servings} {t.servingsShort}
                  {match
                    ? ` • ${t.inPantryShort(match.onHandCount, match.totalCount)}`
                    : ''}
                </Text>
              </View>
              <Ionicons
                name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                size={24}
                color={selected ? colors.primary : colors.borderStrong}
              />
            </Pressable>
          );
        }}
      />

      {selectedRecipe ? (
        <View
          style={[
            styles.footer,
            { paddingBottom: Math.max(insets.bottom, 16) },
          ]}
        >
          <View style={styles.servingsRow}>
            <Text style={styles.servingsLabel}>{t.servingsLabel}</Text>
            <View style={styles.stepper}>
              <Pressable
                onPress={() => {
                  hapticSelection();
                  setServings((s) => Math.max(1, s - 1));
                }}
                style={styles.stepBtn}
              >
                <Ionicons name="remove" size={18} color={colors.text} />
              </Pressable>
              <Text style={styles.servingsVal}>{servings}</Text>
              <Pressable
                onPress={() => {
                  hapticSelection();
                  setServings((s) => Math.min(20, s + 1));
                }}
                style={styles.stepBtn}
              >
                <Ionicons name="add" size={18} color={colors.text} />
              </Pressable>
            </View>
          </View>
          <Pressable
            onPress={handleConfirm}
            style={({ pressed }) => [styles.confirmBtn, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.confirmText}>{t.addToMealPlanBtn}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

export function RecipePickerModal({
  visible,
  heading,
  defaultSlot = 'dinner',
  onClose,
  onPick,
}: RecipePickerModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      {visible ? (
        <RecipePickerContent
          key={`${heading}-${defaultSlot}`}
          heading={heading}
          defaultSlot={defaultSlot}
          onClose={onClose}
          onPick={onPick}
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
    controls: {
      paddingHorizontal: 20,
      paddingTop: 14,
      paddingBottom: 10,
      gap: 10,
    },
    slotRow: {
      flexDirection: 'row',
      gap: 6,
    },
    slotPill: {
      flex: 1,
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
    },
    slotPillActive: {
      backgroundColor: c.accent,
      borderColor: c.accent,
    },
    slotText: {
      fontSize: 12,
      fontWeight: '600',
      color: c.textSecondary,
    },
    slotTextActive: {
      color: c.white,
    },
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      paddingHorizontal: 12,
    },
    searchInput: {
      flex: 1,
      paddingVertical: 10,
      fontSize: 15,
      color: c.text,
    },
    listContent: {
      paddingHorizontal: 20,
      paddingBottom: 20,
      gap: 8,
    },
    recipeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 14,
      borderRadius: 14,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    recipeRowSelected: {
      borderColor: c.primary,
      backgroundColor: c.primarySoft,
    },
    recipeTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: c.text,
    },
    recipeMeta: {
      marginTop: 3,
      fontSize: 12,
      color: c.textSecondary,
    },
    emptyBox: {
      paddingVertical: 40,
      alignItems: 'center',
    },
    emptyText: {
      fontSize: 14,
      color: c.textSecondary,
    },
    footer: {
      borderTopWidth: 1,
      borderTopColor: c.border,
      backgroundColor: c.surface,
      paddingHorizontal: 20,
      paddingTop: 14,
      gap: 12,
    },
    servingsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    servingsLabel: {
      fontSize: 15,
      fontWeight: '600',
      color: c.text,
    },
    stepper: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    stepBtn: {
      width: 34,
      height: 34,
      borderRadius: 10,
      backgroundColor: c.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    servingsVal: {
      fontSize: 17,
      fontWeight: '700',
      color: c.text,
      minWidth: 24,
      textAlign: 'center',
    },
    confirmBtn: {
      paddingVertical: 14,
      borderRadius: 14,
      backgroundColor: c.primary,
      alignItems: 'center',
    },
    confirmText: {
      fontSize: 16,
      fontWeight: '700',
      color: c.white,
    },
  });
