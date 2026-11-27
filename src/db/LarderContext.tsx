import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useColorScheme } from 'react-native';
import * as DB from '@/db/database';
import {
  TRANSLATIONS,
  type Language,
  type Translations,
} from '@/i18n/translations';
import {
  buildBackupPayload,
  exportLarderBackup,
  materializeBackupPhotos,
  parseLarderBackupJson,
  pickBackupJsonText,
} from '@/services/backupService';
import {
  cancelAllExpiryNotifications,
  requestExpiryNotificationPermission,
  syncExpiryNotifications,
} from '@/services/notificationService';
import { deleteLocalPhoto } from '@/services/photoService';
import { DARK_COLORS, LIGHT_COLORS, type ThemeColors } from '@/theme/colors';
import type {
  GroceryCategory,
  GroceryItem,
  GroceryItemInput,
  MealPlanEntry,
  MealPlanEntryInput,
  PantryItem,
  PantryItemInput,
  PantryLocation,
  PantryMatchSummary,
  Recipe,
  RecipeInput,
  StapleHistoryEntry,
  StockLevel,
  ThemeMode,
} from '@/types/larder';
import {
  computeRecipePantryMatch,
  findMatchingPantryItem,
  mergeIngredientList,
} from '@/utils/ingredients';

interface GenerateResult {
  added: number;
  merged: number;
  skippedInPantry: number;
}

export interface SharedRecipePayload {
  url?: string;
  text?: string;
}

interface LarderContextValue {
  ready: boolean;
  error: string | null;
  language: Language;
  t: Translations;
  setLanguage: (lang: Language) => Promise<void>;
  themeMode: ThemeMode;
  resolvedTheme: 'light' | 'dark';
  colors: ThemeColors;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  expiryNotificationsEnabled: boolean;
  setExpiryNotificationsEnabled: (enabled: boolean) => Promise<boolean>;
  lastBackupAt: string | null;

  pendingImportedRecipe: RecipeInput | null;
  setPendingImportedRecipe: (draft: RecipeInput | null) => void;
  sharedRecipePayload: SharedRecipePayload | null;
  setSharedRecipePayload: (payload: SharedRecipePayload | null) => void;

  pantryItems: PantryItem[];
  recipes: Recipe[];
  mealPlanEntries: MealPlanEntry[];
  groceryItems: GroceryItem[];
  stapleHistory: StapleHistoryEntry[];
  recipeMatchMap: Record<number, PantryMatchSummary>;

  refreshAll: () => Promise<void>;

  // Pantry
  addPantryItem: (input: PantryItemInput) => Promise<number>;
  editPantryItem: (id: number, input: PantryItemInput) => Promise<void>;
  setPantryStock: (id: number, stockLevel: StockLevel) => Promise<void>;
  applyCookedPantryUpdates: (
    updates: { id: number; stockLevel: StockLevel }[]
  ) => Promise<void>;
  removePantryItem: (id: number) => Promise<void>;
  restorePantryItem: (item: PantryItem) => Promise<number>;
  sendPantryItemToGroceries: (item: PantryItem) => Promise<{ added: number; merged: number }>;
  restockAllLowAndOutPantry: () => Promise<{ added: number; merged: number }>;
  saveBarcodeMapping: (entry: {
    barcode: string;
    name: string;
    category: GroceryCategory;
    location: PantryLocation;
    unit?: string;
  }) => Promise<void>;

  // Recipes
  addRecipe: (input: RecipeInput) => Promise<number>;
  editRecipe: (id: number, input: RecipeInput) => Promise<void>;
  removeRecipe: (id: number) => Promise<void>;
  addMissingRecipeIngredientsToGroceries: (
    recipe: Recipe,
    scaleMultiplier: number
  ) => Promise<GenerateResult>;

  // Meal Plan
  addMealPlanEntry: (input: MealPlanEntryInput) => Promise<number>;
  setMealPlanServings: (id: number, servings: number) => Promise<void>;
  removeMealPlanEntry: (id: number) => Promise<void>;
  clearWeekMealPlan: (weekStart: string) => Promise<void>;
  generateGroceriesForWeek: (
    weekStart: string,
    excludeInStockPantry: boolean
  ) => Promise<GenerateResult>;

