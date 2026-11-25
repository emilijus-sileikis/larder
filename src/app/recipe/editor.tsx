import React, { useMemo, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ImportRecipeModal } from '@/components/ImportRecipeModal';
import { GROCERY_CATEGORIES } from '@/constants/categories';
import { useLarder } from '@/db/LarderContext';
import {
  DEFAULT_TAGS_BY_LANG,
  GROCERY_CATEGORY_LABELS,
} from '@/i18n/translations';
import {
  deleteLocalPhoto,
  pickRecipePhotoFromLibrary,
  takeRecipePhotoWithCamera,
} from '@/services/photoService';
import type { ThemeColors } from '@/theme/colors';
import type {
  GroceryCategory,
  RecipeIngredientInput,
  RecipeInput,
} from '@/types/larder';
import { hapticLight, hapticSelection, hapticSuccess } from '@/utils/haptics';

interface DraftIngredient {
  key: string;
  name: string;
  qtyText: string;
  unit: string;
  category: GroceryCategory;
}

interface DraftStep {
  key: string;
  text: string;
}

function makeDraftKey(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function RecipeEditorScreen() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const rawId = Array.isArray(id) ? id[0] : id;
  const editingId = rawId ? Number(rawId) : null;
  const {
    colors,
    language,
    t,
    recipes,
    addRecipe,
    editRecipe,
    pendingImportedRecipe,
    setPendingImportedRecipe,
  } = useLarder();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const existing = useMemo(
    () => (editingId ? recipes.find((r) => r.id === editingId) ?? null : null),
    [recipes, editingId]
  );

  // Initial source is either existing recipe (edit mode) or pending imported draft (new mode)
  const initialDraft = existing ?? pendingImportedRecipe;

  const [title, setTitle] = useState(initialDraft?.title ?? '');
  const [description, setDescription] = useState(initialDraft?.description ?? '');
  const [servingsText, setServingsText] = useState(
    initialDraft ? String(initialDraft.servings) : '2'
  );
  const [prepText, setPrepText] = useState(
    initialDraft ? String(initialDraft.prepMinutes) : '10'
  );
  const [cookText, setCookText] = useState(
    initialDraft ? String(initialDraft.cookMinutes) : '15'
  );
  const [photoUri, setPhotoUri] = useState<string | null>(initialDraft?.photoUri ?? null);
  const [newlyPickedPhotos, setNewlyPickedPhotos] = useState<string[]>(() =>
    !existing && pendingImportedRecipe?.photoUri
      ? [pendingImportedRecipe.photoUri]
      : []
  );
  const [tags, setTags] = useState<string[]>(initialDraft?.tags ?? []);
  const [customTag, setCustomTag] = useState('');
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importBanner, setImportBanner] = useState(
    !existing && pendingImportedRecipe !== null
  );

  const [ingredients, setIngredients] = useState<DraftIngredient[]>(() => {
    if (initialDraft && initialDraft.ingredients.length > 0) {
      return initialDraft.ingredients.map((ing) => ({
        key: makeDraftKey(),
        name: ing.name,
        qtyText: ing.quantity !== null ? String(ing.quantity) : '',
        unit: ing.unit,
        category: ing.category,
      }));
    }
    return [{ key: makeDraftKey(), name: '', qtyText: '', unit: '', category: 'produce' }];
  });

  const [steps, setSteps] = useState<DraftStep[]>(() =>
    initialDraft && initialDraft.steps.length > 0
      ? initialDraft.steps.map((text) => ({ key: makeDraftKey(), text }))
      : [{ key: makeDraftKey(), text: '' }]
  );

  const [saving, setSaving] = useState(false);

  const applyImportedDraft = (draft: RecipeInput) => {
    setTitle(draft.title);
    setDescription(draft.description ?? '');
    setServingsText(String(draft.servings));
    setPrepText(String(draft.prepMinutes));
    setCookText(String(draft.cookMinutes));
    if (draft.photoUri) {
      setNewlyPickedPhotos((prev) => [...prev, draft.photoUri!]);
      setPhotoUri(draft.photoUri);
    }
    setTags(draft.tags);
    setIngredients(
      draft.ingredients.length > 0
        ? draft.ingredients.map((ing) => ({
            key: makeDraftKey(),
            name: ing.name,
            qtyText: ing.quantity !== null ? String(ing.quantity) : '',
            unit: ing.unit,
            category: ing.category,
          }))
        : [{ key: makeDraftKey(), name: '', qtyText: '', unit: '', category: 'produce' }]
    );
    setSteps(
      draft.steps.length > 0
        ? draft.steps.map((text) => ({ key: makeDraftKey(), text }))
        : [{ key: makeDraftKey(), text: '' }]
    );
    setImportBanner(true);
  };

  const availableTags = useMemo(() => {
    const merged = new Set([...DEFAULT_TAGS_BY_LANG[language], ...tags]);
    return Array.from(merged);
  }, [language, tags]);

  const toggleTag = (tag: string) => {
    hapticSelection();
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]
    );
  };

  const handleAddCustomTag = () => {
    const trimmed = customTag.trim();
    if (!trimmed) return;
    if (!tags.includes(trimmed)) {
      setTags((prev) => [...prev, trimmed]);
    }
    setCustomTag('');
  };

  const handlePickPhoto = async (source: 'library' | 'camera') => {
    try {
      const uri =
        source === 'library'
          ? await pickRecipePhotoFromLibrary()
          : await takeRecipePhotoWithCamera();
      if (uri) {
        hapticSuccess();
        setNewlyPickedPhotos((prev) => [...prev, uri]);
        setPhotoUri(uri);
      }
    } catch (e) {
      Alert.alert(
        t.photoErrorTitle,
        e instanceof Error ? e.message : t.photoErrorTitle
      );
    }
  };

  const updateIngredient = (
    key: string,
    patch: Partial<Omit<DraftIngredient, 'key'>>
  ) => {
    setIngredients((prev) =>
      prev.map((item) => (item.key === key ? { ...item, ...patch } : item))
    );
  };

  const addIngredientRow = () => {
    hapticLight();
    setIngredients((prev) => [
      ...prev,
      { key: makeDraftKey(), name: '', qtyText: '', unit: '', category: 'pantry_dry' },
    ]);
  };

  const removeIngredientRow = (key: string) => {
    setIngredients((prev) =>
      prev.length > 1 ? prev.filter((i) => i.key !== key) : prev
    );
  };

  const handleSave = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      Alert.alert(t.titleRequiredTitle, t.titleRequiredMsg);
      return;
    }

    const servings = Math.max(1, Math.round(Number(servingsText) || 2));
    const prepMinutes = Math.max(0, Math.round(Number(prepText) || 0));
    const cookMinutes = Math.max(0, Math.round(Number(cookText) || 0));

    const cleanIngredients: RecipeIngredientInput[] = [];
    for (const ing of ingredients) {
      const name = ing.name.trim();
      if (!name) continue;
      let quantity: number | null = null;
      if (ing.qtyText.trim()) {
        const parsed = Number(ing.qtyText.replace(',', '.'));
        if (Number.isFinite(parsed) && parsed > 0) {
          quantity = Math.round(parsed * 100) / 100;
        }
      }
      cleanIngredients.push({
        name,
        quantity,
        unit: ing.unit.trim(),
        category: ing.category,
      });
    }

    if (cleanIngredients.length === 0) {
      Alert.alert(t.ingredientRequiredTitle, t.ingredientRequiredMsg);
      return;
    }

    const cleanSteps = steps.map((s) => s.text.trim()).filter(Boolean);

    try {
      setSaving(true);
      const payload = {
        title: trimmedTitle,
        description: description.trim(),
        servings,
        prepMinutes,
        cookMinutes,
        photoUri,
        tags,
        ingredients: cleanIngredients,
        steps: cleanSteps,
      };
      if (existing) {
        await editRecipe(existing.id, payload);
      } else {
        await addRecipe(payload);
      }
      for (const tempUri of newlyPickedPhotos) {
        if (tempUri !== photoUri) {
          deleteLocalPhoto(tempUri);
        }
      }
      setPendingImportedRecipe(null);
      hapticSuccess();
      router.back();
    } catch (e) {
      Alert.alert(
        t.saveFailedTitle,
        e instanceof Error ? e.message : t.saveFailedTitle
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    for (const tempUri of newlyPickedPhotos) {
      deleteLocalPhoto(tempUri);
    }
    setPendingImportedRecipe(null);
    router.back();
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={handleCancel} style={styles.cancelBtn}>
          <Text style={styles.cancelText}>{t.cancel}</Text>
        </Pressable>
        <Text style={styles.headerTitle}>
          {existing ? t.editRecipeTitle : t.newRecipeTitle}
        </Text>
        <Pressable
          disabled={saving}
          onPress={handleSave}
          style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.saveText}>{saving ? t.saving : t.save}</Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {!existing ? (
            <Pressable
              onPress={() => {
                hapticSelection();
                setImportModalOpen(true);
              }}
              style={({ pressed }) => [styles.importBanner, pressed && { opacity: 0.85 }]}
            >
              <Ionicons name="link-outline" size={18} color={colors.accentText} />
              <Text style={styles.importBannerText}>{t.importFromUrlBanner}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.accentText} />
            </Pressable>
          ) : null}

          {importBanner ? (
            <View style={styles.importedNotice}>
              <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
              <Text style={styles.importedNoticeText}>{t.importSuccessNote}</Text>
            </View>
          ) : null}

          {/* Optional Photo */}
          <Text style={styles.label}>{t.photoOptionalLabel}</Text>
          {photoUri ? (
            <View style={styles.photoPreviewWrap}>
              <Image source={{ uri: photoUri }} style={styles.photoPreview} />
              <Pressable
                onPress={() => setPhotoUri(null)}
                style={styles.removePhotoBtn}
              >
                <Ionicons name="close" size={18} color={colors.white} />
              </Pressable>
            </View>
          ) : (
            <View style={styles.photoBtnRow}>
              <Pressable
                onPress={() => handlePickPhoto('library')}
                style={styles.photoBtn}
              >
                <Ionicons name="images-outline" size={18} color={colors.primary} />
                <Text style={styles.photoBtnText}>{t.choosePhoto}</Text>
              </Pressable>
              <Pressable
                onPress={() => handlePickPhoto('camera')}
                style={styles.photoBtn}
              >
                <Ionicons name="camera-outline" size={18} color={colors.accent} />
                <Text style={styles.photoBtnText}>{t.takePhoto}</Text>
              </Pressable>
            </View>
          )}

          <Text style={styles.label}>{t.recipeTitleLabel}</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder={t.recipeTitlePlaceholder}
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />

          <Text style={styles.label}>{t.shortDescLabel}</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder={t.shortDescPlaceholder}
            placeholderTextColor={colors.textMuted}
            multiline
            style={[styles.input, { minHeight: 68, textAlignVertical: 'top' }]}
          />

          <View style={styles.tripleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{t.servingsLabel}</Text>
              <TextInput
                value={servingsText}
                onChangeText={setServingsText}
                keyboardType="number-pad"
                style={styles.input}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{t.prepMinLabel}</Text>
              <TextInput
                value={prepText}
                onChangeText={setPrepText}
                keyboardType="number-pad"
                style={styles.input}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{t.cookMinLabel}</Text>
              <TextInput
                value={cookText}
                onChangeText={setCookText}
                keyboardType="number-pad"
                style={styles.input}
              />
            </View>
          </View>

          {/* Tags */}
          <Text style={styles.label}>{t.tagsLabel}</Text>
          <View style={styles.tagGrid}>
            {availableTags.map((tag) => {
              const active = tags.includes(tag);
              return (
                <Pressable
                  key={tag}
                  onPress={() => toggleTag(tag)}
                  style={[styles.tagChip, active && styles.tagChipActive]}
                >
                  <Text style={[styles.tagText, active && styles.tagTextActive]}>
                    {tag}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.customTagRow}>
            <TextInput
              value={customTag}
              onChangeText={setCustomTag}
              onSubmitEditing={handleAddCustomTag}
              placeholder={t.customTagPlaceholder}
              placeholderTextColor={colors.textMuted}
              style={[styles.input, { flex: 1 }]}
            />
            <Pressable onPress={handleAddCustomTag} style={styles.smallAddBtn}>
              <Text style={styles.smallAddText}>{t.add}</Text>
            </Pressable>
          </View>

          {/* Structured Ingredients */}
          <View style={styles.sectionBar}>
            <Text style={styles.sectionHeading}>{t.ingredientsHeading}</Text>
            <Pressable onPress={addIngredientRow} style={styles.inlineAddBtn}>
              <Ionicons name="add" size={16} color={colors.primary} />
              <Text style={styles.inlineAddText}>{t.addIngredientBtn}</Text>
            </Pressable>
          </View>

          <View style={styles.stackGap}>
            {ingredients.map((ing, idx) => (
              <View key={ing.key} style={styles.ingCard}>
                <View style={styles.ingTopRow}>
                  <TextInput
                    value={ing.name}
                    onChangeText={(v) => updateIngredient(ing.key, { name: v })}
                    placeholder={t.ingredientPlaceholder(idx + 1)}
                    placeholderTextColor={colors.textMuted}
                    style={[styles.subInput, { flex: 1 }]}
                  />
                  {ingredients.length > 1 ? (
                    <Pressable
                      onPress={() => removeIngredientRow(ing.key)}
                      hitSlop={8}
                    >
                      <Ionicons name="trash-outline" size={18} color={colors.danger} />
                    </Pressable>
                  ) : null}
                </View>

                <View style={styles.ingSecondRow}>
                  <TextInput
                    value={ing.qtyText}
                    onChangeText={(v) => updateIngredient(ing.key, { qtyText: v })}
                    keyboardType="decimal-pad"
                    placeholder={t.qtyPlaceholder}
                    placeholderTextColor={colors.textMuted}
                    style={[styles.subInput, { width: 74 }]}
                  />
                  <TextInput
                    value={ing.unit}
                    onChangeText={(v) => updateIngredient(ing.key, { unit: v })}
                    placeholder={t.unitPlaceholder}
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                    style={[styles.subInput, { flex: 1 }]}
                  />
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.catRow}
                >
                  {GROCERY_CATEGORIES.map((cat) => {
                    const active = ing.category === cat.id;
                    return (
                      <Pressable
                        key={cat.id}
                        onPress={() => {
                          hapticSelection();
                          updateIngredient(ing.key, { category: cat.id });
                        }}
                        style={[styles.catPill, active && styles.catPillActive]}
                      >
                        <Text
                          style={[
                            styles.catPillText,
                            active && styles.catPillTextActive,
                          ]}
                        >
                          {GROCERY_CATEGORY_LABELS[language][cat.id].shortLabel}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            ))}
          </View>

          {/* Steps */}
          <View style={styles.sectionBar}>
            <Text style={styles.sectionHeading}>{t.stepsHeading}</Text>
            <Pressable
              onPress={() => {
                hapticLight();
                setSteps((prev) => [...prev, { key: makeDraftKey(), text: '' }]);
              }}
              style={styles.inlineAddBtn}
            >
              <Ionicons name="add" size={16} color={colors.primary} />
              <Text style={styles.inlineAddText}>{t.addStepBtn}</Text>
            </Pressable>
          </View>

          <View style={styles.stackGap}>
            {steps.map((step, idx) => (
              <View key={step.key} style={styles.stepCard}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepBadgeText}>{idx + 1}</Text>
                </View>
                <TextInput
                  value={step.text}
                  onChangeText={(v) =>
                    setSteps((prev) =>
                      prev.map((s) => (s.key === step.key ? { ...s, text: v } : s))
                    )
                  }
                  placeholder={t.stepPlaceholder(idx + 1)}
                  placeholderTextColor={colors.textMuted}
                  multiline
                  style={styles.stepInput}
                />
                {steps.length > 1 ? (
                  <Pressable
                    onPress={() =>
                      setSteps((prev) => prev.filter((s) => s.key !== step.key))
                    }
                    hitSlop={8}
                  >
                    <Ionicons name="close" size={18} color={colors.textMuted} />
                  </Pressable>
                ) : null}
              </View>
            ))}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <ImportRecipeModal
        visible={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImported={applyImportedDraft}
      />
    </SafeAreaView>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: c.bg,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    headerTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: c.text,
    },
    cancelBtn: {
      paddingVertical: 6,
      paddingHorizontal: 4,
    },
    cancelText: {
      fontSize: 15,
      color: c.textSecondary,
      fontWeight: '600',
    },
    saveBtn: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: c.primary,
    },
    saveText: {
      fontSize: 14,
      fontWeight: '700',
      color: c.white,
    },
    content: {
      padding: 18,
      paddingBottom: 42,
    },
    importBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
      paddingHorizontal: 14,
      paddingVertical: 13,
      borderRadius: 14,
      backgroundColor: c.accentSoft,
      marginBottom: 10,
    },
    importBannerText: {
      flex: 1,
      fontSize: 14,
      fontWeight: '700',
      color: c.accentText,
    },
    importedNotice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: c.primarySoft,
      marginBottom: 8,
    },
    importedNoticeText: {
      flex: 1,
      fontSize: 13,
      fontWeight: '600',
      color: c.primaryText,
    },
    label: {
      fontSize: 12,
      fontWeight: '700',
      color: c.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginTop: 14,
      marginBottom: 6,
    },
    input: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      paddingHorizontal: 13,
      paddingVertical: 11,
      fontSize: 15,
      color: c.text,
    },
    tripleRow: {
      flexDirection: 'row',
      gap: 10,
    },
    photoBtnRow: {
      flexDirection: 'row',
      gap: 10,
    },
    photoBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 13,
      borderRadius: 12,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    photoBtnText: {
      fontSize: 14,
      fontWeight: '600',
      color: c.text,
    },
    photoPreviewWrap: {
      position: 'relative',
      borderRadius: 14,
      overflow: 'hidden',
    },
    photoPreview: {
      width: '100%',
      height: 170,
      backgroundColor: c.surfaceAlt,
    },
    removePhotoBtn: {
      position: 'absolute',
      top: 10,
      right: 10,
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: 'rgba(0,0,0,0.6)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    tagGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 7,
    },
    tagChip: {
      paddingHorizontal: 12,
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
      fontSize: 12,
      fontWeight: '600',
      color: c.textSecondary,
    },
    tagTextActive: {
      color: c.white,
    },
    customTagRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 8,
    },
    smallAddBtn: {
      paddingHorizontal: 16,
      borderRadius: 12,
      backgroundColor: c.surfaceAlt,
      justifyContent: 'center',
    },
    smallAddText: {
      fontSize: 13,
      fontWeight: '700',
      color: c.text,
    },
    sectionBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 22,
      marginBottom: 10,
    },
    sectionHeading: {
      fontSize: 16,
      fontWeight: '700',
      color: c.text,
    },
    inlineAddBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 10,
      backgroundColor: c.primarySoft,
    },
    inlineAddText: {
      fontSize: 12,
      fontWeight: '700',
      color: c.primaryText,
    },
    stackGap: {
      gap: 10,
    },
    ingCard: {
      backgroundColor: c.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      padding: 12,
      gap: 8,
    },
    ingTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    ingSecondRow: {
      flexDirection: 'row',
      gap: 8,
    },
    subInput: {
      backgroundColor: c.surfaceAlt,
      borderRadius: 10,
      paddingHorizontal: 11,
      paddingVertical: 9,
      fontSize: 14,
      color: c.text,
    },
    catRow: {
      gap: 6,
    },
    catPill: {
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: 8,
      backgroundColor: c.surfaceAlt,
    },
    catPillActive: {
      backgroundColor: c.accent,
    },
    catPillText: {
      fontSize: 11,
      fontWeight: '600',
      color: c.textSecondary,
    },
    catPillTextActive: {
      color: c.white,
    },
    stepCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      backgroundColor: c.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      padding: 12,
    },
    stepBadge: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 4,
    },
    stepBadgeText: {
      fontSize: 12,
      fontWeight: '700',
      color: c.primaryText,
    },
    stepInput: {
      flex: 1,
      fontSize: 14,
      lineHeight: 20,
      color: c.text,
      minHeight: 40,
      textAlignVertical: 'top',
    },
  });
