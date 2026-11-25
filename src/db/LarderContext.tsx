import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useColorScheme } from 'react-native';
import { buildSamplePantryItems, buildSampleRecipes } from '@/data/sampleData';
import * as DB from '@/db/database';
import {
  TRANSLATIONS,
  type Language,
  type Translations,
} from '@/i18n/translations';
import {
  buildBackupPayload,
  exportLarderBackup,
  parseLarderBackupJson,
  pickBackupJsonText,
} from '@/services/backupService';
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
  PantryMatchSummary,
  Recipe,
  RecipeInput,
  StockLevel,
  ThemeMode,
} from '@/types/larder';
import { getWeekStartIso } from '@/utils/dates';
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
  pendingImportedRecipe: RecipeInput | null;
  setPendingImportedRecipe: (draft: RecipeInput | null) => void;

  pantryItems: PantryItem[];
  recipes: Recipe[];
  mealPlanEntries: MealPlanEntry[];
  groceryItems: GroceryItem[];
  recipeMatchMap: Record<number, PantryMatchSummary>;

  refreshAll: () => Promise<void>;

  // Pantry
  addPantryItem: (input: PantryItemInput) => Promise<number>;
  editPantryItem: (id: number, input: PantryItemInput) => Promise<void>;
  setPantryStock: (id: number, stockLevel: StockLevel) => Promise<void>;
  removePantryItem: (id: number) => Promise<void>;
  sendPantryItemToGroceries: (item: PantryItem) => Promise<{ added: number; merged: number }>;

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
  moveCheckedToPantry: () => Promise<number>;
  clearChecked: () => Promise<number>;

  // Sample Data / Backup / Reset
  loadSampleData: () => Promise<void>;
  clearAllData: () => Promise<void>;
  exportBackup: () => Promise<boolean>;
  importBackup: () => Promise<{ imported: boolean; recipes: number; pantry: number; groceries: number }>;
}

const LarderContext = createContext<LarderContextValue | null>(null);

