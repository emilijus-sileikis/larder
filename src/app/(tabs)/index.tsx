import React, { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '@/components/AppHeader';
import { EmptyState } from '@/components/EmptyState';
import { GroceryEditModal } from '@/components/GroceryEditModal';
import { SettingsModal } from '@/components/SettingsModal';
import { GROCERY_CATEGORIES } from '@/constants/categories';
import { useLarder } from '@/db/LarderContext';
import { GROCERY_CATEGORY_LABELS } from '@/i18n/translations';
import type { ThemeColors } from '@/theme/colors';
import type { GroceryCategory, GroceryItem } from '@/types/larder';
import { hapticLight, hapticMedium, hapticSelection, hapticSuccess } from '@/utils/haptics';
import { formatQuantityWithUnit, parseQuickGroceryInput } from '@/utils/ingredients';

export default function GroceriesScreen() {
  const {
    colors,
    language,
    t,
    groceryItems,
    addGroceryItem,
    editGroceryItem,
    toggleGroceryChecked,
    removeGroceryItem,
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
  const [bannerMsg, setBannerMsg] = useState<string | null>(null);

  const uncheckedItems = useMemo(
    () => groceryItems.filter((g) => !g.checked),
    [groceryItems]
  );
  const checkedItems = useMemo(
    () => groceryItems.filter((g) => g.checked),
    [groceryItems]
  );

  const aisleSections = useMemo(() => {
    const byCat = new Map<GroceryCategory, GroceryItem[]>();
    for (const item of uncheckedItems) {
      const list = byCat.get(item.category) ?? [];
      list.push(item);
      byCat.set(item.category, list);
    }
    return GROCERY_CATEGORIES.map((meta) => ({
      meta,
      items: byCat.get(meta.id) ?? [],
    })).filter((s) => s.items.length > 0);
  }, [uncheckedItems]);

  const flashBanner = (msg: string) => {
    setBannerMsg(msg);
    setTimeout(() => {
      setBannerMsg((cur) => (cur === msg ? null : cur));
    }, 2600);
  };

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
      flashBanner(t.mergedBanner(name));
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

  const handleMoveToPantry = async () => {
    if (checkedItems.length === 0) return;
    const count = await moveCheckedToPantry();
    hapticSuccess();
    flashBanner(count === 1 ? t.movedToPantryOne : t.movedToPantryMany(count));
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
                showQuickOptions && { backgroundColor: colors.primarySoft, borderColor: colors.primary },
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

        {bannerMsg ? (
          <View style={styles.banner}>
            <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
            <Text style={styles.bannerText}>{bannerMsg}</Text>
          </View>
        ) : null}

        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            checkedItems.length > 0 && { paddingBottom: 100 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {groceryItems.length === 0 ? (
            <EmptyState
              icon="cart-outline"
              title={t.groceriesEmptyTitle}
              description={t.groceriesEmptyDesc}
            />
          ) : (
            <>
              {aisleSections.map(({ meta, items }) => (
                <View key={meta.id} style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <View style={styles.sectionTitleWrap}>
                      <Ionicons name={meta.icon} size={16} color={colors.primary} />
                      <Text style={styles.sectionTitle}>
                        {GROCERY_CATEGORY_LABELS[language][meta.id].label}
                      </Text>
                    </View>
                    <Text style={styles.sectionCount}>{items.length}</Text>
                  </View>

                  <View style={styles.sectionCard}>
                    {items.map((item, idx) => {
                      const qtyBadge = formatQuantityWithUnit(item.quantity, item.unit);
                      return (
                        <View key={item.id}>
                          {idx > 0 ? <View style={styles.rowDivider} /> : null}
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
                            <View style={styles.checkbox}>
                              {item.checked ? (
                                <Ionicons name="checkmark" size={16} color={colors.white} />
                              ) : null}
                            </View>
                            <View style={styles.itemBody}>
                              <View style={styles.itemTopLine}>
                                <Text style={styles.itemName} numberOfLines={2}>
                                  {item.name}
                                </Text>
                                {qtyBadge ? (
                                  <View style={styles.qtyPill}>
                                    <Text style={styles.qtyPillText}>{qtyBadge}</Text>
                                  </View>
                                ) : null}
                              </View>
                              {item.sourceNote ? (
                                <Text style={styles.sourceNote} numberOfLines={1}>
                                  {item.sourceNote}
                                </Text>
                              ) : null}
                            </View>
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
                          </Pressable>
                        </View>
                      );
                    })}
                  </View>
                </View>
              ))}

              {checkedItems.length > 0 ? (
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <View style={styles.sectionTitleWrap}>
                      <Ionicons
                        name="checkmark-done-outline"
                        size={16}
                        color={colors.textMuted}
                      />
                      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                        {t.inCartSection(checkedItems.length)}
                      </Text>
                    </View>
                  </View>

                  <View style={[styles.sectionCard, { opacity: 0.85 }]}>
                    {checkedItems.map((item, idx) => {
                      const qtyBadge = formatQuantityWithUnit(item.quantity, item.unit);
                      return (
                        <View key={item.id}>
                          {idx > 0 ? <View style={styles.rowDivider} /> : null}
                          <Pressable
                            onPress={() => handleToggle(item)}
                            style={({ pressed }) => [
                              styles.itemRow,
                              pressed && styles.itemRowPressed,
                            ]}
                          >
                            <View style={[styles.checkbox, styles.checkboxChecked]}>
                              <Ionicons name="checkmark" size={16} color={colors.white} />
                            </View>
                            <View style={styles.itemBody}>
                              <View style={styles.itemTopLine}>
                                <Text
                                  style={[styles.itemName, styles.itemNameChecked]}
                                  numberOfLines={2}
                                >
                                  {item.name}
                                </Text>
                                {qtyBadge ? (
                                  <Text style={styles.qtyCheckedText}>{qtyBadge}</Text>
                                ) : null}
                              </View>
                            </View>
                            <Pressable
                              onPress={() => removeGroceryItem(item.id)}
                              style={styles.editIconBtn}
                              hitSlop={10}
                              accessibilityLabel={`Delete ${item.name}`}
                            >
                              <Ionicons name="close" size={18} color={colors.textMuted} />
                            </Pressable>
                          </Pressable>
                        </View>
                      );
                    })}
                  </View>
                </View>
              ) : null}
            </>
          )}
        </ScrollView>

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
    banner: {
      marginHorizontal: 16,
      marginBottom: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: c.primarySoft,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    bannerText: {
      fontSize: 13,
      fontWeight: '600',
      color: c.primaryText,
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingBottom: 28,
    },
    section: {
      marginBottom: 18,
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
    sectionCard: {
      backgroundColor: c.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
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
