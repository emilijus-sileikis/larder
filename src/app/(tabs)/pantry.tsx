import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '@/components/AppHeader';
import { BarcodeScannerModal } from '@/components/BarcodeScannerModal';
import { EmptyState } from '@/components/EmptyState';
import { PantryItemModal } from '@/components/PantryItemModal';
import { SettingsModal } from '@/components/SettingsModal';
import { SwipeableRow } from '@/components/SwipeableRow';
import { UndoSnackbar } from '@/components/UndoSnackbar';
import { PANTRY_LOCATIONS, STOCK_LEVELS } from '@/constants/categories';
import { useLarder } from '@/db/LarderContext';
import { PANTRY_LOCATION_LABELS, STOCK_LEVEL_LABELS } from '@/i18n/translations';
import type { BarcodeLookupResult } from '@/services/barcodeService';
import type { ThemeColors } from '@/theme/colors';
import type {
  IoniconName,
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

interface PantrySection {
  key: string;
  title: string;
  icon: IoniconName;
  isExpiringSection: boolean;
  locationId?: PantryLocation;
  data: PantryItem[];
}

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
    restorePantryItem,
    sendPantryItemToGroceries,
    restockAllLowAndOutPantry,
  } = useLarder();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<PantryItem | null>(null);
  const [scannedPrefill, setScannedPrefill] = useState<BarcodeLookupResult | null>(null);
  const [defaultLoc, setDefaultLoc] = useState<PantryLocation>('fridge');

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterMode>('all');

  const [snackbar, setSnackbar] = useState<{
    message: string;
    undoItem?: PantryItem;
  } | null>(null);
  const snackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (snackTimerRef.current) clearTimeout(snackTimerRef.current);
    };
  }, []);

  const showSnackbar = (message: string, undoItem?: PantryItem) => {
    if (snackTimerRef.current) clearTimeout(snackTimerRef.current);
    setSnackbar({ message, undoItem });
    snackTimerRef.current = setTimeout(() => {
      setSnackbar(null);
    }, undoItem ? 4200 : 2400);
  };

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pantryItems.filter((item) => {
      if (
        filter === 'expiring' &&
        !(item.stockLevel !== 'out' && isExpiringSoon(item.expiresAt, 3))
      ) {
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

  const sections = useMemo<PantrySection[]>(() => {
    const expiringSoon = filteredItems
      .filter((i) => i.stockLevel !== 'out' && isExpiringSoon(i.expiresAt, 3))
      .sort(
        (a, b) =>
          (getDaysUntilExpiry(a.expiresAt) ?? 99) -
          (getDaysUntilExpiry(b.expiresAt) ?? 99)
      );

    const expiringIds = new Set(expiringSoon.map((i) => i.id));
    const list: PantrySection[] = [];

    if (expiringSoon.length > 0) {
      list.push({
        key: '__expiring__',
        title: t.expiringSoonSection,
        icon: 'alert-circle',
        isExpiringSection: true,
        data: expiringSoon,
      });
    }

    if (filter !== 'expiring') {
      const byLoc = new Map<PantryLocation, PantryItem[]>();
      for (const item of filteredItems) {
        if (filter === 'all' && expiringIds.has(item.id)) continue;
        const arr = byLoc.get(item.location) ?? [];
        arr.push(item);
        byLoc.set(item.location, arr);
      }
      for (const meta of PANTRY_LOCATIONS) {
        const items = byLoc.get(meta.id) ?? [];
        if (items.length > 0) {
          list.push({
            key: meta.id,
            title: PANTRY_LOCATION_LABELS[language][meta.id],
            icon: meta.icon,
            isExpiringSection: false,
            locationId: meta.id,
            data: items,
          });
        }
      }
    }

    return list;
  }, [filteredItems, filter, language, t]);

  const inStockCount = useMemo(
    () => pantryItems.filter((i) => i.stockLevel === 'in_stock').length,
    [pantryItems]
  );
  const lowOutCount = useMemo(
    () => pantryItems.filter((i) => i.stockLevel !== 'in_stock').length,
    [pantryItems]
  );
  const expiringTotalCount = useMemo(
    () =>
      pantryItems.filter(
        (i) => i.stockLevel !== 'out' && isExpiringSoon(i.expiresAt, 3)
      ).length,
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
    showSnackbar(t.addedToGroceriesToast(item.name));
  };

  const handleRestockAll = async () => {
    const res = await restockAllLowAndOutPantry();
    if (res.added + res.merged > 0) {
      hapticSuccess();
      showSnackbar(t.restockedAllToast(res.added, res.merged));
    }
  };

  const handleSwipeDelete = async (item: PantryItem) => {
    await removePantryItem(item.id);
    showSnackbar(t.deletedItemToast(item.name), item);
  };

  const handleUndoDelete = async () => {
    if (!snackbar?.undoItem) return;
    const toRestore = snackbar.undoItem;
    setSnackbar(null);
    await restorePantryItem(toRestore);
    hapticSuccess();
  };

  const handleBarcodeResult = (result: BarcodeLookupResult) => {
    setEditingItem(null);
    setScannedPrefill(result);
    setDefaultLoc(result.location);
    setModalVisible(true);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AppHeader
        title={t.pantryTitle}
        subtitle={t.pantrySubtitle(inStockCount, lowOutCount)}
        onOpenSettings={() => setSettingsOpen(true)}
        rightSlot={
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => {
                hapticSelection();
                setScannerOpen(true);
              }}
              style={({ pressed }) => [styles.scanBtn, pressed && { opacity: 0.8 }]}
              accessibilityLabel={t.scanBarcodeTitle}
            >
              <Ionicons name="barcode-outline" size={20} color={colors.accentText} />
            </Pressable>
            <Pressable
              onPress={() => {
                hapticSelection();
                setEditingItem(null);
                setScannedPrefill(null);
                setDefaultLoc('fridge');
                setModalVisible(true);
              }}
              style={({ pressed }) => [styles.newBtn, pressed && { opacity: 0.85 }]}
            >
              <Ionicons name="add" size={18} color={colors.white} />
              <Text style={styles.newBtnText}>{t.add}</Text>
            </Pressable>
          </View>
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
              { id: 'expiring', label: t.filterExpiring(expiringTotalCount) },
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

        {lowOutCount > 0 ? (
          <Pressable
            onPress={handleRestockAll}
            style={({ pressed }) => [styles.restockAllBtn, pressed && { opacity: 0.85 }]}
          >
            <Ionicons name="cart-outline" size={16} color={colors.accentText} />
            <Text style={styles.restockAllText}>{t.restockAllBtn(lowOutCount)}</Text>
          </Pressable>
        ) : null}
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => String(item.id)}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.scrollContent}
        ListEmptyComponent={
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
                setScannedPrefill(null);
                setModalVisible(true);
              } else {
                setFilter('all');
                setQuery('');
              }
            }}
          />
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleWrap}>
              <Ionicons
                name={section.icon}
                size={16}
                color={section.isExpiringSection ? colors.warning : colors.primary}
              />
              <Text
                style={[
                  styles.sectionTitle,
                  section.isExpiringSection && { color: colors.warning },
                ]}
              >
                {section.title}
              </Text>
            </View>
            {section.locationId ? (
              <Pressable
                onPress={() => {
                  hapticSelection();
                  setEditingItem(null);
                  setScannedPrefill(null);
                  setDefaultLoc(section.locationId!);
                  setModalVisible(true);
                }}
                hitSlop={8}
              >
                <Ionicons name="add-circle-outline" size={20} color={colors.textMuted} />
              </Pressable>
            ) : (
              <Text style={styles.sectionCount}>{section.data.length}</Text>
            )}
          </View>
        )}
        renderItem={({ item, index, section }) => {
          const isFirst = index === 0;
          const isLast = index === section.data.length - 1;
          const qtyLabel = formatQuantityWithUnit(item.quantity, item.unit);
          const expLabel = formatExpiryLabel(item.expiresAt, language);
          const expDays = getDaysUntilExpiry(item.expiresAt);
          const isExpired = expDays !== null && expDays < 0;
          const isSoon = expDays !== null && expDays >= 0 && expDays <= 3;

          return (
            <View
              style={[
                styles.cardSlice,
                section.isExpiringSection && { borderColor: colors.warning },
                isFirst && styles.cardFirst,
                isLast && styles.cardLast,
              ]}
            >
              {!isFirst ? <View style={styles.rowDivider} /> : null}
              <SwipeableRow onDelete={() => handleSwipeDelete(item)}>
                <View style={styles.itemBlock}>
                  <Pressable
                    onPress={() => {
                      hapticSelection();
                      setScannedPrefill(null);
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
                        {section.isExpiringSection ? (
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
              </SwipeableRow>
            </View>
          );
        }}
        renderSectionFooter={() => <View style={{ height: 18 }} />}
      />

      <UndoSnackbar
        message={snackbar?.message ?? null}
        onUndo={snackbar?.undoItem ? handleUndoDelete : undefined}
      />

      <BarcodeScannerModal
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onResult={handleBarcodeResult}
      />
      <PantryItemModal
        visible={modalVisible}
        editingItem={editingItem}
        defaultLocation={defaultLoc}
        scannedPrefill={scannedPrefill}
        onClose={() => {
          setModalVisible(false);
          setScannedPrefill(null);
        }}
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
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    scanBtn: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: c.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
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
    restockAllBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 9,
      borderRadius: 12,
      backgroundColor: c.accentSoft,
    },
    restockAllText: {
      fontSize: 13,
      fontWeight: '700',
      color: c.accentText,
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingBottom: 68,
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
      marginLeft: 14,
    },
    itemBlock: {
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 10,
      backgroundColor: c.surface,
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
