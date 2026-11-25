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
import { GROCERY_CATEGORIES } from '@/constants/categories';
import { useLarder } from '@/db/LarderContext';
import { GROCERY_CATEGORY_LABELS } from '@/i18n/translations';
import type { ThemeColors } from '@/theme/colors';
import type { GroceryCategory, GroceryItem } from '@/types/larder';
import { hapticSelection, hapticSuccess } from '@/utils/haptics';

interface GroceryEditModalProps {
  visible: boolean;
  item: GroceryItem | null;
  onClose: () => void;
  onSave: (
    id: number,
    input: { name: string; quantity: number | null; unit: string; category: GroceryCategory }
  ) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

function GroceryEditContent({
  item,
  onClose,
  onSave,
  onDelete,
}: {
  item: GroceryItem;
  onClose: () => void;
  onSave: GroceryEditModalProps['onSave'];
  onDelete: GroceryEditModalProps['onDelete'];
}) {
  const { colors, language, t } = useLarder();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [name, setName] = useState(item.name);
  const [qtyText, setQtyText] = useState(
    item.quantity !== null ? String(item.quantity) : ''
  );
  const [unit, setUnit] = useState(item.unit);
  const [category, setCategory] = useState<GroceryCategory>(item.category);

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
    await onSave(item.id, {
      name: trimmed,
      quantity: parsedQty,
      unit: unit.trim(),
      category,
    });
    hapticSuccess();
    onClose();
  };

  return (
    <KeyboardAvoidingView
      style={[styles.sheet, { paddingTop: Math.max(insets.top, 16) }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <Text style={styles.title}>{t.editGroceryTitle}</Text>
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
          placeholder={t.itemNamePlaceholder}
          placeholderTextColor={colors.textMuted}
          style={styles.input}
        />

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>{t.quantityLabel}</Text>
            <TextInput
              value={qtyText}
              onChangeText={setQtyText}
              keyboardType="decimal-pad"
              placeholder="e.g. 6"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>{t.unitLabel}</Text>
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

        <Text style={styles.label}>{t.storeAisleLabel}</Text>
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
                style={[styles.chip, active && styles.chipActive]}
              >
                <Ionicons
                  name={cat.icon}
                  size={15}
                  color={active ? colors.white : colors.textSecondary}
                />
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {GROCERY_CATEGORY_LABELS[language][cat.id].label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {item.sourceNote ? (
          <View style={styles.sourceBox}>
            <Ionicons name="restaurant-outline" size={14} color={colors.textSecondary} />
            <Text style={styles.sourceText}>{t.addedFromLabel(item.sourceNote)}</Text>
          </View>
        ) : null}

        <Pressable
          onPress={handleSave}
          style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.saveBtnText}>{t.saveChanges}</Text>
        </Pressable>

        <Pressable
          onPress={async () => {
            await onDelete(item.id);
            onClose();
          }}
          style={styles.deleteBtn}
        >
          <Ionicons name="trash-outline" size={16} color={colors.danger} />
          <Text style={styles.deleteBtnText}>{t.removeFromList}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function GroceryEditModal({
  visible,
  item,
  onClose,
  onSave,
  onDelete,
}: GroceryEditModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      {visible && item ? (
        <GroceryEditContent
          key={item.id}
          item={item}
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
    chipText: {
      fontSize: 13,
      fontWeight: '600',
      color: c.textSecondary,
    },
    chipTextActive: {
      color: c.white,
    },
    sourceBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 16,
      padding: 12,
      borderRadius: 12,
      backgroundColor: c.surfaceAlt,
    },
    sourceText: {
      flex: 1,
      fontSize: 13,
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
