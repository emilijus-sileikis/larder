import React, { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  GROCERY_CATEGORIES,
  PANTRY_LOCATIONS,
  PANTRY_LOCATION_MAP,
  STOCK_LEVELS,
} from '@/constants/categories';
import { useLarder } from '@/db/LarderContext';
import {
  GROCERY_CATEGORY_LABELS,
  PANTRY_LOCATION_LABELS,
  STOCK_LEVEL_LABELS,
} from '@/i18n/translations';
import type { ThemeColors } from '@/theme/colors';
import type {
  GroceryCategory,
  PantryItem,
  PantryItemInput,
  PantryLocation,
  StockLevel,
} from '@/types/larder';
import { addDaysIso, getTodayIso, parseIsoDate } from '@/utils/dates';
import { hapticSelection, hapticSuccess } from '@/utils/haptics';

interface PantryItemModalProps {
  visible: boolean;
  editingItem: PantryItem | null;
  defaultLocation?: PantryLocation;
  onClose: () => void;
  onSave: (input: PantryItemInput, editingId?: number) => Promise<void>;
  onDelete?: (id: number) => Promise<void>;
}

function PantryItemForm({
  editingItem,
  defaultLocation,
  onClose,
  onSave,
  onDelete,
}: {
  editingItem: PantryItem | null;
  defaultLocation: PantryLocation;
  onClose: () => void;
  onSave: PantryItemModalProps['onSave'];
  onDelete?: PantryItemModalProps['onDelete'];
}) {
  const { colors, language, t } = useLarder();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [name, setName] = useState(editingItem?.name ?? '');
  const [location, setLocation] = useState<PantryLocation>(
    editingItem?.location ?? defaultLocation
  );
  const [stockLevel, setStockLevel] = useState<StockLevel>(
    editingItem?.stockLevel ?? 'in_stock'
  );
  const [qtyText, setQtyText] = useState(
    editingItem && editingItem.quantity !== null ? String(editingItem.quantity) : ''
  );
  const [unit, setUnit] = useState(editingItem?.unit ?? '');
  const [category, setCategory] = useState<GroceryCategory>(
    editingItem?.category ?? PANTRY_LOCATION_MAP[defaultLocation].defaultGroceryCategory
  );
  const [expiresAt, setExpiresAt] = useState(editingItem?.expiresAt ?? '');
  const [notes, setNotes] = useState(editingItem?.notes ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert(t.missingNameTitle, t.missingNameMsg);
      return;
    }

    let parsedQty: number | null = null;
    if (qtyText.trim()) {
      const n = Number(qtyText.replace(',', '.'));
      if (!Number.isFinite(n) || n <= 0) {
        Alert.alert(t.invalidQtyTitle, t.invalidQtyMsg);
        return;
      }
      parsedQty = Math.round(n * 100) / 100;
    }

    const trimmedExp = expiresAt.trim();
    if (trimmedExp && !parseIsoDate(trimmedExp)) {
      Alert.alert(t.invalidDateTitle, t.invalidDateMsg);
      return;
    }

    try {
      setSaving(true);
      await onSave(
        {
          name: trimmed,
          location,
          stockLevel,
          quantity: parsedQty,
          unit: unit.trim(),
          category,
          expiresAt: trimmedExp || null,
          notes: notes.trim(),
        },
        editingItem?.id
      );
      hapticSuccess();
      onClose();
    } catch (e) {
      Alert.alert(t.saveFailedTitle, e instanceof Error ? e.message : t.saveFailedTitle);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!editingItem || !onDelete) return;
    Alert.alert(t.removePantryItemTitle, t.removePantryItemMsg(editingItem.name), [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.deleteLabel,
        style: 'destructive',
        onPress: async () => {
          await onDelete(editingItem.id);
          onClose();
        },
      },
    ]);
  };

  const expiryPresets = [
    { label: t.expiryPresetDays(2), days: 2 },
    { label: t.expiryPresetDays(5), days: 5 },
    { label: t.expiryPresetWeek, days: 7 },
    { label: t.expiryPresetMonth, days: 30 },
  ];

  return (
    <KeyboardAvoidingView
      style={[styles.sheet, { paddingTop: Math.max(insets.top, 16) }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <Text style={styles.title}>
          {editingItem ? t.editPantryTitle : t.addToPantryTitle}
        </Text>
        <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8}>
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 24) },
        ]}
      >
        <Text style={styles.label}>{t.itemNameLabel}</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={t.pantryNamePlaceholder}
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          autoFocus={!editingItem}
        />

        <Text style={styles.label}>{t.storageLocationLabel}</Text>
        <View style={styles.chipGrid}>
          {PANTRY_LOCATIONS.map((loc) => {
            const active = location === loc.id;
            return (
              <Pressable
                key={loc.id}
                onPress={() => {
                  hapticSelection();
                  setLocation(loc.id);
                  if (!editingItem) {
                    setCategory(loc.defaultGroceryCategory);
                  }
                }}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Ionicons
                  name={loc.icon}
                  size={15}
                  color={active ? colors.white : colors.textSecondary}
                />
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {PANTRY_LOCATION_LABELS[language][loc.id]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.label}>{t.stockLevelLabel}</Text>
        <View style={styles.stockRow}>
          {STOCK_LEVELS.map((lvl) => {
            const active = stockLevel === lvl.id;
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
                  hapticSelection();
                  setStockLevel(lvl.id);
                }}
                style={[
                  styles.stockBtn,
                  active && { backgroundColor: activeBg, borderColor: activeBg },
                ]}
              >
                <Text style={[styles.stockText, active && { color: colors.white }]}>
                  {STOCK_LEVEL_LABELS[language][lvl.id]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>{t.qtyOptionalLabel}</Text>
            <TextInput
              value={qtyText}
              onChangeText={setQtyText}
              keyboardType="decimal-pad"
              placeholder="500"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>{t.unitOptionalLabel}</Text>
            <TextInput
              value={unit}
              onChangeText={setUnit}
              placeholder={t.unitPlaceholder}
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              style={styles.input}
            />
          </View>
        </View>

        <Text style={styles.label}>{t.expiryOptionalLabel}</Text>
        <TextInput
          value={expiresAt}
          onChangeText={setExpiresAt}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
        />
        <View style={styles.presetRow}>
          {expiryPresets.map((p) => (
            <Pressable
              key={p.label}
              onPress={() => {
                hapticSelection();
                setExpiresAt(addDaysIso(getTodayIso(), p.days));
              }}
              style={styles.presetPill}
            >
              <Text style={styles.presetText}>{p.label}</Text>
            </Pressable>
          ))}
          {expiresAt ? (
            <Pressable
              onPress={() => setExpiresAt('')}
              style={[styles.presetPill, { borderColor: colors.danger }]}
            >
              <Text style={[styles.presetText, { color: colors.danger }]}>
                {t.clear}
              </Text>
            </Pressable>
          ) : null}
        </View>

        <Text style={styles.label}>{t.aisleRestockLabel}</Text>
        <View style={styles.chipGrid}>
          {GROCERY_CATEGORIES.map((cat) => {
            const active = category === cat.id;
            return (
              <Pressable
                key={cat.id}
                onPress={() => {
                  hapticSelection();
                  setCategory(cat.id);
                }}
                style={[styles.chip, active && styles.chipAccentActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {GROCERY_CATEGORY_LABELS[language][cat.id].shortLabel}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.label}>{t.notesOptionalLabel}</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder={t.notesPlaceholder}
          placeholderTextColor={colors.textMuted}
          style={styles.input}
        />

        <Pressable
          disabled={saving}
          onPress={handleSave}
          style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.saveBtnText}>
            {saving ? t.saving : editingItem ? t.saveChanges : t.addToPantryTitle}
          </Text>
        </Pressable>

        {editingItem && onDelete ? (
          <Pressable onPress={handleDelete} style={styles.deleteBtn}>
            <Ionicons name="trash-outline" size={16} color={colors.danger} />
            <Text style={styles.deleteBtnText}>{t.deleteItemBtn}</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function PantryItemModal({
  visible,
  editingItem,
  defaultLocation = 'fridge',
  onClose,
  onSave,
  onDelete,
}: PantryItemModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      {visible ? (
        <PantryItemForm
          key={editingItem ? `edit-${editingItem.id}` : `new-${defaultLocation}`}
          editingItem={editingItem}
          defaultLocation={defaultLocation}
          onClose={onClose}
          onSave={onSave}
          onDelete={onDelete}
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
    label: {
      fontSize: 12,
      fontWeight: '700',
      color: c.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 6,
      marginTop: 12,
    },
    input: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: c.text,
    },
    row: {
      flexDirection: 'row',
      gap: 10,
    },
    chipGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    chipActive: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    chipAccentActive: {
      backgroundColor: c.accent,
      borderColor: c.accent,
    },
    chipText: {
      fontSize: 13,
      fontWeight: '600',
      color: c.textSecondary,
    },
    chipTextActive: {
      color: c.white,
    },
    stockRow: {
      flexDirection: 'row',
      gap: 8,
    },
    stockBtn: {
      flex: 1,
      paddingVertical: 11,
      borderRadius: 12,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
    },
    stockText: {
      fontSize: 13,
      fontWeight: '700',
      color: c.textSecondary,
    },
    presetRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 8,
      flexWrap: 'wrap',
    },
    presetPill: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: c.surfaceAlt,
      borderWidth: 1,
      borderColor: c.border,
    },
    presetText: {
      fontSize: 12,
      fontWeight: '600',
      color: c.textSecondary,
    },
    saveBtn: {
      marginTop: 22,
      paddingVertical: 14,
      borderRadius: 14,
      backgroundColor: c.primary,
      alignItems: 'center',
    },
    saveBtnText: {
      fontSize: 16,
      fontWeight: '700',
      color: c.white,
    },
    deleteBtn: {
      marginTop: 12,
      paddingVertical: 12,
      borderRadius: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    deleteBtnText: {
      fontSize: 14,
      fontWeight: '600',
      color: c.danger,
    },
  });
