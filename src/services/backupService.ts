import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import {
  isGroceryCategory,
  isMealSlot,
  isPantryLocation,
  isStockLevel,
} from '@/constants/categories';
import type {
  GroceryItem,
  LarderBackupPayload,
  MealPlanEntry,
  PantryItem,
  Recipe,
} from '@/types/larder';
import { getWeekStartIso, parseIsoDate } from '@/utils/dates';

export function buildBackupPayload(data: {
  pantryItems: PantryItem[];
  recipes: Recipe[];
  mealPlanEntries: MealPlanEntry[];
  groceryItems: GroceryItem[];
}): LarderBackupPayload {
  const recipeIndexById = new Map<number, number>();
  const recipeTitleById = new Map<number, string>();
  data.recipes.forEach((r, idx) => {
    recipeIndexById.set(r.id, idx);
    recipeTitleById.set(r.id, r.title);
  });

  return {
    version: 1,
    app: 'Larder',
    exportedAt: new Date().toISOString(),
    pantryItems: data.pantryItems.map((item) => ({
      name: item.name,
      location: item.location,
      stockLevel: item.stockLevel,
      quantity: item.quantity,
      unit: item.unit,
      category: item.category,
      expiresAt: item.expiresAt,
      notes: item.notes,
    })),
    recipes: data.recipes.map((r) => ({
      title: r.title,
      description: r.description,
      servings: r.servings,
      prepMinutes: r.prepMinutes,
      cookMinutes: r.cookMinutes,
      photoUri: r.photoUri,
      tags: r.tags,
      steps: r.steps,
      ingredients: r.ingredients.map((ing) => ({
        name: ing.name,
        quantity: ing.quantity,
        unit: ing.unit,
        category: ing.category,
      })),
    })),
    mealPlanEntries: data.mealPlanEntries
      .filter((entry) => recipeTitleById.has(entry.recipeId))
      .map((entry) => ({
        weekStart: entry.weekStart,
        dayIndex: entry.dayIndex,
        mealSlot: entry.mealSlot,
        recipeTitle: recipeTitleById.get(entry.recipeId) ?? '',
        recipeIndex: recipeIndexById.get(entry.recipeId),
        servings: entry.servings,
        notes: entry.notes,
      })),
    groceryItems: data.groceryItems.map((g) => ({
      name: g.name,
      quantity: g.quantity,
      unit: g.unit,
      category: g.category,
      sourceNote: g.sourceNote,
      checked: g.checked,
    })),
  };
}

export async function exportLarderBackup(payload: LarderBackupPayload): Promise<boolean> {
  const json = JSON.stringify(payload, null, 2);
  const stamp = new Date().toISOString().slice(0, 10);
  const exportFile = new File(Paths.cache, `larder_backup_${stamp}.json`);
  await exportFile.write(json, { encoding: 'utf8' });

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    return false;
  }

  await Sharing.shareAsync(exportFile.uri, {
    mimeType: 'application/json',
    dialogTitle: 'Export Larder Backup (JSON)',
  });
  return true;
}

export async function pickBackupJsonText(): Promise<string | null> {
  const picked = await File.pickFileAsync({
    mimeTypes: ['application/json', 'text/plain', '*/*'],
    multipleFiles: false,
  });

  if (picked.canceled || !picked.result) return null;
  return picked.result.text();
}

function asOptionalPositiveNumber(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const num = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.round(num * 100) / 100;
}

function asNonNegativeInt(val: unknown, fallback: number): number {
  const num = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(num) || num < 0) return fallback;
  return Math.round(num);
}

