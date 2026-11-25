import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLarder } from '@/db/LarderContext';
import { THEME_MODE_LABELS, type Language } from '@/i18n/translations';
import type { ThemeColors } from '@/theme/colors';
import type { ThemeMode } from '@/types/larder';
import { hapticSelection, hapticSuccess, hapticWarning } from '@/utils/haptics';

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
}

const THEME_OPTIONS: {
  id: ThemeMode;
  icon: 'phone-portrait-outline' | 'sunny-outline' | 'moon-outline';
}[] = [
  { id: 'system', icon: 'phone-portrait-outline' },
  { id: 'light', icon: 'sunny-outline' },
  { id: 'dark', icon: 'moon-outline' },
];

const LANGUAGE_OPTIONS: { id: Language; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'lt', label: 'Lietuvių' },
];

export function SettingsModal({ visible, onClose }: SettingsModalProps) {
  const {
    colors,
    language,
    setLanguage,
    t,
    themeMode,
    setThemeMode,
    recipes,
    pantryItems,
    groceryItems,
    mealPlanEntries,
    exportBackup,
    importBackup,
    loadSampleData,
    clearAllData,
  } = useLarder();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const handleExport = async () => {
    try {
      setBusyAction('export');
      const shared = await exportBackup();
      if (shared) {
        hapticSuccess();
      } else {
        Alert.alert(t.sharingUnavailableTitle, t.sharingUnavailableMsg);
      }
    } catch (e) {
      Alert.alert(
        t.exportFailedTitle,
        e instanceof Error ? e.message : t.exportFailedTitle
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleImport = () => {
    Alert.alert(t.restoreTitle, t.restoreMsg, [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.chooseFile,
        onPress: async () => {
          try {
            setBusyAction('import');
            const res = await importBackup();
            if (res.imported) {
              hapticSuccess();
              Alert.alert(
                t.backupRestoredTitle,
                t.backupRestoredMsg(res.recipes, res.pantry, res.groceries)
              );
            }
          } catch (e) {
            Alert.alert(
              t.restoreFailedTitle,
              e instanceof Error ? e.message : t.restoreFailedTitle
            );
          } finally {
            setBusyAction(null);
          }
        },
      },
    ]);
  };

  const handleLoadSample = () => {
    Alert.alert(t.loadSampleTitle, t.loadSampleConfirmMsg, [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.loadSampleTitle,
        onPress: async () => {
          try {
            setBusyAction('sample');
            await loadSampleData();
            hapticSuccess();
            Alert.alert(t.sampleLoadedTitle, t.sampleLoadedMsg);
          } catch (e) {
            Alert.alert(
              t.errorTitle,
              e instanceof Error ? e.message : t.errorTitle
            );
          } finally {
            setBusyAction(null);
          }
        },
      },
    ]);
  };

  const handleClearAll = () => {
    hapticWarning();
    Alert.alert(t.clearAllTitle, t.clearAllConfirmMsg, [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.clearEverythingBtn,
        style: 'destructive',
        onPress: async () => {
          try {
            setBusyAction('clear');
            await clearAllData();
            hapticSuccess();
          } catch (e) {
            Alert.alert(
              t.errorTitle,
              e instanceof Error ? e.message : t.errorTitle
            );
          } finally {
            setBusyAction(null);
          }
        },
      },
    ]);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.sheet, { paddingTop: Math.max(insets.top, 16) }]}>
        <View style={styles.header}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={styles.title}>{t.settingsTitle}</Text>
            <Text style={styles.subtitle}>{t.settingsSub}</Text>
          </View>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.7 }]}
            hitSlop={8}
          >
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: Math.max(insets.bottom, 24) },
          ]}
        >
          {/* Stats strip */}
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{recipes.length}</Text>
              <Text style={styles.statLabel}>{t.statRecipes}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{pantryItems.length}</Text>
              <Text style={styles.statLabel}>{t.statPantry}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{mealPlanEntries.length}</Text>
              <Text style={styles.statLabel}>{t.statPlanned}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{groceryItems.length}</Text>
              <Text style={styles.statLabel}>{t.statGroceries}</Text>
            </View>
          </View>

          {/* Language */}
          <Text style={styles.sectionTitle}>{t.languageSection}</Text>
          <View style={styles.segmentRow}>
            {LANGUAGE_OPTIONS.map((opt) => {
              const active = language === opt.id;
              return (
                <Pressable
                  key={opt.id}
                  onPress={() => {
                    hapticSelection();
                    setLanguage(opt.id);
                  }}
                  style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                >
                  <Ionicons
                    name="language-outline"
                    size={16}
                    color={active ? colors.white : colors.textSecondary}
                  />
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Appearance */}
          <Text style={styles.sectionTitle}>{t.appearanceSection}</Text>
          <View style={styles.segmentRow}>
            {THEME_OPTIONS.map((opt) => {
              const active = themeMode === opt.id;
              return (
                <Pressable
                  key={opt.id}
                  onPress={() => {
                    hapticSelection();
                    setThemeMode(opt.id);
                  }}
                  style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                >
                  <Ionicons
                    name={opt.icon}
                    size={16}
                    color={active ? colors.white : colors.textSecondary}
                  />
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                    {THEME_MODE_LABELS[language][opt.id]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Backup & Restore */}
          <Text style={styles.sectionTitle}>{t.backupSection}</Text>
          <View style={styles.card}>
            <Pressable
              disabled={busyAction !== null}
              onPress={handleExport}
              style={({ pressed }) => [styles.rowBtn, pressed && styles.rowPressed]}
            >
              <View style={[styles.rowIcon, { backgroundColor: colors.primarySoft }]}>
                <Ionicons name="share-outline" size={20} color={colors.primary} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{t.exportJsonTitle}</Text>
                <Text style={styles.rowDesc}>{t.exportJsonDesc}</Text>
              </View>
              {busyAction === 'export' ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              )}
            </Pressable>

            <View style={styles.divider} />

            <Pressable
              disabled={busyAction !== null}
              onPress={handleImport}
              style={({ pressed }) => [styles.rowBtn, pressed && styles.rowPressed]}
            >
              <View style={[styles.rowIcon, { backgroundColor: colors.accentSoft }]}>
                <Ionicons name="download-outline" size={20} color={colors.accent} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{t.importJsonTitle}</Text>
                <Text style={styles.rowDesc}>{t.importJsonDesc}</Text>
              </View>
              {busyAction === 'import' ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              )}
            </Pressable>
          </View>

          {/* Data management */}
          <Text style={styles.sectionTitle}>{t.dataSection}</Text>
          <View style={styles.card}>
            <Pressable
              disabled={busyAction !== null}
              onPress={handleLoadSample}
              style={({ pressed }) => [styles.rowBtn, pressed && styles.rowPressed]}
            >
              <View style={[styles.rowIcon, { backgroundColor: colors.primarySoft }]}>
                <Ionicons name="sparkles-outline" size={20} color={colors.primary} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{t.loadSampleTitle}</Text>
                <Text style={styles.rowDesc}>{t.loadSampleDesc}</Text>
              </View>
              {busyAction === 'sample' ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              )}
            </Pressable>

            <View style={styles.divider} />

            <Pressable
              disabled={busyAction !== null}
              onPress={handleClearAll}
              style={({ pressed }) => [styles.rowBtn, pressed && styles.rowPressed]}
            >
              <View style={[styles.rowIcon, { backgroundColor: colors.dangerSoft }]}>
                <Ionicons name="trash-outline" size={20} color={colors.danger} />
              </View>
              <View style={styles.rowText}>
                <Text style={[styles.rowTitle, { color: colors.danger }]}>
                  {t.clearAllTitle}
                </Text>
                <Text style={styles.rowDesc}>{t.clearAllDesc}</Text>
              </View>
              {busyAction === 'clear' ? (
                <ActivityIndicator size="small" color={colors.danger} />
              ) : (
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              )}
            </Pressable>
          </View>
        </ScrollView>
      </View>
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
      fontSize: 22,
      fontWeight: '700',
      color: c.text,
    },
    subtitle: {
      marginTop: 2,
      fontSize: 12,
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
    content: {
      padding: 20,
    },
    statsRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 22,
    },
    statCard: {
      flex: 1,
      backgroundColor: c.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      paddingVertical: 12,
      alignItems: 'center',
    },
    statNumber: {
      fontSize: 20,
      fontWeight: '700',
      color: c.text,
    },
    statLabel: {
      marginTop: 2,
      fontSize: 10,
      fontWeight: '600',
      color: c.textSecondary,
    },
    sectionTitle: {
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.7,
      color: c.textSecondary,
      marginBottom: 8,
      marginTop: 4,
    },
    segmentRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 20,
    },
    segmentBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 11,
      borderRadius: 12,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    segmentBtnActive: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    segmentText: {
      fontSize: 13,
      fontWeight: '600',
      color: c.textSecondary,
    },
    segmentTextActive: {
      color: c.white,
    },
    card: {
      backgroundColor: c.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 22,
      overflow: 'hidden',
    },
    rowBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 14,
      gap: 12,
    },
    rowPressed: {
      backgroundColor: c.surfaceAlt,
    },
    rowIcon: {
      width: 38,
      height: 38,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowText: {
      flex: 1,
    },
    rowTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: c.text,
    },
    rowDesc: {
      marginTop: 2,
      fontSize: 12,
      color: c.textSecondary,
    },
    divider: {
      height: 1,
      backgroundColor: c.border,
      marginLeft: 64,
    },
  });
