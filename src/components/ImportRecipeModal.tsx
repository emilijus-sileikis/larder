import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { useLarder } from '@/db/LarderContext';
import {
  importRecipeFromUrl,
  parseRecipeFromText,
} from '@/services/recipeImporter';
import type { ThemeColors } from '@/theme/colors';
import type { RecipeInput } from '@/types/larder';
import { hapticSelection, hapticSuccess } from '@/utils/haptics';

interface ImportRecipeModalProps {
  visible: boolean;
  initialUrl?: string;
  initialText?: string;
  onClose: () => void;
  onImported: (recipe: RecipeInput) => void;
}

type ImportTab = 'url' | 'text';

function ImportRecipeContent({
  initialUrl,
  initialText,
  onClose,
  onImported,
}: {
  initialUrl?: string;
  initialText?: string;
  onClose: () => void;
  onImported: (recipe: RecipeInput) => void;
}) {
  const { colors, t } = useLarder();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [tab, setTab] = useState<ImportTab>(!initialUrl && initialText ? 'text' : 'url');
  const [urlText, setUrlText] = useState(initialUrl ?? '');
  const [rawText, setRawText] = useState(initialText ?? '');
  const [loading, setLoading] = useState(false);
  const autoRanRef = useRef(false);

  const runUrlImport = useCallback(
    async (targetUrl: string) => {
      if (!targetUrl.trim()) {
        Alert.alert(t.importFailedTitle, t.importUrlEmptyMsg);
        return;
      }
      try {
        setLoading(true);
        const parsed = await importRecipeFromUrl(targetUrl);
        hapticSuccess();
        onImported(parsed);
        onClose();
      } catch (e) {
        Alert.alert(
          t.importFailedTitle,
          e instanceof Error ? e.message : 'Could not import recipe.'
        );
      } finally {
        setLoading(false);
      }
    },
    [t, onImported, onClose]
  );

  // Auto-fetch if launched via Android Share-to-Larder with a URL
  useEffect(() => {
    if (initialUrl && !autoRanRef.current) {
      autoRanRef.current = true;
      runUrlImport(initialUrl);
    }
  }, [initialUrl, runUrlImport]);

  const handleImportText = () => {
    if (!rawText.trim()) {
      Alert.alert(t.importFailedTitle, t.importTextEmptyMsg);
      return;
    }
    try {
      const parsed = parseRecipeFromText(rawText);
      hapticSuccess();
      onImported(parsed);
      onClose();
    } catch (e) {
      Alert.alert(
        t.importFailedTitle,
        e instanceof Error ? e.message : 'Could not parse recipe text.'
      );
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.sheet, { paddingTop: Math.max(insets.top, 16) }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <View style={{ flex: 1, paddingRight: 10 }}>
          <Text style={styles.title}>{t.importModalTitle}</Text>
          <Text style={styles.subtitle}>{t.importModalSub}</Text>
        </View>
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
        <View style={styles.segmentRow}>
          <Pressable
            onPress={() => {
              hapticSelection();
              setTab('url');
            }}
            style={[styles.segmentBtn, tab === 'url' && styles.segmentBtnActive]}
          >
            <Ionicons
              name="link-outline"
              size={16}
              color={tab === 'url' ? colors.white : colors.textSecondary}
            />
            <Text style={[styles.segmentText, tab === 'url' && styles.segmentTextActive]}>
              {t.importTabUrl}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              hapticSelection();
              setTab('text');
            }}
            style={[styles.segmentBtn, tab === 'text' && styles.segmentBtnActive]}
          >
            <Ionicons
              name="document-text-outline"
              size={16}
              color={tab === 'text' ? colors.white : colors.textSecondary}
            />
            <Text style={[styles.segmentText, tab === 'text' && styles.segmentTextActive]}>
              {t.importTabText}
            </Text>
          </Pressable>
        </View>

        {tab === 'url' ? (
          <>
            <Text style={styles.label}>{t.importUrlLabel}</Text>
            <TextInput
              value={urlText}
              onChangeText={setUrlText}
              placeholder={t.importUrlPlaceholder}
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="go"
              onSubmitEditing={() => runUrlImport(urlText)}
              style={styles.input}
            />
            <View style={styles.hintBox}>
              <Ionicons
                name="information-circle-outline"
                size={18}
                color={colors.primary}
              />
              <Text style={styles.hintText}>{t.importUrlHint}</Text>
            </View>

            <Pressable
              disabled={loading}
              onPress={() => runUrlImport(urlText)}
              style={({ pressed }) => [
                styles.primaryBtn,
                loading && { opacity: 0.7 },
                pressed && { opacity: 0.88 },
              ]}
            >
              {loading ? (
                <>
                  <ActivityIndicator size="small" color={colors.white} />
                  <Text style={styles.primaryBtnText}>{t.importingBtn}</Text>
                </>
              ) : (
                <>
                  <Ionicons name="sparkles-outline" size={18} color={colors.white} />
                  <Text style={styles.primaryBtnText}>{t.importFetchBtn}</Text>
                </>
              )}
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.label}>{t.importTextLabel}</Text>
            <TextInput
              value={rawText}
              onChangeText={setRawText}
              placeholder={t.importTextPlaceholder}
              placeholderTextColor={colors.textMuted}
              multiline
              style={[styles.input, styles.multilineInput]}
            />
            <Pressable
              onPress={handleImportText}
              style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.88 }]}
            >
              <Ionicons name="sparkles-outline" size={18} color={colors.white} />
              <Text style={styles.primaryBtnText}>{t.importParseBtn}</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function ImportRecipeModal({
  visible,
  initialUrl,
  initialText,
  onClose,
  onImported,
}: ImportRecipeModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      {visible ? (
        <ImportRecipeContent
          key={`${initialUrl ?? ''}-${initialText ?? ''}`}
          initialUrl={initialUrl}
          initialText={initialText}
          onClose={onClose}
          onImported={onImported}
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
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    title: {
      fontSize: 21,
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
    segmentRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 18,
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
      fontWeight: '700',
      color: c.textSecondary,
    },
    segmentTextActive: {
      color: c.white,
    },
    label: {
      fontSize: 12,
      fontWeight: '700',
      color: c.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 6,
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
    multilineInput: {
      minHeight: 200,
      textAlignVertical: 'top',
    },
    hintBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      marginTop: 12,
      padding: 12,
      borderRadius: 12,
      backgroundColor: c.primarySoft,
    },
    hintText: {
      flex: 1,
      fontSize: 13,
      lineHeight: 19,
      color: c.primaryText,
    },
    primaryBtn: {
      marginTop: 18,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 14,
      borderRadius: 14,
      backgroundColor: c.primary,
    },
    primaryBtnText: {
      fontSize: 15,
      fontWeight: '700',
      color: c.white,
    },
  });