export function LarderProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguageState] = useState<Language>('en');
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');
  const [pendingImportedRecipe, setPendingImportedRecipe] =
    useState<RecipeInput | null>(null);

  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [mealPlanEntries, setMealPlanEntries] = useState<MealPlanEntry[]>([]);
  const [groceryItems, setGroceryItems] = useState<GroceryItem[]>([]);

  const resolvedTheme: 'light' | 'dark' =
    themeMode === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : themeMode;
  const colors = resolvedTheme === 'dark' ? DARK_COLORS : LIGHT_COLORS;
  const t = TRANSLATIONS[language];

  const refreshAll = useCallback(async () => {
    const [pantry, recs, plans, groceries] = await Promise.all([
      DB.listPantryItems(),
      DB.listRecipes(),
      DB.listMealPlanEntries(),
      DB.listGroceryItems(),
    ]);
    setPantryItems(pantry);
    setRecipes(recs);
    setMealPlanEntries(plans);
    setGroceryItems(groceries);
  }, []);

  const seedInitialSampleData = useCallback(async (seedLang: Language = 'en') => {
    const samplePantry = buildSamplePantryItems(seedLang);
    const sampleRecipes = buildSampleRecipes(seedLang);
    const weekStart = getWeekStartIso();
    const isLt = seedLang === 'lt';

    await DB.replaceAllWithBackup({
      version: 1,
      app: 'Larder',
      exportedAt: new Date().toISOString(),
      pantryItems: samplePantry,
      recipes: sampleRecipes,
      mealPlanEntries: [
        {
          weekStart,
          dayIndex: 0,
          mealSlot: 'dinner',
          recipeTitle: sampleRecipes[0].title,
          recipeIndex: 0,
          servings: 2,
          notes: '',
        },
        {
          weekStart,
          dayIndex: 2,
          mealSlot: 'dinner',
          recipeTitle: sampleRecipes[1].title,
          recipeIndex: 1,
          servings: 4,
          notes: isLt ? 'Dviguba porcija pietums' : 'Double batch for lunches',
        },
        {
          weekStart,
          dayIndex: 4,
          mealSlot: 'dinner',
          recipeTitle: sampleRecipes[3].title,
          recipeIndex: 3,
          servings: 3,
          notes: '',
        },
      ],
      groceryItems: isLt
        ? [
            {
              name: 'Kiaušiniai',
              quantity: 6,
              unit: '',
              category: 'dairy_eggs',
              sourceNote: `${sampleRecipes[0].title}, ${sampleRecipes[3].title}`,
              checked: false,
            },
            {
              name: 'Fetos sūris',
              quantity: 60,
              unit: 'g',
              category: 'dairy_eggs',
              sourceNote: sampleRecipes[0].title,
              checked: false,
            },
            {
              name: 'Raugo duona',
              quantity: 1,
              unit: 'loaf',
              category: 'bakery',
              sourceNote: sampleRecipes[0].title,
              checked: false,
            },
            {
              name: 'Vištienos šlaunelių mėsa',
              quantity: 600,
              unit: 'g',
              category: 'meat_fish',
              sourceNote: sampleRecipes[1].title,
              checked: false,
            },
            {
              name: 'Kietas tofu',
              quantity: 300,
              unit: 'g',
              category: 'dairy_eggs',
              sourceNote: sampleRecipes[3].title,
              checked: false,
            },
            {
              name: 'Medus',
              quantity: 1,
              unit: 'jar',
              category: 'pantry_dry',
              sourceNote: 'Papildymas iš sandėliuko',
              checked: false,
            },
          ]
        : [
            {
              name: 'Eggs',
              quantity: 6,
              unit: '',
              category: 'dairy_eggs',
              sourceNote: 'Weeknight Shakshuka, Crispy Tofu & Pea Fried Rice',
              checked: false,
            },
            {
              name: 'Feta Cheese',
              quantity: 60,
              unit: 'g',
              category: 'dairy_eggs',
              sourceNote: 'Weeknight Shakshuka',
              checked: false,
            },
            {
              name: 'Sourdough Bread',
              quantity: 1,
              unit: 'loaf',
              category: 'bakery',
              sourceNote: 'Weeknight Shakshuka',
              checked: false,
            },
            {
              name: 'Chicken Thighs',
              quantity: 600,
              unit: 'g',
              category: 'meat_fish',
              sourceNote: 'Lemon Garlic Chicken & Rice Bowl',
              checked: false,
            },
            {
              name: 'Firm Tofu',
              quantity: 300,
              unit: 'g',
              category: 'dairy_eggs',
              sourceNote: 'Crispy Tofu & Pea Fried Rice',
              checked: false,
            },
            {
              name: 'Honey',
              quantity: 1,
              unit: 'jar',
              category: 'pantry_dry',
              sourceNote: 'Restock from Pantry',
              checked: false,
            },
          ],
    });
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await DB.getDatabase();
        const [savedTheme, savedLang, initialized] = await Promise.all([
          DB.getThemeModeSetting(),
          DB.getLanguageSetting(),
          DB.getSetting('has_initialized'),
        ]);
        if (!initialized) {
          await seedInitialSampleData(savedLang);
          await DB.setSetting('has_initialized', '1');
        }
        if (!active) return;
        setThemeModeState(savedTheme);
        setLanguageState(savedLang);
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
  }, [refreshAll, seedInitialSampleData]);

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

  // Pantry actions
  const addPantryItem = useCallback(
    async (input: PantryItemInput) => {
      const id = await DB.createPantryItem(input);
      await refreshAll();
      return id;
    },
    [refreshAll]
  );

  const editPantryItem = useCallback(
    async (id: number, input: PantryItemInput) => {
      await DB.updatePantryItem(id, input);
      await refreshAll();
    },
    [refreshAll]
  );

  const setPantryStock = useCallback(async (id: number, stockLevel: StockLevel) => {
    setPantryItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, stockLevel } : item))
    );
    await DB.updatePantryStockLevel(id, stockLevel);
  }, []);

  const removePantryItem = useCallback(
    async (id: number) => {
      await DB.deletePantryItem(id);
      await refreshAll();
    },
    [refreshAll]
  );

  const sendPantryItemToGroceries = useCallback(
    async (item: PantryItem) => {
      const res = await DB.addOrMergeGroceryItems([
        {
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          category: item.category,
          sourceNote: 'Restock from Pantry',
        },
      ]);
      await refreshAll();
      return res;
    },
    [refreshAll]
  );

  // Recipe actions
  const addRecipe = useCallback(
    async (input: RecipeInput) => {
      const id = await DB.createRecipe(input);
      await refreshAll();
      return id;
    },
    [refreshAll]
  );

  const editRecipe = useCallback(
    async (id: number, input: RecipeInput) => {
      const prev = recipes.find((r) => r.id === id);
      if (prev?.photoUri && prev.photoUri !== input.photoUri) {
        deleteLocalPhoto(prev.photoUri);
      }
      await DB.updateRecipe(id, input);
      await refreshAll();
    },
    [recipes, refreshAll]
  );

  const removeRecipe = useCallback(
    async (id: number) => {
      const prev = recipes.find((r) => r.id === id);
      if (prev?.photoUri) {
        deleteLocalPhoto(prev.photoUri);
      }
      await DB.deleteRecipe(id);
      await refreshAll();
    },
    [recipes, refreshAll]
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
      await refreshAll();
      return { ...res, skippedInPantry };
    },
    [pantryItems, refreshAll]
  );

  // Meal Plan actions
  const addMealPlanEntry = useCallback(
    async (input: MealPlanEntryInput) => {
      const id = await DB.createMealPlanEntry(input);
      await refreshAll();
      return id;
    },
    [refreshAll]
  );

  const setMealPlanServings = useCallback(
    async (id: number, servings: number) => {
      const clamped = Math.max(1, Math.round(servings));
      setMealPlanEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, servings: clamped } : e))
      );
      await DB.updateMealPlanServings(id, clamped);
    },
    []
  );

  const removeMealPlanEntry = useCallback(
    async (id: number) => {
      await DB.deleteMealPlanEntry(id);
      await refreshAll();
    },
    [refreshAll]
  );

  const clearWeekMealPlan = useCallback(
    async (weekStart: string) => {
      await DB.clearMealPlanWeek(weekStart);
      await refreshAll();
    },
    [refreshAll]
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
      await refreshAll();
      return { ...res, skippedInPantry };
    },
    [mealPlanEntries, recipes, pantryItems, refreshAll]
  );

  // Grocery actions
  const addGroceryItem = useCallback(
    async (input: GroceryItemInput) => {
      const res = await DB.addOrMergeGroceryItems([input]);
      await refreshAll();
      return res;
    },
    [refreshAll]
  );

  const editGroceryItem = useCallback(
    async (
      id: number,
      input: { name: string; quantity: number | null; unit: string; category: GroceryCategory }
    ) => {
      await DB.updateGroceryItem(id, input);
      await refreshAll();
    },
    [refreshAll]
  );

  const toggleGroceryChecked = useCallback(async (id: number, checked: boolean) => {
    setGroceryItems((prev) =>
      prev.map((g) => (g.id === id ? { ...g, checked } : g))
    );
    await DB.toggleGroceryItemChecked(id, checked);
  }, []);

  const removeGroceryItem = useCallback(
    async (id: number) => {
      await DB.deleteGroceryItem(id);
      await refreshAll();
    },
    [refreshAll]
  );

  const moveCheckedToPantry = useCallback(async () => {
    const moved = await DB.moveCheckedGroceriesToPantry();
    await refreshAll();
    return moved;
  }, [refreshAll]);

  const clearChecked = useCallback(async () => {
    const removed = await DB.clearCheckedGroceries();
    await refreshAll();
    return removed;
  }, [refreshAll]);

  // Sample / Backup / Clear
  const loadSampleData = useCallback(async () => {
    await seedInitialSampleData(language);
    await DB.setSetting('has_initialized', '1');
    await refreshAll();
  }, [language, seedInitialSampleData, refreshAll]);

  const clearAllData = useCallback(async () => {
    for (const r of recipes) {
      if (r.photoUri) deleteLocalPhoto(r.photoUri);
    }
    await DB.clearAllLarderData();
    await DB.setSetting('has_initialized', '1');
    await refreshAll();
  }, [recipes, refreshAll]);

  const exportBackup = useCallback(async () => {
    const payload = buildBackupPayload({
      pantryItems,
      recipes,
      mealPlanEntries,
      groceryItems,
    });
    return exportLarderBackup(payload);
  }, [pantryItems, recipes, mealPlanEntries, groceryItems]);

  const importBackup = useCallback(async () => {
    const text = await pickBackupJsonText();
    if (!text) {
      return { imported: false, recipes: 0, pantry: 0, groceries: 0 };
    }
    const payload = parseLarderBackupJson(text);
    await DB.replaceAllWithBackup(payload);
    await DB.setSetting('has_initialized', '1');
    await refreshAll();
    return {
      imported: true,
      recipes: payload.recipes.length,
      pantry: payload.pantryItems.length,
      groceries: payload.groceryItems.length,
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
      pendingImportedRecipe,
      setPendingImportedRecipe,
      pantryItems,
      recipes,
      mealPlanEntries,
      groceryItems,
      recipeMatchMap,
      refreshAll,
      addPantryItem,
      editPantryItem,
      setPantryStock,
      removePantryItem,
      sendPantryItemToGroceries,
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
      moveCheckedToPantry,
      clearChecked,
      loadSampleData,
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
      pendingImportedRecipe,
      pantryItems,
      recipes,
      mealPlanEntries,
      groceryItems,
      recipeMatchMap,
      refreshAll,
      addPantryItem,
      editPantryItem,
      setPantryStock,
      removePantryItem,
      sendPantryItemToGroceries,
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
      moveCheckedToPantry,
      clearChecked,
      loadSampleData,
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