export function parseLarderBackupJson(rawText: string): LarderBackupPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error('The selected file is not valid JSON.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Backup file must contain a JSON object.');
  }

  const obj = parsed as Record<string, unknown>;
  if (
    !Array.isArray(obj.pantryItems) &&
    !Array.isArray(obj.recipes) &&
    !Array.isArray(obj.groceryItems)
  ) {
    throw new Error('This file does not look like a Larder backup.');
  }

  const pantryItems: LarderBackupPayload['pantryItems'] = [];
  if (Array.isArray(obj.pantryItems)) {
    for (const raw of obj.pantryItems) {
      if (!raw || typeof raw !== 'object') continue;
      const p = raw as Record<string, unknown>;
      const name = typeof p.name === 'string' ? p.name.trim() : '';
      if (!name) continue;
      const expiresAt =
        typeof p.expiresAt === 'string' && parseIsoDate(p.expiresAt) ? p.expiresAt : null;
      pantryItems.push({
        name,
        location: isPantryLocation(p.location) ? p.location : 'pantry',
        stockLevel: isStockLevel(p.stockLevel) ? p.stockLevel : 'in_stock',
        quantity: asOptionalPositiveNumber(p.quantity),
        unit: typeof p.unit === 'string' ? p.unit.trim() : '',
        category: isGroceryCategory(p.category) ? p.category : 'pantry_dry',
        expiresAt,
        notes: typeof p.notes === 'string' ? p.notes.trim() : '',
      });
    }
  }

  const recipes: LarderBackupPayload['recipes'] = [];
  if (Array.isArray(obj.recipes)) {
    for (const raw of obj.recipes) {
      if (!raw || typeof raw !== 'object') continue;
      const r = raw as Record<string, unknown>;
      const title = typeof r.title === 'string' ? r.title.trim() : '';
      if (!title) continue;

      const tags = Array.isArray(r.tags)
        ? r.tags
            .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
            .map((t) => t.trim())
        : [];
      const steps = Array.isArray(r.steps)
        ? r.steps
            .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
            .map((s) => s.trim())
        : [];

      const ingredients: LarderBackupPayload['recipes'][number]['ingredients'] = [];
      if (Array.isArray(r.ingredients)) {
        for (const rawIng of r.ingredients) {
          if (!rawIng || typeof rawIng !== 'object') continue;
          const ing = rawIng as Record<string, unknown>;
          const ingName = typeof ing.name === 'string' ? ing.name.trim() : '';
          if (!ingName) continue;
          ingredients.push({
            name: ingName,
            quantity: asOptionalPositiveNumber(ing.quantity),
            unit: typeof ing.unit === 'string' ? ing.unit.trim() : '',
            category: isGroceryCategory(ing.category) ? ing.category : 'pantry_dry',
          });
        }
      }

      recipes.push({
        title,
        description: typeof r.description === 'string' ? r.description.trim() : '',
        servings: Math.max(1, asNonNegativeInt(r.servings, 2)),
        prepMinutes: asNonNegativeInt(r.prepMinutes, 10),
        cookMinutes: asNonNegativeInt(r.cookMinutes, 15),
        photoUri: typeof r.photoUri === 'string' ? r.photoUri : null,
        tags,
        steps,
        ingredients,
      });
    }
  }

  const mealPlanEntries: LarderBackupPayload['mealPlanEntries'] = [];
  if (Array.isArray(obj.mealPlanEntries)) {
    for (const raw of obj.mealPlanEntries) {
      if (!raw || typeof raw !== 'object') continue;
      const m = raw as Record<string, unknown>;
      const recipeTitle = typeof m.recipeTitle === 'string' ? m.recipeTitle.trim() : '';
      const recipeIndex =
        typeof m.recipeIndex === 'number' && Number.isInteger(m.recipeIndex)
          ? m.recipeIndex
          : undefined;
      if (!recipeTitle && recipeIndex === undefined) continue;
      const weekStart =
        typeof m.weekStart === 'string' && parseIsoDate(m.weekStart)
          ? m.weekStart
          : getWeekStartIso();
      const rawDay = typeof m.dayIndex === 'number' ? Math.round(m.dayIndex) : -1;
      const dayIndex = rawDay >= -1 && rawDay <= 6 ? rawDay : -1;
      mealPlanEntries.push({
        weekStart,
        dayIndex,
        mealSlot: isMealSlot(m.mealSlot) ? m.mealSlot : 'dinner',
        recipeTitle,
        recipeIndex,
        servings: Math.max(1, asNonNegativeInt(m.servings, 2)),
        notes: typeof m.notes === 'string' ? m.notes.trim() : '',
      });
    }
  }

  const groceryItems: LarderBackupPayload['groceryItems'] = [];
  if (Array.isArray(obj.groceryItems)) {
    for (const raw of obj.groceryItems) {
      if (!raw || typeof raw !== 'object') continue;
      const g = raw as Record<string, unknown>;
      const name = typeof g.name === 'string' ? g.name.trim() : '';
      if (!name) continue;
      groceryItems.push({
        name,
        quantity: asOptionalPositiveNumber(g.quantity),
        unit: typeof g.unit === 'string' ? g.unit.trim() : '',
        category: isGroceryCategory(g.category) ? g.category : 'pantry_dry',
        sourceNote: typeof g.sourceNote === 'string' ? g.sourceNote.trim() : '',
        checked: Boolean(g.checked),
      });
    }
  }

  return {
    version: 1,
    app: 'Larder',
    exportedAt:
      typeof obj.exportedAt === 'string' ? obj.exportedAt : new Date().toISOString(),
    pantryItems,
    recipes,
    mealPlanEntries,
    groceryItems,
  };
}
