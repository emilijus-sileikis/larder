import React, { useMemo, useState } from 'react';
import {
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
import { PantryItemModal } from '@/components/PantryItemModal';
import { SettingsModal } from '@/components/SettingsModal';
import { PANTRY_LOCATIONS, STOCK_LEVELS } from '@/constants/categories';
import { useLarder } from '@/db/LarderContext';
import { PANTRY_LOCATION_LABELS, STOCK_LEVEL_LABELS } from '@/i18n/translations';
import type { ThemeColors } from '@/theme/colors';
import type {
  PantryItem,
  PantryItemInput,
  PantryLocation,
  StockLevel,
} from '@/types/larder';
import {
  formatExpiryLabel,
  getDaysUntilExpiry,
  isExpiringSoon,
} from '@/utils/dates';
import { hapticLight, hapticSelection, hapticSuccess } from '@/utils/haptics';
import { formatQuantityWithUnit } from '@/utils/ingredients';

type FilterMode = 'all' | 'expiring' | 'low_out';

export default function PantryScreen() {
  const {
    colors,
    language,
    t,
    pantryItems,
    addPantryItem,
    editPantryItem,
    setPantryStock,
    removePantryItem,
    sendPantryItemToGroceries,
  } = useLarder();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<PantryItem | null>(null);
  const [defaultLoc, setDefaultLoc] = useState<PantryLocation>('fridge');

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterMode>('all');
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast((cur) => (cur === msg ? null : cur));
    }, 2400);
  };

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pantryItems.filter((item) => {
      if (filter === 'expiring' && !(item.stockLevel !== 'out' && isExpiringSoon(item.expiresAt, 3))) {
        return false;
      }
      if (filter === 'low_out' && item.stockLevel === 'in_stock') {
        return false;
      }
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.notes.toLowerCase().includes(q)
      );
    });
  }, [pantryItems, query, filter]);

  const expiringSoonItems = useMemo(() => {
    return filteredItems
      .filter((i) => i.stockLevel !== 'out' && isExpiringSoon(i.expiresAt, 3))
      .sort((a, b) => (getDaysUntilExpiry(a.expiresAt) ?? 99) - (getDaysUntilExpiry(b.expiresAt) ?? 99));
  }, [filteredItems]);

  const expiringIdSet = useMemo(
    () => new Set(expiringSoonItems.map((i) => i.id)),
    [expiringSoonItems]
  );

  const locationSections = useMemo(() => {
    const byLoc = new Map<PantryLocation, PantryItem[]>();
    for (const item of filteredItems) {
      if (filter === 'all' && expiringIdSet.has(item.id)) {
        // Expiring soon items are surfaced at the top in their own section
        continue;
      }
      const list = byLoc.get(item.location) ?? [];
      list.push(item);
      byLoc.set(item.location, list);
    }
    return PANTRY_LOCATIONS.map((meta) => ({
      meta,
      items: byLoc.get(meta.id) ?? [],
    })).filter((s) => s.items.length > 0);
  }, [filteredItems, filter, expiringIdSet]);

  const inStockCount = useMemo(
    () => pantryItems.filter((i) => i.stockLevel === 'in_stock').length,
    [pantryItems]
  );
  const lowOutCount = useMemo(
    () => pantryItems.filter((i) => i.stockLevel !== 'in_stock').length,
    [pantryItems]
  );

  const handleSave = async (input: PantryItemInput, editingId?: number) => {
    if (editingId) {
      await editPantryItem(editingId, input);
    } else {
      await addPantryItem(input);
    }
  };

  const handleQuickStock = (item: PantryItem, level: StockLevel) => {
    if (item.stockLevel === level) return;
    hapticLight();
    setPantryStock(item.id, level);
  };

  const handleSendToGroceries = async (item: PantryItem) => {
    await sendPantryItemToGroceries(item);
    hapticSuccess();
    showToast(t.addedToGroceriesToast(item.name));
  };

  const renderPantryRow = (item: PantryItem, idx: number, showLocationTag = false) => {
    const qtyLabel = formatQuantityWithUnit(item.quantity, item.unit);
    const expLabel = formatExpiryLabel(item.expiresAt, language);
    const expDays = getDaysUntilExpiry(item.expiresAt);
    const isExpired = expDays !== null && expDays < 0;
    const isSoon = expDays !== null && expDays >= 0 && expDays <= 3;

    return (
      <View key={item.id}>
        {idx > 0 ? <View style={styles.rowDivider} /> : null}
        <View style={styles.itemBlock}>
          <Pressable
            onPress={() => {
              hapticSelection();
              setEditingItem(item);
              setModalVisible(true);
            }}
            style={styles.itemHeader}
          >
            <View style={{ flex: 1 }}>
              <View style={styles.nameRow}>
                <Text style={styles.itemName} numberOfLines={1}>
                  {item.name}
                </Text>
                {qtyLabel ? <Text style={styles.qtyText}>{qtyLabel}</Text> : null}
              </View>
              <View style={styles.badgeRow}>
                {expLabel ? (
                  <View
                    style={[
                      styles.expBadge,
                      isExpired
                        ? { backgroundColor: colors.dangerSoft }
                        : isSoon
                          ? { backgroundColor: colors.warningSoft }
                          : { backgroundColor: colors.surfaceAlt },
                    ]}
                  >
                    <Ionicons
                      name="time-outline"
                      size={11}
                      color={
                        isExpired
                          ? colors.danger
                          : isSoon
                            ? colors.warning
                            : colors.textSecondary
                      }
                    />
                    <Text
                      style={[
                        styles.expBadgeText,
                        {
                          color: isExpired
                            ? colors.danger
                            : isSoon
                              ? colors.warning
                              : colors.textSecondary,
                        },
                      ]}
                    >
                      {expLabel}
                    </Text>
                  </View>
                ) : null}
                {showLocationTag ? (
                  <Text style={styles.locSub}>
                    {PANTRY_LOCATION_LABELS[language][item.location]}
                  </Text>
                ) : null}
                {item.notes ? (
                  <Text style={styles.noteSub} numberOfLines={1}>
                    {item.notes}
                  </Text>
                ) : null}
              </View>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </Pressable>

          {/* Fast 1-tap Stock Level Toggle + Send to Groceries */}
          <View style={styles.controlsRow}>
            <View style={styles.stockSegment}>
              {STOCK_LEVELS.map((lvl) => {
                const active = item.stockLevel === lvl.id;
                const activeBg =
                  lvl.id === 'in_stock'
                    ? colors.primary
                    : lvl.id === 'low'
                      ? colors.warning
                      : colors.danger;
                return (
                  <Pressable
                    key={lvl.id}
                    onPress={() => handleQuickStock(item, lvl.id)}
                    style={[
                      styles.stockPill,
                      active && { backgroundColor: activeBg },
                    ]}
                  >
                    <Text
                      style={[
                        styles.stockPillText,
                        active && { color: colors.white },
                      ]}
                    >
                      {STOCK_LEVEL_LABELS[language][lvl.id]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {item.stockLevel !== 'in_stock' ? (
              <Pressable
                onPress={() => handleSendToGroceries(item)}
                style={({ pressed }) => [
                  styles.restockBtn,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Ionicons name="cart-outline" size={14} color={colors.accentText} />
                <Text style={styles.restockText}>{t.addToListShort}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AppHeader
        title={t.pantryTitle}
        subtitle={t.pantrySubtitle(inStockCount, lowOutCount)}
        onOpenSettings={() => setSettingsOpen(true)}
        rightSlot={
          <Pressable
            onPress={() => {
              hapticSelection();
              setEditingItem(null);
              setDefaultLoc('fridge');
              setModalVisible(true);
            }}
            style={({ pressed }) => [styles.newBtn, pressed && { opacity: 0.85 }]}
          >
            <Ionicons name="add" size={18} color={colors.white} />
            <Text style={styles.newBtnText}>{t.add}</Text>
          </Pressable>
        }
      />

      {/* Search + filter chips */}
      <View style={styles.topControls}>
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={18} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t.searchPantryPlaceholder}
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.filterRow}>
          {(
            [
              { id: 'all', label: t.filterAll(pantryItems.length) },
              {
                id: 'expiring',
                label: t.filterExpiring(
                  pantryItems.filter(
                    (i) => i.stockLevel !== 'out' && isExpiringSoon(i.expiresAt, 3)
                  ).length
                ),
              },
              { id: 'low_out', label: t.filterLowOut(lowOutCount) },
            ] as { id: FilterMode; label: string }[]
          ).map((f) => {
            const active = filter === f.id;
            return (
              <Pressable
                key={f.id}
                onPress={() => {
                  hapticSelection();
                  setFilter(f.id);
                }}
                style={[styles.filterPill, active && styles.filterPillActive]}
              >
                <Text
                  style={[styles.filterText, active && styles.filterTextActive]}
                >
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {toast ? (
        <View style={styles.toast}>
          <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {filteredItems.length === 0 ? (
          <EmptyState
            icon="cube-outline"
            title={pantryItems.length === 0 ? t.pantryEmptyTitle : t.pantryNoMatchTitle}
            description={
              pantryItems.length === 0 ? t.pantryEmptyDesc : t.pantryNoMatchDesc
            }
            actionLabel={pantryItems.length === 0 ? t.addPantryItemBtn : t.showAllBtn}
            onAction={() => {
              if (pantryItems.length === 0) {
                setEditingItem(null);
                setModalVisible(true);
              } else {
                setFilter('all');
                setQuery('');
              }
            }}
          />
        ) : (
          <>
            {/* Expiring Soon Spotlight at the top */}
            {expiringSoonItems.length > 0 ? (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionTitleWrap}>
                    <Ionicons name="alert-circle" size={16} color={colors.warning} />
                    <Text style={[styles.sectionTitle, { color: colors.warning }]}>
                      {t.expiringSoonSection}
                    </Text>
                  </View>
                  <Text style={styles.sectionCount}>{expiringSoonItems.length}</Text>
                </View>
                <View style={[styles.sectionCard, { borderColor: colors.warning }]}>
                  {expiringSoonItems.map((item, idx) =>
                    renderPantryRow(item, idx, true)
                  )}
                </View>
              </View>
            ) : null}

            {/* Grouped by storage location */}
            {filter !== 'expiring'
              ? locationSections.map(({ meta, items }) => (
                  <View key={meta.id} style={styles.section}>
                    <View style={styles.sectionHeader}>
                      <View style={styles.sectionTitleWrap}>
                        <Ionicons name={meta.icon} size={16} color={colors.primary} />
                        <Text style={styles.sectionTitle}>
                          {PANTRY_LOCATION_LABELS[language][meta.id]}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => {
                          hapticSelection();
                          setEditingItem(null);
                          setDefaultLoc(meta.id);
                          setModalVisible(true);
                        }}
                        hitSlop={8}
                      >
                        <Ionicons name="add-circle-outline" size={20} color={colors.textMuted} />
                      </Pressable>
                    </View>
                    <View style={styles.sectionCard}>
                      {items.map((item, idx) => renderPantryRow(item, idx, false))}
                    </View>
                  </View>
                ))
              : null}
          </>
        )}
      </ScrollView>

      <PantryItemModal
        visible={modalVisible}
        editingItem={editingItem}
        defaultLocation={defaultLoc}
        onClose={() => setModalVisible(false)}
        onSave={handleSave}
        onDelete={removePantryItem}
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
    newBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 13,
      height: 40,
      borderRadius: 12,
      backgroundColor: c.primary,
    },
    newBtnText: {
      fontSize: 14,
      fontWeight: '700',
      color: c.white,
    },
    topControls: {
      paddingHorizontal: 16,
      marginBottom: 10,
      gap: 8,
    },
    searchWrap: {
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
      paddingVertical: 10,
      fontSize: 15,
      color: c.text,
    },
    filterRow: {
      flexDirection: 'row',
      gap: 6,
      flexWrap: 'wrap',
    },
    filterPill: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    filterPillActive: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    filterText: {
      fontSize: 12,
      fontWeight: '600',
      color: c.textSecondary,
    },
    filterTextActive: {
      color: c.white,
    },
    toast: {
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
    toastText: {
      fontSize: 13,
      fontWeight: '600',
      color: c.primaryText,
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingBottom: 32,
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
      marginLeft: 14,
    },
    itemBlock: {
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 10,
    },
    itemHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 8,
    },
    itemName: {
      fontSize: 16,
      fontWeight: '700',
      color: c.text,
      flexShrink: 1,
    },
    qtyText: {
      fontSize: 13,
      fontWeight: '600',
      color: c.textSecondary,
    },
    badgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 4,
    },
    expBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
    },
    expBadgeText: {
      fontSize: 11,
      fontWeight: '700',
    },
    locSub: {
      fontSize: 11,
      fontWeight: '600',
      color: c.textMuted,
    },
    noteSub: {
      fontSize: 12,
      color: c.textMuted,
      flexShrink: 1,
    },
    controlsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    stockSegment: {
      flex: 1,
      flexDirection: 'row',
      backgroundColor: c.surfaceAlt,
      borderRadius: 10,
      padding: 3,
      gap: 3,
    },
    stockPill: {
      flex: 1,
      paddingVertical: 7,
      borderRadius: 8,
      alignItems: 'center',
    },
    stockPillText: {
      fontSize: 12,
      fontWeight: '700',
      color: c.textSecondary,
    },
    restockBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 11,
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: c.accentSoft,
    },
    restockText: {
      fontSize: 12,
      fontWeight: '700',
      color: c.accentText,
    },
  });