  // Groceries
  addGroceryItem: (input: GroceryItemInput) => Promise<{ added: number; merged: number }>;
  editGroceryItem: (
    id: number,
    input: { name: string; quantity: number | null; unit: string; category: GroceryCategory }
  ) => Promise<void>;
  toggleGroceryChecked: (id: number, checked: boolean) => Promise<void>;
  removeGroceryItem: (id: number) => Promise<void>;
  restoreGroceryItem: (item: GroceryItem) => Promise<number>;
  moveCheckedToPantry: () => Promise<number>;
  clearChecked: () => Promise<number>;

  // Backup / Reset
  clearAllData: () => Promise<void>;
  exportBackup: (options?: { includePhotos?: boolean }) => Promise<boolean>;
  importBackup: () => Promise<{
    imported: boolean;
    recipes: number;
    pantry: number;
    groceries: number;
  }>;
}

const LarderContext = createContext<LarderContextValue | null>(null);

export function LarderProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguageState] = useState<Language>('en');
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');
  const [expiryNotificationsEnabled, setExpiryNotificationsState] = useState(false);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);

  const [pendingImportedRecipe, setPendingImportedRecipe] =
    useState<RecipeInput | null>(null);
  const [sharedRecipePayload, setSharedRecipePayload] =
    useState<SharedRecipePayload | null>(null);

  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [mealPlanEntries, setMealPlanEntries] = useState<MealPlanEntry[]>([]);
  const [groceryItems, setGroceryItems] = useState<GroceryItem[]>([]);
  const [stapleHistory, setStapleHistory] = useState<StapleHistoryEntry[]>([]);

  const resolvedTheme: 'light' | 'dark' =
    themeMode === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : themeMode;
  const colors = resolvedTheme === 'dark' ? DARK_COLORS : LIGHT_COLORS;
  const t = TRANSLATIONS[language];

  // Targeted table refreshers (#12 performance optimization)
  const refreshPantry = useCallback(async () => {
    const [pantry, history] = await Promise.all([
      DB.listPantryItems(),
      DB.listStapleHistory(),
    ]);
    setPantryItems(pantry);
    setStapleHistory(history);
  }, []);

  const refreshRecipes = useCallback(async () => {
    const recs = await DB.listRecipes();
    setRecipes(recs);
  }, []);

  const refreshMealPlan = useCallback(async () => {
    const plans = await DB.listMealPlanEntries();
    setMealPlanEntries(plans);
  }, []);

  const refreshGroceries = useCallback(async () => {
    const [groceries, history] = await Promise.all([
      DB.listGroceryItems(),
      DB.listStapleHistory(),
    ]);
    setGroceryItems(groceries);
    setStapleHistory(history);
  }, []);

  const refreshAll = useCallback(async () => {
    const [pantry, recs, plans, groceries, history] = await Promise.all([
      DB.listPantryItems(),
      DB.listRecipes(),
      DB.listMealPlanEntries(),
      DB.listGroceryItems(),
      DB.listStapleHistory(),
    ]);
    setPantryItems(pantry);
    setRecipes(recs);
    setMealPlanEntries(plans);
    setGroceryItems(groceries);
    setStapleHistory(history);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await DB.getDatabase();
        const [savedTheme, savedLang, savedNotif, savedLastBackup] = await Promise.all([
          DB.getThemeModeSetting(),
          DB.getLanguageSetting(),
          DB.getExpiryNotificationsSetting(),
          DB.getLastBackupAtSetting(),
        ]);
        if (!active) return;
        setThemeModeState(savedTheme);
        setLanguageState(savedLang);
        setExpiryNotificationsState(savedNotif);
        setLastBackupAt(savedLastBackup);
        await refreshAll();
        if (active) setReady(true);
      } catch (e) {
        if (active) {
          setError(e instanceof Error ? e.message : 'Failed to initialize local database.');
          setReady(true);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [refreshAll]);

  // Keep scheduled expiry reminders in sync whenever pantry / setting / language changes
  useEffect(() => {
    if (!ready) return;
    syncExpiryNotifications(pantryItems, expiryNotificationsEnabled, language);
  }, [ready, pantryItems, expiryNotificationsEnabled, language]);

  const recipeMatchMap = useMemo(() => {
    const map: Record<number, PantryMatchSummary> = {};
    for (const recipe of recipes) {
      map[recipe.id] = computeRecipePantryMatch(recipe.ingredients, pantryItems);
    }
    return map;
  }, [recipes, pantryItems]);

  const setLanguage = useCallback(async (lang: Language) => {
    setLanguageState(lang);
    await DB.setSetting('language', lang);
  }, []);

  const setThemeMode = useCallback(async (mode: ThemeMode) => {
    setThemeModeState(mode);
    await DB.setSetting('theme_mode', mode);
  }, []);

  const setExpiryNotificationsEnabled = useCallback(async (enabled: boolean) => {
    if (enabled) {
      const granted = await requestExpiryNotificationPermission();
      if (!granted) {
        setExpiryNotificationsState(false);
        await DB.setSetting('expiry_notifications_enabled', '0');
        return false;
      }
    } else {
      await cancelAllExpiryNotifications();
    }
    setExpiryNotificationsState(enabled);
    await DB.setSetting('expiry_notifications_enabled', enabled ? '1' : '0');
    return true;
  }, []);

  // Pantry actions (targeted refresh)
  const addPantryItem = useCallback(
    async (input: PantryItemInput) => {
      const id = await DB.createPantryItem(input);
      await refreshPantry();
      return id;
    },
    [refreshPantry]
  );

  const editPantryItem = useCallback(
    async (id: number, input: PantryItemInput) => {
      await DB.updatePantryItem(id, input);
      await refreshPantry();
    },
    [refreshPantry]
  );

  const setPantryStock = useCallback(
    async (id: number, stockLevel: StockLevel) => {
      setPantryItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, stockLevel } : item))
      );
      try {
        await DB.updatePantryStockLevel(id, stockLevel);
      } catch (e) {
        await refreshPantry();
        throw e;
      }
    },
    [refreshPantry]
  );

  const applyCookedPantryUpdates = useCallback(
    async (updates: { id: number; stockLevel: StockLevel }[]) => {
      if (updates.length === 0) return;
      const updateMap = new Map(updates.map((u) => [u.id, u.stockLevel]));
      setPantryItems((prev) =>
        prev.map((item) =>
          updateMap.has(item.id)
            ? { ...item, stockLevel: updateMap.get(item.id)! }
            : item
        )
      );
      try {
        await DB.batchUpdatePantryStockLevels(updates);
      } catch (e) {
        await refreshPantry();
        throw e;
      }
    },
    [refreshPantry]
  );

  const removePantryItem = useCallback(
    async (id: number) => {
      setPantryItems((prev) => prev.filter((item) => item.id !== id));
      try {
        await DB.deletePantryItem(id);
      } catch (e) {
        await refreshPantry();
        throw e;
      }
    },
    [refreshPantry]
  );

  const restorePantryItem = useCallback(
    async (item: PantryItem) => {
      const id = await DB.createPantryItem({
        name: item.name,
        location: item.location,
        stockLevel: item.stockLevel,
        quantity: item.quantity,
        unit: item.unit,
        category: item.category,
        expiresAt: item.expiresAt,
        notes: item.notes,
      });
      await refreshPantry();
      return id;
    },
    [refreshPantry]
  );

  const sendPantryItemToGroceries = useCallback(
    async (item: PantryItem) => {
      const res = await DB.addOrMergeGroceryItems([
        {
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          category: item.category,
          sourceNote: language === 'lt' ? 'Papildymas iš sandėliuko' : 'Restock from Pantry',
        },
      ]);
      await refreshGroceries();
      return res;
    },
    [language, refreshGroceries]
  );

  const restockAllLowAndOutPantry = useCallback(async () => {
    const lowAndOut = pantryItems.filter((i) => i.stockLevel !== 'in_stock');
    if (lowAndOut.length === 0) return { added: 0, merged: 0 };
    const sourceNote =
      language === 'lt' ? 'Papildymas iš sandėliuko' : 'Restock from Pantry';
    const res = await DB.addOrMergeGroceryItems(
      lowAndOut.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        category: item.category,
        sourceNote,
      }))
    );
    await refreshGroceries();
    return res;
  }, [pantryItems, language, refreshGroceries]);

  const saveBarcodeMapping = useCallback(
    async (entry: {
      barcode: string;
      name: string;
      category: GroceryCategory;
      location: PantryLocation;
      unit?: string;
    }) => {
      await DB.saveLocalBarcodeProduct(entry);
    },
    []
  );

  // Recipe actions (targeted refresh)
  const addRecipe = useCallback(
    async (input: RecipeInput) => {
      const id = await DB.createRecipe(input);
      await refreshRecipes();
      return id;
    },
    [refreshRecipes]
  );

  const editRecipe = useCallback(
    async (id: number, input: RecipeInput) => {
      const prev = recipes.find((r) => r.id === id);
      if (prev?.photoUri && prev.photoUri !== input.photoUri) {
        deleteLocalPhoto(prev.photoUri);
      }
      await DB.updateRecipe(id, input);
      await refreshRecipes();
    },
    [recipes, refreshRecipes]
  );

  const removeRecipe = useCallback(
    async (id: number) => {
      const prev = recipes.find((r) => r.id === id);
      if (prev?.photoUri) {
        deleteLocalPhoto(prev.photoUri);
      }
      await DB.deleteRecipe(id);
      await Promise.all([refreshRecipes(), refreshMealPlan()]);
    },
    [recipes, refreshRecipes, refreshMealPlan]
  );

  const addMissingRecipeIngredientsToGroceries = useCallback(
    async (recipe: Recipe, scaleMultiplier: number): Promise<GenerateResult> => {
      const toAdd: GroceryItemInput[] = [];
      let skippedInPantry = 0;

      for (const ing of recipe.ingredients) {
        const match = findMatchingPantryItem(ing.name, pantryItems);
        if (match && match.stockLevel === 'in_stock') {
          skippedInPantry += 1;
          continue;
        }
        toAdd.push({
          name: ing.name,
          quantity:
            ing.quantity !== null
              ? Math.round(ing.quantity * scaleMultiplier * 100) / 100
              : null,
          unit: ing.unit,
          category: ing.category,
          sourceNote: recipe.title,
        });
      }

      if (toAdd.length === 0) {
        return { added: 0, merged: 0, skippedInPantry };
      }
      const res = await DB.addOrMergeGroceryItems(toAdd);
      await refreshGroceries();
      return { ...res, skippedInPantry };
    },
    [pantryItems, refreshGroceries]
  );

  // Meal Plan actions (targeted refresh)
  const addMealPlanEntry = useCallback(
    async (input: MealPlanEntryInput) => {
      const id = await DB.createMealPlanEntry(input);
      await refreshMealPlan();
      return id;
    },
    [refreshMealPlan]
  );

  const setMealPlanServings = useCallback(
    async (id: number, servings: number) => {
      const clamped = Math.max(1, Math.round(servings));
      setMealPlanEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, servings: clamped } : e))
      );
      try {
        await DB.updateMealPlanServings(id, clamped);
      } catch (e) {
        await refreshMealPlan();
        throw e;
      }
    },
    [refreshMealPlan]
  );

  const removeMealPlanEntry = useCallback(
    async (id: number) => {
      setMealPlanEntries((prev) => prev.filter((e) => e.id !== id));
      try {
        await DB.deleteMealPlanEntry(id);
      } catch (e) {
        await refreshMealPlan();
        throw e;
      }
    },
    [refreshMealPlan]
  );

  const clearWeekMealPlan = useCallback(
    async (weekStart: string) => {
      await DB.clearMealPlanWeek(weekStart);
      await refreshMealPlan();
    },
    [refreshMealPlan]
  );

  const generateGroceriesForWeek = useCallback(
    async (weekStart: string, excludeInStockPantry: boolean): Promise<GenerateResult> => {
      const weekEntries = mealPlanEntries.filter((e) => e.weekStart === weekStart);
      const recipeMap = new Map(recipes.map((r) => [r.id, r]));

      const rawIngredients: {
        name: string;
        quantity: number | null;
        unit: string;
        category: GroceryCategory;
        source: string;
      }[] = [];

      for (const entry of weekEntries) {
        const recipe = recipeMap.get(entry.recipeId);
        if (!recipe) continue;
        const factor = entry.servings / Math.max(1, recipe.servings);
        for (const ing of recipe.ingredients) {
          rawIngredients.push({
            name: ing.name,
            quantity:
              ing.quantity !== null ? Math.round(ing.quantity * factor * 100) / 100 : null,
            unit: ing.unit,
            category: ing.category,
            source: recipe.title,
          });
        }
      }

      const aggregated = mergeIngredientList(rawIngredients);
      let skippedInPantry = 0;
      const toInsert: GroceryItemInput[] = [];

      for (const agg of aggregated) {
        if (excludeInStockPantry) {
          const pantryMatch = findMatchingPantryItem(agg.name, pantryItems);
          if (pantryMatch && pantryMatch.stockLevel === 'in_stock') {
            skippedInPantry += 1;
            continue;
          }
        }
        toInsert.push({
          name: agg.name,
          quantity: agg.quantity,
          unit: agg.unit,
          category: agg.category,
          sourceNote: agg.sources.join(', '),
        });
      }

      if (toInsert.length === 0) {
        return { added: 0, merged: 0, skippedInPantry };
      }

      const res = await DB.addOrMergeGroceryItems(toInsert);
      await refreshGroceries();
      return { ...res, skippedInPantry };
    },
    [mealPlanEntries, recipes, pantryItems, refreshGroceries]
  );

  // Grocery actions (targeted refresh)
  const addGroceryItem = useCallback(
    async (input: GroceryItemInput) => {
      const res = await DB.addOrMergeGroceryItems([input]);
      await refreshGroceries();
      return res;
    },
    [refreshGroceries]
  );

  const editGroceryItem = useCallback(
    async (
      id: number,
      input: { name: string; quantity: number | null; unit: string; category: GroceryCategory }
    ) => {
      await DB.updateGroceryItem(id, input);
      await refreshGroceries();
    },
    [refreshGroceries]
  );

  const toggleGroceryChecked = useCallback(
    async (id: number, checked: boolean) => {
      setGroceryItems((prev) =>
        prev.map((g) => (g.id === id ? { ...g, checked } : g))
      );
      try {
        await DB.toggleGroceryItemChecked(id, checked);
      } catch (e) {
        await refreshGroceries();
        throw e;
      }
    },
    [refreshGroceries]
  );

  const removeGroceryItem = useCallback(
    async (id: number) => {
      setGroceryItems((prev) => prev.filter((g) => g.id !== id));
      try {
        await DB.deleteGroceryItem(id);
      } catch (e) {
        await refreshGroceries();
        throw e;
      }
    },
    [refreshGroceries]
  );

  const restoreGroceryItem = useCallback(
    async (item: GroceryItem) => {
      const id = await DB.insertExactGroceryItem({
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        category: item.category,
        checked: item.checked,
        sourceNote: item.sourceNote,
      });
      await refreshGroceries();
      return id;
    },
    [refreshGroceries]
  );

  const moveCheckedToPantry = useCallback(async () => {
    const moved = await DB.moveCheckedGroceriesToPantry();
    await Promise.all([refreshGroceries(), refreshPantry()]);
    return moved;
  }, [refreshGroceries, refreshPantry]);

  const clearChecked = useCallback(async () => {
    const removed = await DB.clearCheckedGroceries();
    await refreshGroceries();
    return removed;
  }, [refreshGroceries]);

  // Backup / Clear
  const clearAllData = useCallback(async () => {
    for (const r of recipes) {
      if (r.photoUri) deleteLocalPhoto(r.photoUri);
    }
    await DB.clearAllLarderData();
    await cancelAllExpiryNotifications();
    setLastBackupAt(null);
    await refreshAll();
  }, [recipes, refreshAll]);

  const exportBackup = useCallback(
    async (options?: { includePhotos?: boolean }) => {
      const payload = await buildBackupPayload(
        {
          pantryItems,
          recipes,
          mealPlanEntries,
          groceryItems,
        },
        options
      );
      const shared = await exportLarderBackup(payload);
      if (shared) {
        const now = new Date().toISOString();
        setLastBackupAt(now);
        await DB.setSetting('last_backup_at', now);
      }
      return shared;
    },
    [pantryItems, recipes, mealPlanEntries, groceryItems]
  );

  const importBackup = useCallback(async () => {
    const text = await pickBackupJsonText();
    if (!text) {
      return { imported: false, recipes: 0, pantry: 0, groceries: 0 };
    }
    const parsed = parseLarderBackupJson(text);
    const hydrated = await materializeBackupPhotos(parsed);
    await DB.replaceAllWithBackup(hydrated);
    await refreshAll();
    return {
      imported: true,
      recipes: hydrated.recipes.length,
      pantry: hydrated.pantryItems.length,
      groceries: hydrated.groceryItems.length,
    };
  }, [refreshAll]);

  const value = useMemo<LarderContextValue>(
    () => ({
      ready,
      error,
      language,
      t,
      setLanguage,
      themeMode,
      resolvedTheme,
      colors,
      setThemeMode,
      expiryNotificationsEnabled,
      setExpiryNotificationsEnabled,
      lastBackupAt,
      pendingImportedRecipe,
      setPendingImportedRecipe,
      sharedRecipePayload,
      setSharedRecipePayload,
      pantryItems,
      recipes,
      mealPlanEntries,
      groceryItems,
      stapleHistory,
      recipeMatchMap,
      refreshAll,
      addPantryItem,
      editPantryItem,
      setPantryStock,
      applyCookedPantryUpdates,
      removePantryItem,
      restorePantryItem,
      sendPantryItemToGroceries,
      restockAllLowAndOutPantry,
      saveBarcodeMapping,
      addRecipe,
      editRecipe,
      removeRecipe,
      addMissingRecipeIngredientsToGroceries,
      addMealPlanEntry,
      setMealPlanServings,
      removeMealPlanEntry,
      clearWeekMealPlan,
      generateGroceriesForWeek,
      addGroceryItem,
      editGroceryItem,
      toggleGroceryChecked,
      removeGroceryItem,
      restoreGroceryItem,
      moveCheckedToPantry,
      clearChecked,
      clearAllData,
      exportBackup,
      importBackup,
    }),
    [
      ready,
      error,
      language,
      t,
      setLanguage,
      themeMode,
      resolvedTheme,
      colors,
      setThemeMode,
      expiryNotificationsEnabled,
      setExpiryNotificationsEnabled,
      lastBackupAt,
      pendingImportedRecipe,
      sharedRecipePayload,
      pantryItems,
      recipes,
      mealPlanEntries,
      groceryItems,
      stapleHistory,
      recipeMatchMap,
      refreshAll,
      addPantryItem,
      editPantryItem,
      setPantryStock,
      applyCookedPantryUpdates,
      removePantryItem,
      restorePantryItem,
      sendPantryItemToGroceries,
      restockAllLowAndOutPantry,
      saveBarcodeMapping,
      addRecipe,
      editRecipe,
      removeRecipe,
      addMissingRecipeIngredientsToGroceries,
      addMealPlanEntry,
      setMealPlanServings,
      removeMealPlanEntry,
      clearWeekMealPlan,
      generateGroceriesForWeek,
      addGroceryItem,
      editGroceryItem,
      toggleGroceryChecked,
      removeGroceryItem,
      restoreGroceryItem,
      moveCheckedToPantry,
      clearChecked,
      clearAllData,
      exportBackup,
      importBackup,
    ]
  );

  return <LarderContext.Provider value={value}>{children}</LarderContext.Provider>;
}

export function useLarder(): LarderContextValue {
  const ctx = useContext(LarderContext);
  if (!ctx) {
    throw new Error('useLarder must be used within LarderProvider');
  }
  return ctx;
}
