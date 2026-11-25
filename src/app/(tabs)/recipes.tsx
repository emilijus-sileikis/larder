import React, { useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '@/components/AppHeader';
import { EmptyState } from '@/components/EmptyState';
import { ImportRecipeModal } from '@/components/ImportRecipeModal';
import { SettingsModal } from '@/components/SettingsModal';
import { useLarder } from '@/db/LarderContext';
import type { ThemeColors } from '@/theme/colors';
import type { RecipeInput } from '@/types/larder';
import { hapticSelection } from '@/utils/haptics';

type SortMode = 'recent' | 'match';

export default function RecipesScreen() {
  const { colors, t, recipes, recipeMatchMap, setPendingImportedRecipe } = useLarder();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortMode>('recent');

  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of recipes) {
      for (const tag of r.tags) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([tag]) => tag);
  }, [recipes]);

  const filteredRecipes = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = recipes.filter((r) => {
      if (selectedTag && !r.tags.includes(selectedTag)) return false;
      if (!q) return true;
      return (
        r.title.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.tags.some((tItem) => tItem.toLowerCase().includes(q)) ||
        r.ingredients.some((i) => i.name.toLowerCase().includes(q))
      );
    });

    if (sortBy === 'match') {
      return [...list].sort((a, b) => {
        const ma = recipeMatchMap[a.id]?.ratio ?? 0;
        const mb = recipeMatchMap[b.id]?.ratio ?? 0;
        return mb - ma;
      });
    }
    return list;
  }, [recipes, query, selectedTag, sortBy, recipeMatchMap]);

  const handleImported = (draft: RecipeInput) => {
    setPendingImportedRecipe(draft);
    router.push('/recipe/editor');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AppHeader
        title={t.recipesTitle}
        subtitle={t.recipesSubtitle(recipes.length)}
        onOpenSettings={() => setSettingsOpen(true)}
        rightSlot={
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => {
                hapticSelection();
                setImportOpen(true);
              }}
              style={({ pressed }) => [styles.importBtn, pressed && { opacity: 0.85 }]}
              accessibilityLabel={t.importBtn}
            >
              <Ionicons name="link-outline" size={17} color={colors.accentText} />
              <Text style={styles.importBtnText}>{t.importBtn}</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                hapticSelection();
                setPendingImportedRecipe(null);
                router.push('/recipe/editor');
              }}
              style={({ pressed }) => [styles.newBtn, pressed && { opacity: 0.85 }]}
            >
              <Ionicons name="add" size={18} color={colors.white} />
              <Text style={styles.newBtnText}>{t.newLabel}</Text>
            </Pressable>
          </View>
        }
      />

      {/* Search + sort bar */}
      <View style={styles.searchRow}>
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={18} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t.searchRecipesPlaceholder}
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          onPress={() => {
            hapticSelection();
            setSortBy((s) => (s === 'recent' ? 'match' : 'recent'));
          }}
          style={[
            styles.sortBtn,
            sortBy === 'match' && {
              backgroundColor: colors.primarySoft,
              borderColor: colors.primary,
            },
          ]}
        >
          <Ionicons
            name={sortBy === 'match' ? 'sparkles' : 'swap-vertical-outline'}
            size={16}
            color={sortBy === 'match' ? colors.primary : colors.textSecondary}
          />
          <Text
            style={[
              styles.sortBtnText,
              sortBy === 'match' && { color: colors.primaryText },
            ]}
          >
            {sortBy === 'match' ? t.sortMatch : t.sortRecent}
          </Text>
        </Pressable>
      </View>

      {/* Tag filters */}
      {allTags.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tagsBar}
          style={styles.tagsScroll}
        >
          <Pressable
            onPress={() => {
              hapticSelection();
              setSelectedTag(null);
            }}
            style={[styles.tagChip, selectedTag === null && styles.tagChipActive]}
          >
            <Text
              style={[styles.tagText, selectedTag === null && styles.tagTextActive]}
            >
              {t.all}
            </Text>
          </Pressable>
          {allTags.map((tag) => {
            const active = selectedTag === tag;
            return (
              <Pressable
                key={tag}
                onPress={() => {
                  hapticSelection();
                  setSelectedTag(active ? null : tag);
                }}
                style={[styles.tagChip, active && styles.tagChipActive]}
              >
                <Text style={[styles.tagText, active && styles.tagTextActive]}>
                  {tag}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      <ScrollView contentContainerStyle={styles.listContent}>
        {filteredRecipes.length === 0 ? (
          <EmptyState
            icon="book-outline"
            title={recipes.length === 0 ? t.recipesEmptyTitle : t.recipesNoMatchTitle}
            description={
              recipes.length === 0 ? t.recipesEmptyDesc : t.recipesNoMatchDesc
            }
            actionLabel={recipes.length === 0 ? t.addFirstRecipe : t.clearFilters}
            onAction={() => {
              if (recipes.length === 0) {
                setPendingImportedRecipe(null);
                router.push('/recipe/editor');
              } else {
                setQuery('');
                setSelectedTag(null);
              }
            }}
          />
        ) : (
          filteredRecipes.map((recipe) => {
            const match = recipeMatchMap[recipe.id];
            const totalMin = recipe.prepMinutes + recipe.cookMinutes;
            const highMatch = match && match.totalCount > 0 && match.ratio >= 0.75;
            const midMatch =
              match && match.totalCount > 0 && match.ratio >= 0.4 && match.ratio < 0.75;

            return (
              <Pressable
                key={recipe.id}
                onPress={() => {
                  hapticSelection();
                  router.push(`/recipe/${recipe.id}`);
                }}
                style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
              >
                {recipe.photoUri ? (
                  <Image source={{ uri: recipe.photoUri }} style={styles.cardPhoto} />
                ) : null}
                <View style={styles.cardBody}>
                  <View style={styles.cardHeaderRow}>
                    <Text style={styles.cardTitle} numberOfLines={2}>
                      {recipe.title}
                    </Text>
                    {match && match.totalCount > 0 ? (
                      <View
                        style={[
                          styles.matchBadge,
                          highMatch
                            ? { backgroundColor: colors.primarySoft }
                            : midMatch
                              ? { backgroundColor: colors.warningSoft }
                              : { backgroundColor: colors.surfaceAlt },
                        ]}
                      >
                        <Ionicons
                          name={highMatch ? 'checkmark-circle' : 'cube-outline'}
                          size={13}
                          color={
                            highMatch
                              ? colors.primary
                              : midMatch
                                ? colors.warning
                                : colors.textSecondary
                          }
                        />
                        <Text
                          style={[
                            styles.matchText,
                            {
                              color: highMatch
                                ? colors.primaryText
                                : midMatch
                                  ? colors.warning
                                  : colors.textSecondary,
                            },
                          ]}
                        >
                          {t.onHandBadge(match.onHandCount, match.totalCount)}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  {recipe.description ? (
                    <Text style={styles.cardDesc} numberOfLines={2}>
                      {recipe.description}
                    </Text>
                  ) : null}

                  <View style={styles.metaRow}>
                    <View style={styles.metaItem}>
                      <Ionicons name="time-outline" size={14} color={colors.textMuted} />
                      <Text style={styles.metaText}>{t.minutesShort(totalMin)}</Text>
                    </View>
                    <View style={styles.metaItem}>
                      <Ionicons name="people-outline" size={14} color={colors.textMuted} />
                      <Text style={styles.metaText}>{t.servingsWord(recipe.servings)}</Text>
                    </View>
                    <View style={styles.metaItem}>
                      <Ionicons name="list-outline" size={14} color={colors.textMuted} />
                      <Text style={styles.metaText}>
                        {t.ingredientsWord(recipe.ingredients.length)}
                      </Text>
                    </View>
                  </View>

                  {recipe.tags.length > 0 ? (
                    <View style={styles.cardTags}>
                      {recipe.tags.slice(0, 4).map((tagItem) => (
                        <View key={tagItem} style={styles.cardTagPill}>
                          <Text style={styles.cardTagText}>{tagItem}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>

      <ImportRecipeModal
        visible={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={handleImported}
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
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    importBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 11,
      height: 40,
      borderRadius: 12,
      backgroundColor: c.accentSoft,
    },
    importBtnText: {
      fontSize: 13,
      fontWeight: '700',
      color: c.accentText,
    },
    newBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 12,
      height: 40,
      borderRadius: 12,
      backgroundColor: c.primary,
    },
    newBtnText: {
      fontSize: 13,
      fontWeight: '700',
      color: c.white,
    },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 16,
      marginBottom: 10,
    },
    searchWrap: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 14,
      paddingHorizontal: 12,
    },
    searchInput: {
      flex: 1,
      paddingVertical: 11,
      fontSize: 15,
      color: c.text,
    },
    sortBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 12,
      height: 44,
      borderRadius: 14,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    sortBtnText: {
      fontSize: 13,
      fontWeight: '600',
      color: c.textSecondary,
    },
    tagsScroll: {
      flexGrow: 0,
      marginBottom: 10,
    },
    tagsBar: {
      paddingHorizontal: 16,
      gap: 7,
    },
    tagChip: {
      paddingHorizontal: 13,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    tagChipActive: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    tagText: {
      fontSize: 13,
      fontWeight: '600',
      color: c.textSecondary,
    },
    tagTextActive: {
      color: c.white,
    },
    listContent: {
      paddingHorizontal: 16,
      paddingBottom: 28,
      gap: 12,
    },
    card: {
      backgroundColor: c.surface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
    },
    cardPressed: {
      opacity: 0.9,
      transform: [{ scale: 0.992 }],
    },
    cardPhoto: {
      width: '100%',
      height: 150,
      backgroundColor: c.surfaceAlt,
    },
    cardBody: {
      padding: 15,
    },
    cardHeaderRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 10,
    },
    cardTitle: {
      flex: 1,
      fontSize: 17,
      fontWeight: '700',
      color: c.text,
      lineHeight: 22,
    },
    matchBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 999,
    },
    matchText: {
      fontSize: 11,
      fontWeight: '700',
    },
    cardDesc: {
      marginTop: 5,
      fontSize: 13,
      lineHeight: 19,
      color: c.textSecondary,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      marginTop: 10,
    },
    metaItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    metaText: {
      fontSize: 12,
      fontWeight: '600',
      color: c.textMuted,
    },
    cardTags: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 10,
    },
    cardTagPill: {
      paddingHorizontal: 9,
      paddingVertical: 3,
      borderRadius: 8,
      backgroundColor: c.surfaceAlt,
    },
    cardTagText: {
      fontSize: 11,
      fontWeight: '600',
      color: c.textSecondary,
    },
  });
