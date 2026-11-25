import React, { useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  SectionList,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '@/components/AppHeader';
import { EmptyState } from '@/components/EmptyState';
import { GroceryEditModal } from '@/components/GroceryEditModal';
import { SettingsModal } from '@/components/SettingsModal';
import { SwipeableRow } from '@/components/SwipeableRow';
import { UndoSnackbar } from '@/components/UndoSnackbar';
import { GROCERY_CATEGORIES } from '@/constants/categories';
import { useLarder } from '@/db/LarderContext';
import { GROCERY_CATEGORY_LABELS } from '@/i18n/translations';
import type { ThemeColors } from '@/theme/colors';
import type { GroceryCategory, GroceryItem, IoniconName } from '@/types/larder';
import { hapticLight, hapticMedium, hapticSelection, hapticSuccess } from '@/utils/haptics';
import {
  formatGroceryListAsPlainText,
  formatQuantityWithUnit,
  parseQuickGroceryInput,
} from '@/utils/ingredients';

interface GrocerySection {
  key: string;
  title: string;
  icon: IoniconName;
  isCheckedSection: boolean;
  data: GroceryItem[];
}

export default function GroceriesScreen() {
  const {
    colors,
    language,
    t,
    groceryItems,
    stapleHistory,
    addGroceryItem,
    editGroceryItem,
    toggleGroceryChecked,
    removeGroceryItem,
    restoreGroceryItem,
    moveCheckedToPantry,
    clearChecked,
  } = useLarder();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<GroceryItem | null>(null);

  // Quick-add state
  const [quickName, setQuickName] = useState('');
  const [quickQty, setQuickQty] = useState('');
  const [quickUnit, setQuickUnit] = useState('');
  const [quickCategory, setQuickCategory] = useState<GroceryCategory>('produce');
  const [showQuickOptions, setShowQuickOptions] = useState(false);

  // Toast & Undo state
  const [snackbar, setSnackbar] = useState<{
    message: string;
    undoItem?: GroceryItem;
  } | null>(null);
  const snackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showSnackbar = (message: string, undoItem?: GroceryItem) => {
    if (snackTimerRef.current) clearTimeout(snackTimerRef.current);
    setSnackbar({ message, undoItem });
    snackTimerRef.current = setTimeout(() => {
      setSnackbar(null);
    }, undoItem ? 4200 : 2600);
  };

  const uncheckedItems = useMemo(
    () => groceryItems.filter((g) => !g.checked),
    [groceryItems]
  );
  const checkedItems = useMemo(
    () => groceryItems.filter((g) => g.checked),
    [groceryItems]
  );

  // Autocomplete suggestions from staple history (#7)
  const quickSuggestions = useMemo(() => {
    const q = quickName.trim().toLowerCase();
    if (!q) return [];
    const activeSet = new Set(uncheckedItems.map((i) => i.normalizedName));
    return stapleHistory
      .filter(
        (h) =>
          h.name.toLowerCase().includes(q) &&
          !activeSet.has(h.normalizedName)
      )
      .slice(0, 5);
  }, [quickName, stapleHistory, uncheckedItems]);

  const sections = useMemo<GrocerySection[]>(() => {
    const byCat = new Map<GroceryCategory, GroceryItem[]>();
    for (const item of uncheckedItems) {
      const list = byCat.get(item.category) ?? [];
      list.push(item);
      byCat.set(item.category, list);
    }

    const result: GrocerySection[] = GROCERY_CATEGORIES.map((meta) => ({
      key: meta.id,
      title: GROCERY_CATEGORY_LABELS[language][meta.id].label,
      icon: meta.icon,
      isCheckedSection: false,
      data: byCat.get(meta.id) ?? [],
    })).filter((s) => s.data.length > 0);

    if (checkedItems.length > 0) {
      result.push({
        key: '__checked__',
        title: t.inCartSection(checkedItems.length),
        icon: 'checkmark-done-outline',
        isCheckedSection: true,
        data: checkedItems,
      });
    }
    return result;
  }, [uncheckedItems, checkedItems, language, t]);

  const handleQuickAdd = async () => {
    const raw = quickName.trim();
    if (!raw) return;

    let name = raw;
    let quantity: number | null = null;
    let unit = quickUnit.trim();

    if (quickQty.trim()) {
      const parsed = Number(quickQty.replace(',', '.'));
      if (Number.isFinite(parsed) && parsed > 0) {
        quantity = parsed;
      }
    } else {
      const parsed = parseQuickGroceryInput(raw);
      name = parsed.name;
      quantity = parsed.quantity;
      if (!unit && parsed.unit) {
        unit = parsed.unit;
      }
    }

    const res = await addGroceryItem({
      name,
      quantity,
      unit,
      category: quickCategory,
    });
    hapticLight();
    setQuickName('');
    setQuickQty('');
    setQuickUnit('');
    if (res.merged > 0) {
      showSnackbar(t.mergedBanner(name));
    }
  };

  const handleSelectSuggestion = async (suggestion: {
    name: string;
    category: GroceryCategory;
    unit: string;
  }) => {
    const res = await addGroceryItem({
      name: suggestion.name,
      quantity: null,
      unit: suggestion.unit,
      category: suggestion.category,
    });
    hapticLight();
    setQuickName('');
    setQuickCategory(suggestion.category);
    if (res.merged > 0) {
      showSnackbar(t.mergedBanner(suggestion.name));
    }
  };

  const handleToggle = (item: GroceryItem) => {
    const next = !item.checked;
    if (next) {
      hapticMedium();
    } else {
      hapticSelection();
    }
    toggleGroceryChecked(item.id, next);
  };

  const handleSwipeDelete = async (item: GroceryItem) => {
    await removeGroceryItem(item.id);
    showSnackbar(t.deletedItemToast(item.name), item);
  };

  const handleUndoDelete = async () => {
    if (!snackbar?.undoItem) return;
    const toRestore = snackbar.undoItem;
    setSnackbar(null);
    await restoreGroceryItem(toRestore);
    hapticSuccess();
  };

  const handleMoveToPantry = async () => {
    if (checkedItems.length === 0) return;
    const count = await moveCheckedToPantry();
    hapticSuccess();
    showSnackbar(count === 1 ? t.movedToPantryOne : t.movedToPantryMany(count));
  };

  const handleClearChecked = () => {
    if (checkedItems.length === 0) return;
    Alert.alert(t.clearCheckedTitle, t.clearCheckedMsg(checkedItems.length), [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.clear,
        style: 'destructive',
        onPress: async () => {
          await clearChecked();
          hapticLight();
        },
      },
    ]);
  };

  const handleShareOrCopyList = () => {
    const plainText = formatGroceryListAsPlainText(
      groceryItems,
      GROCERY_CATEGORIES.map((c) => c.id),
      (cat) => GROCERY_CATEGORY_LABELS[language][cat].label,
      t.groceriesTitle
    );
    if (!plainText) return;
    hapticSelection();
    Alert.alert(t.shareListTitle, undefined, [
      {
        text: t.shareListActionCopy,
        onPress: async () => {
          await Clipboard.setStringAsync(plainText);
          hapticSuccess();
          showSnackbar(t.listCopiedToast);
        },
      },
      {
        text: t.shareListActionShare,
        onPress: async () => {
          await Share.share({ message: plainText, title: t.groceriesTitle });
        },
      },
      { text: t.cancel, style: 'cancel' },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AppHeader
        title={t.groceriesTitle}
        subtitle={
          uncheckedItems.length > 0
            ? t.groceriesSubtitlePickUp(uncheckedItems.length, checkedItems.length)
            : checkedItems.length > 0
              ? t.groceriesSubtitleAllChecked(checkedItems.length)
              : t.groceriesSubtitleEmpty
        }
        onOpenSettings={() => setSettingsOpen(true)}
        rightSlot={
          uncheckedItems.length > 0 ? (
            <Pressable
              onPress={handleShareOrCopyList}
              style={({ pressed }) => [styles.shareBtn, pressed && { opacity: 0.75 }]}
              accessibilityLabel={t.shareListTitle}
            >
              <Ionicons name="share-outline" size={19} color={colors.textSecondary} />
            </Pressable>
          ) : null
        }
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Quick-add bar */}
        <View style={styles.quickAddCard}>
          <View style={styles.quickTopRow}>
            <TextInput
              value={quickName}
              onChangeText={setQuickName}
              onSubmitEditing={handleQuickAdd}
              returnKeyType="done"
              placeholder={t.quickAddPlaceholder}
              placeholderTextColor={colors.textMuted}
              style={styles.quickInput}
            />
            <Pressable
              onPress={() => {
                hapticSelection();
                setShowQuickOptions((v) => !v);
              }}
              style={[
                styles.tuneBtn,
                showQuickOptions && {
                  backgroundColor: colors.primarySoft,
                  borderColor: colors.primary,
                },
              ]}
              accessibilityLabel="Toggle quantity and aisle options"
            >
              <Ionicons
                name="options-outline"
                size={18}
                color={showQuickOptions ? colors.primary : colors.textSecondary}
              />
            </Pressable>
            <Pressable
              onPress={handleQuickAdd}
              disabled={!quickName.trim()}
              style={({ pressed }) => [
                styles.addBtn,
                !quickName.trim() && styles.addBtnDisabled,
                pressed && { opacity: 0.85 },
              ]}
              accessibilityLabel="Add grocery item"
            >
              <Ionicons name="add" size={22} color={colors.white} />
            </Pressable>
          </View>

          {/* Staple History Autocomplete (#7) */}
          {quickSuggestions.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.suggestionsRow}
            >
              {quickSuggestions.map((s) => (
                <Pressable
                  key={s.normalizedName}
                  onPress={() => handleSelectSuggestion(s)}
                  style={styles.suggestionChip}
                >
                  <Ionicons name="add-circle-outline" size={14} color={colors.primary} />
                  <Text style={styles.suggestionText}>{s.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}

          {showQuickOptions ? (
            <View style={styles.quickDetails}>
              <View style={styles.qtyRow}>
                <TextInput
                  value={quickQty}
                  onChangeText={setQuickQty}
                  keyboardType="decimal-pad"
                  placeholder={t.qtyPlaceholder}
                  placeholderTextColor={colors.textMuted}
                  style={[styles.smallInput, { width: 76 }]}
                />
                <TextInput
                  value={quickUnit}
                  onChangeText={setQuickUnit}
                  placeholder={t.unitPlaceholder}
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  style={[styles.smallInput, { flex: 1 }]}
                />
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.aisleChips}
              >
                {GROCERY_CATEGORIES.map((cat) => {
                  const active = quickCategory === cat.id;
                  return (
                    <Pressable
                      key={cat.id}
                      onPress={() => {
                        hapticSelection();
                        setQuickCategory(cat.id);
                      }}
                      style={[styles.aisleChip, active && styles.aisleChipActive]}
                    >
                      <Ionicons
                        name={cat.icon}
                        size={13}
                        color={active ? colors.white : colors.textSecondary}
                      />
                      <Text style={[styles.aisleChipText, active && styles.aisleChipTextActive]}>
                        {GROCERY_CATEGORY_LABELS[language][cat.id].shortLabel}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}
        </View>

        <SectionList
          sections={sections}
          keyExtractor={(item) => String(item.id)}
          stickySectionHeadersEnabled={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.scrollContent,
            checkedItems.length > 0 && { paddingBottom: 112 },
          ]}
          ListEmptyComponent={
            <EmptyState
              icon="cart-outline"
              title={t.groceriesEmptyTitle}
              description={t.groceriesEmptyDesc}
            />
          }
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleWrap}>
                <Ionicons
                  name={section.icon}
                  size={16}
                  color={section.isCheckedSection ? colors.textMuted : colors.primary}
                />
                <Text
                  style={[
                    styles.sectionTitle,
                    section.isCheckedSection && { color: colors.textSecondary },
                  ]}
                >
                  {section.title}
                </Text>
              </View>
              {!section.isCheckedSection ? (
                <Text style={styles.sectionCount}>{section.data.length}</Text>
              ) : null}
            </View>
          )}
          renderItem={({ item, index, section }) => {
            const isFirst = index === 0;
            const isLast = index === section.data.length - 1;
            const qtyBadge = formatQuantityWithUnit(item.quantity, item.unit);

            return (
              <View
                style={[
                  styles.cardSlice,
                  isFirst && styles.cardFirst,
                  isLast && styles.cardLast,
                  section.isCheckedSection && { opacity: 0.85 },
                ]}
              >
                {!isFirst ? <View style={styles.rowDivider} /> : null}
                <SwipeableRow onDelete={() => handleSwipeDelete(item)}>
                  <Pressable
                    onPress={() => handleToggle(item)}
                    onLongPress={() => {
                      hapticSelection();
                      setEditingItem(item);
                    }}
                    style={({ pressed }) => [
                      styles.itemRow,
                      pressed && styles.itemRowPressed,
                    ]}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        item.checked && styles.checkboxChecked,
                      ]}
                    >
                      {item.checked ? (
                        <Ionicons name="checkmark" size={16} color={colors.white} />
                      ) : null}
                    </View>
                    <View style={styles.itemBody}>
                      <View style={styles.itemTopLine}>
                        <Text
                          style={[
                            styles.itemName,
                            item.checked && styles.itemNameChecked,
                          ]}
                          numberOfLines={2}
                        >
                          {item.name}
                        </Text>
                        {qtyBadge ? (
                          item.checked ? (
                            <Text style={styles.qtyCheckedText}>{qtyBadge}</Text>
                          ) : (
                            <View style={styles.qtyPill}>
                              <Text style={styles.qtyPillText}>{qtyBadge}</Text>
                            </View>
                          )
                        ) : null}
                      </View>
                      {!item.checked && item.sourceNote ? (
                        <Text style={styles.sourceNote} numberOfLines={1}>
                          {item.sourceNote}
                        </Text>
                      ) : null}
                    </View>
                    {!item.checked ? (
                      <Pressable
                        onPress={() => {
                          hapticSelection();
                          setEditingItem(item);
                        }}
                        style={styles.editIconBtn}
                        hitSlop={10}
                        accessibilityLabel={`Edit ${item.name}`}
                      >
                        <Ionicons
                          name="pencil-outline"
                          size={16}
                          color={colors.textMuted}
                        />
                      </Pressable>
                    ) : (
                      <Pressable
                        onPress={() => handleSwipeDelete(item)}
                        style={styles.editIconBtn}
                        hitSlop={10}
                        accessibilityLabel={`Delete ${item.name}`}
                      >
                        <Ionicons name="close" size={18} color={colors.textMuted} />
                      </Pressable>
                    )}
                  </Pressable>
                </SwipeableRow>
              </View>
            );
          }}
          renderSectionFooter={() => <View style={{ height: 16 }} />}
        />

        {/* Sticky Move Checked to Pantry Bar */}
        {checkedItems.length > 0 ? (
          <View style={styles.stickyBar}>
            <Pressable
              onPress={handleMoveToPantry}
              style={({ pressed }) => [styles.moveBtn, pressed && { opacity: 0.88 }]}
            >
              <Ionicons name="cube-outline" size={19} color={colors.white} />
              <Text style={styles.moveBtnText}>
                {t.moveCheckedToPantry(checkedItems.length)}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleClearChecked}
              style={({ pressed }) => [styles.clearIconBtn, pressed && { opacity: 0.75 }]}
              accessibilityLabel="Clear checked items"
            >
              <Ionicons name="trash-outline" size={19} color={colors.danger} />
            </Pressable>
          </View>
        ) : null}

        <UndoSnackbar
          message={snackbar?.message ?? null}
          onUndo={snackbar?.undoItem ? handleUndoDelete : undefined}
          bottomOffset={checkedItems.length > 0 ? 74 : 14}
        />
      </KeyboardAvoidingView>

      <GroceryEditModal
        visible={editingItem !== null}
        item={editingItem}
        onClose={() => setEditingItem(null)}
        onSave={editGroceryItem}
        onDelete={removeGroceryItem}
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
    shareBtn: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    quickAddCard: {
      marginHorizontal: 16,
      marginBottom: 10,
      padding: 10,
      borderRadius: 16,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    quickTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    quickInput: {
      flex: 1,
      fontSize: 15,
      color: c.text,
      paddingHorizontal: 10,
      paddingVertical: 10,
    },
    tuneBtn: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: c.surfaceAlt,
      borderWidth: 1,
      borderColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
    },
    addBtn: {
      width: 42,
      height: 42,
      borderRadius: 12,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addBtnDisabled: {
      opacity: 0.4,
    },
    suggestionsRow: {
      paddingTop: 8,
      gap: 6,
    },
    suggestionChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: c.primarySoft,
    },
    suggestionText: {
      fontSize: 12,
      fontWeight: '700',
      color: c.primaryText,
    },
    quickDetails: {
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: c.border,
      gap: 10,
    },
    qtyRow: {
      flexDirection: 'row',
      gap: 8,
    },
    smallInput: {
      backgroundColor: c.surfaceAlt,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 9,
      fontSize: 14,
      color: c.text,
    },
    aisleChips: {
      gap: 6,
      paddingRight: 8,
    },
    aisleChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: c.surfaceAlt,
    },
    aisleChipActive: {
      backgroundColor: c.primary,
    },
    aisleChipText: {
      fontSize: 12,
      fontWeight: '600',
      color: c.textSecondary,
    },
    aisleChipTextActive: {
      color: c.white,
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingBottom: 32,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
      paddingHorizontal: 4,
    },
    sectionTitleWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      color: c.text,
    },
    sectionCount: {
      fontSize: 12,
      fontWeight: '700',
      color: c.textMuted,
    },
    cardSlice: {
      backgroundColor: c.surface,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
    },
    cardFirst: {
      borderTopWidth: 1,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
    },
    cardLast: {
      borderBottomWidth: 1,
      borderBottomLeftRadius: 16,
      borderBottomRightRadius: 16,
    },
    rowDivider: {
      height: 1,
      backgroundColor: c.border,
      marginLeft: 56,
    },
    itemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 58,
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 12,
      backgroundColor: c.surface,
    },
    itemRowPressed: {
      backgroundColor: c.surfaceAlt,
    },
    checkbox: {
      width: 26,
      height: 26,
      borderRadius: 8,
      borderWidth: 2,
      borderColor: c.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.surface,
    },
    checkboxChecked: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    itemBody: {
      flex: 1,
    },
    itemTopLine: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    itemName: {
      flex: 1,
      fontSize: 16,
      fontWeight: '600',
      color: c.text,
    },
    itemNameChecked: {
      textDecorationLine: 'line-through',
      color: c.textMuted,
    },
    qtyPill: {
      backgroundColor: c.primarySoft,
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 8,
    },
    qtyPillText: {
      fontSize: 13,
      fontWeight: '700',
      color: c.primaryText,
    },
    qtyCheckedText: {
      fontSize: 13,
      color: c.textMuted,
    },
    sourceNote: {
      marginTop: 2,
      fontSize: 12,
      color: c.textMuted,
    },
    editIconBtn: {
      padding: 4,
    },
    stickyBar: {
      position: 'absolute',
      left: 16,
      right: 16,
      bottom: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    moveBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 14,
      borderRadius: 15,
      backgroundColor: c.primary,
      shadowColor: c.shadow,
      shadowOpacity: 0.16,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
      elevation: 4,
    },
    moveBtnText: {
      fontSize: 15,
      fontWeight: '700',
      color: c.white,
    },
    clearIconBtn: {
      width: 48,
      height: 48,
      borderRadius: 15,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: c.shadow,
      shadowOpacity: 0.1,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 3,
    },
  });
