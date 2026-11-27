import * as SQLite from 'expo-sqlite';
import {
  GROCERY_CATEGORY_MAP,
  isGroceryCategory,
  isMealSlot,
  isPantryLocation,
  isStockLevel,
} from '@/constants/categories';
import type {
  BarcodeProductEntry,
  GroceryCategory,
  GroceryItem,
  GroceryItemInput,
  LarderBackupPayload,
  MealPlanEntry,
  MealPlanEntryInput,
  PantryItem,
  PantryItemInput,
  PantryLocation,
  Recipe,
  RecipeIngredient,
  RecipeInput,
  StapleHistoryEntry,
  StockLevel,
  ThemeMode,
} from '@/types/larder';
import {
  namesMatchForPantry,
  normalizeIngredientName,
  normalizeUnit,
  tryMergeQuantities,
} from '@/utils/ingredients';

const DB_NAME = 'larder_v1.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function initSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS pantry_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      location TEXT NOT NULL DEFAULT 'pantry',
      stock_level TEXT NOT NULL DEFAULT 'in_stock',
      quantity REAL,
      unit TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'pantry_dry',
      expires_at TEXT,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_pantry_norm ON pantry_items(normalized_name);
    CREATE INDEX IF NOT EXISTS idx_pantry_location ON pantry_items(location);

    CREATE TABLE IF NOT EXISTS recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      servings INTEGER NOT NULL DEFAULT 2,
      prep_minutes INTEGER NOT NULL DEFAULT 10,
      cook_minutes INTEGER NOT NULL DEFAULT 15,
      photo_uri TEXT,
      source_url TEXT,
      tags_json TEXT NOT NULL DEFAULT '[]',
      steps_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS recipe_ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      quantity REAL,
      unit TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'pantry_dry',
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe ON recipe_ingredients(recipe_id);

    CREATE TABLE IF NOT EXISTS meal_plan_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      week_start TEXT NOT NULL,
      day_index INTEGER NOT NULL DEFAULT -1,
      meal_slot TEXT NOT NULL DEFAULT 'dinner',
      recipe_id INTEGER NOT NULL,
      servings INTEGER NOT NULL DEFAULT 2,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_meal_plan_week ON meal_plan_entries(week_start);

    CREATE TABLE IF NOT EXISTS grocery_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      quantity REAL,
      unit TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'pantry_dry',
      checked INTEGER NOT NULL DEFAULT 0,
      source_note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_grocery_norm ON grocery_items(normalized_name);

    CREATE TABLE IF NOT EXISTS item_history (
      normalized_name TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'pantry_dry',
      location TEXT NOT NULL DEFAULT 'pantry',
      unit TEXT NOT NULL DEFAULT '',
      use_count INTEGER NOT NULL DEFAULT 1,
      last_used_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS barcode_catalog (
      barcode TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'pantry_dry',
      location TEXT NOT NULL DEFAULT 'pantry',
      unit TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Safe additive migration for existing v1.0 databases missing recipes.source_url
  const recipeCols = await db.getAllAsync<{ name: string }>(
    'PRAGMA table_info(recipes)'
  );
  if (!recipeCols.some((col) => col.name === 'source_url')) {
    await db.execAsync('ALTER TABLE recipes ADD COLUMN source_url TEXT;');
  }
}

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await initSchema(db);
      return db;
    })();
  }
  return dbPromise;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_settings WHERE key = ?',
    [key]
  );
  return row ? row.value : null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value]
  );
}

export async function getThemeModeSetting(): Promise<ThemeMode> {
  const val = await getSetting('theme_mode');
  if (val === 'light' || val === 'dark' || val === 'system') return val;
  return 'system';
}

export async function getLanguageSetting(): Promise<'en' | 'lt'> {
  const val = await getSetting('language');
  return val === 'lt' ? 'lt' : 'en';
}

export async function getExpiryNotificationsSetting(): Promise<boolean> {
  const val = await getSetting('expiry_notifications_enabled');
  return val === '1';
}

export async function getLastBackupAtSetting(): Promise<string | null> {
  return getSetting('last_backup_at');
}

// ---------------------------------------------------------------------------
// Staple History & Barcode Catalog
// ---------------------------------------------------------------------------

interface HistoryRow {
  normalized_name: string;
  name: string;
  category: string;
  location: string;
  unit: string;
  use_count: number;
  last_used_at: string;
}

async function upsertHistoryRow(
  db: SQLite.SQLiteDatabase,
  name: string,
  category: GroceryCategory,
  location: PantryLocation,
  unit: string,
  now: string
): Promise<void> {
  const cleanName = name.trim();
  const norm = normalizeIngredientName(cleanName);
  if (!norm) return;
  await db.runAsync(
    `INSERT INTO item_history (normalized_name, name, category, location, unit, use_count, last_used_at)
     VALUES (?, ?, ?, ?, ?, 1, ?)
     ON CONFLICT(normalized_name) DO UPDATE SET
       name = excluded.name,
       category = excluded.category,
       location = excluded.location,
       unit = CASE WHEN excluded.unit != '' THEN excluded.unit ELSE item_history.unit END,
       use_count = item_history.use_count + 1,
       last_used_at = excluded.last_used_at`,
    [norm, cleanName, category, location, unit, now]
  );
}

export async function listStapleHistory(): Promise<StapleHistoryEntry[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<HistoryRow>(
    'SELECT * FROM item_history ORDER BY use_count DESC, last_used_at DESC LIMIT 200'
  );
  return rows.map((r) => ({
    normalizedName: r.normalized_name,
    name: r.name,
    category: isGroceryCategory(r.category) ? r.category : 'pantry_dry',
    location: isPantryLocation(r.location) ? r.location : 'pantry',
    unit: r.unit,
    useCount: r.use_count,
    lastUsedAt: r.last_used_at,
  }));
}

interface BarcodeRow {
  barcode: string;
  name: string;
  category: string;
  location: string;
  unit: string;
  updated_at: string;
}

export async function getLocalBarcodeProduct(
  barcode: string
): Promise<BarcodeProductEntry | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<BarcodeRow>(
    'SELECT * FROM barcode_catalog WHERE barcode = ?',
    [barcode.trim()]
  );
  if (!row) return null;
  return {
    barcode: row.barcode,
    name: row.name,
    category: isGroceryCategory(row.category) ? row.category : 'pantry_dry',
    location: isPantryLocation(row.location) ? row.location : 'pantry',
    unit: row.unit,
    updatedAt: row.updated_at,
  };
}

export async function saveLocalBarcodeProduct(entry: {
  barcode: string;
  name: string;
  category: GroceryCategory;
  location: PantryLocation;
  unit?: string;
}): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO barcode_catalog (barcode, name, category, location, unit, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(barcode) DO UPDATE SET
       name = excluded.name,
       category = excluded.category,
       location = excluded.location,
       unit = excluded.unit,
       updated_at = excluded.updated_at`,
    [
      entry.barcode.trim(),
      entry.name.trim(),
      entry.category,
      entry.location,
      (entry.unit ?? '').trim(),
      now,
    ]
  );
}

// ---------------------------------------------------------------------------
// Pantry CRUD
// ---------------------------------------------------------------------------

interface PantryRow {
  id: number;
  name: string;
  normalized_name: string;
  location: string;
  stock_level: string;
  quantity: number | null;
  unit: string;
  category: string;
  expires_at: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

function mapPantryRow(row: PantryRow): PantryItem {
  return {
    id: row.id,
    name: row.name,
    normalizedName: row.normalized_name,
    location: isPantryLocation(row.location) ? row.location : 'pantry',
    stockLevel: isStockLevel(row.stock_level) ? row.stock_level : 'in_stock',
    quantity: row.quantity,
    unit: row.unit,
    category: isGroceryCategory(row.category) ? row.category : 'pantry_dry',
    expiresAt: row.expires_at,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listPantryItems(): Promise<PantryItem[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<PantryRow>(
    'SELECT * FROM pantry_items ORDER BY LOWER(name) ASC'
  );
  return rows.map(mapPantryRow);
}

export async function createPantryItem(input: PantryItemInput): Promise<number> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const name = input.name.trim();
  const normalizedName = normalizeIngredientName(name);
  const unit = normalizeUnit(input.unit ?? '').canonical;
  const category = input.category ?? 'pantry_dry';
  const result = await db.runAsync(
    `INSERT INTO pantry_items
      (name, normalized_name, location, stock_level, quantity, unit, category, expires_at, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      name,
      normalizedName,
      input.location,
      input.stockLevel,
      input.quantity ?? null,
      unit,
      category,
      input.expiresAt ?? null,
      (input.notes ?? '').trim(),
      now,
      now,
    ]
  );
  await upsertHistoryRow(db, name, category, input.location, unit, now);
  return result.lastInsertRowId;
}

export async function updatePantryItem(
  id: number,
  input: PantryItemInput
): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const name = input.name.trim();
  const normalizedName = normalizeIngredientName(name);
  const unit = normalizeUnit(input.unit ?? '').canonical;
  const category = input.category ?? 'pantry_dry';
  await db.runAsync(
    `UPDATE pantry_items
     SET name = ?, normalized_name = ?, location = ?, stock_level = ?,
         quantity = ?, unit = ?, category = ?, expires_at = ?, notes = ?, updated_at = ?
     WHERE id = ?`,
    [
      name,
      normalizedName,
      input.location,
      input.stockLevel,
      input.quantity ?? null,
      unit,
      category,
      input.expiresAt ?? null,
      (input.notes ?? '').trim(),
      now,
      id,
    ]
  );
  await upsertHistoryRow(db, name, category, input.location, unit, now);
}

export async function updatePantryStockLevel(
  id: number,
  stockLevel: StockLevel
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE pantry_items SET stock_level = ?, updated_at = ? WHERE id = ?',
    [stockLevel, new Date().toISOString(), id]
  );
}

export async function batchUpdatePantryStockLevels(
  updates: { id: number; stockLevel: StockLevel }[]
): Promise<void> {
  if (updates.length === 0) return;
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    for (const u of updates) {
      await db.runAsync(
        'UPDATE pantry_items SET stock_level = ?, updated_at = ? WHERE id = ?',
        [u.stockLevel, now, u.id]
      );
    }
  });
}

export async function deletePantryItem(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM pantry_items WHERE id = ?', [id]);
}

// ---------------------------------------------------------------------------
// Recipes CRUD
// ---------------------------------------------------------------------------

interface RecipeRow {
  id: number;
  title: string;
  description: string;
  servings: number;
  prep_minutes: number;
  cook_minutes: number;
  photo_uri: string | null;
  source_url: string | null;
  tags_json: string;
  steps_json: string;
  created_at: string;
  updated_at: string;
}

interface RecipeIngredientRow {
  id: number;
  recipe_id: number;
  name: string;
  normalized_name: string;
  quantity: number | null;
  unit: string;
  category: string;
  sort_order: number;
}

function safeParseStringArray(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) {
      return parsed.filter((v): v is string => typeof v === 'string');
    }
  } catch {
    // ignore malformed json
  }
  return [];
}

export async function listRecipes(): Promise<Recipe[]> {
  const db = await getDatabase();
  const [recipeRows, ingRows] = await Promise.all([
    db.getAllAsync<RecipeRow>('SELECT * FROM recipes ORDER BY updated_at DESC, id DESC'),
    db.getAllAsync<RecipeIngredientRow>(
      'SELECT * FROM recipe_ingredients ORDER BY recipe_id ASC, sort_order ASC, id ASC'
    ),
  ]);

  const byRecipe = new Map<number, RecipeIngredient[]>();
  for (const row of ingRows) {
    const list = byRecipe.get(row.recipe_id) ?? [];
    list.push({
      id: row.id,
      recipeId: row.recipe_id,
      name: row.name,
      normalizedName: row.normalized_name,
      quantity: row.quantity,
      unit: row.unit,
      category: isGroceryCategory(row.category) ? row.category : 'pantry_dry',
      sortOrder: row.sort_order,
    });
    byRecipe.set(row.recipe_id, list);
  }

  return recipeRows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    servings: Math.max(1, r.servings),
    prepMinutes: r.prep_minutes,
    cookMinutes: r.cook_minutes,
    photoUri: r.photo_uri,
    sourceUrl: r.source_url ?? null,
    tags: safeParseStringArray(r.tags_json),
    steps: safeParseStringArray(r.steps_json),
    ingredients: byRecipe.get(r.id) ?? [],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export async function createRecipe(input: RecipeInput): Promise<number> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  let newId = 0;

  await db.withTransactionAsync(async () => {
    const res = await db.runAsync(
      `INSERT INTO recipes
        (title, description, servings, prep_minutes, cook_minutes, photo_uri, source_url, tags_json, steps_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.title.trim(),
        (input.description ?? '').trim(),
        Math.max(1, Math.round(input.servings)),
        Math.max(0, Math.round(input.prepMinutes)),
        Math.max(0, Math.round(input.cookMinutes)),
        input.photoUri ?? null,
        input.sourceUrl?.trim() || null,
        JSON.stringify(input.tags),
        JSON.stringify(input.steps),
        now,
        now,
      ]
    );
    newId = res.lastInsertRowId;

    for (let i = 0; i < input.ingredients.length; i++) {
      const ing = input.ingredients[i];
      const name = ing.name.trim();
      if (!name) continue;
      await db.runAsync(
        `INSERT INTO recipe_ingredients
          (recipe_id, name, normalized_name, quantity, unit, category, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          newId,
          name,
          normalizeIngredientName(name),
          ing.quantity,
          normalizeUnit(ing.unit).canonical,
          ing.category,
          i,
        ]
      );
    }
  });

  return newId;
}

export async function updateRecipe(id: number, input: RecipeInput): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE recipes
       SET title = ?, description = ?, servings = ?, prep_minutes = ?, cook_minutes = ?,
           photo_uri = ?, source_url = ?, tags_json = ?, steps_json = ?, updated_at = ?
       WHERE id = ?`,
      [
        input.title.trim(),
        (input.description ?? '').trim(),
        Math.max(1, Math.round(input.servings)),
        Math.max(0, Math.round(input.prepMinutes)),
        Math.max(0, Math.round(input.cookMinutes)),
        input.photoUri ?? null,
        input.sourceUrl?.trim() || null,
        JSON.stringify(input.tags),
        JSON.stringify(input.steps),
        now,
        id,
      ]
    );

    await db.runAsync('DELETE FROM recipe_ingredients WHERE recipe_id = ?', [id]);
    for (let i = 0; i < input.ingredients.length; i++) {
      const ing = input.ingredients[i];
      const name = ing.name.trim();
      if (!name) continue;
      await db.runAsync(
        `INSERT INTO recipe_ingredients
          (recipe_id, name, normalized_name, quantity, unit, category, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          name,
          normalizeIngredientName(name),
          ing.quantity,
          normalizeUnit(ing.unit).canonical,
          ing.category,
          i,
        ]
      );
    }
  });
}

export async function deleteRecipe(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM recipes WHERE id = ?', [id]);
}

// ---------------------------------------------------------------------------
// Meal Plan CRUD
// ---------------------------------------------------------------------------

interface MealPlanRow {
  id: number;
  week_start: string;
  day_index: number;
  meal_slot: string;
  recipe_id: number;
  servings: number;
  notes: string;
  created_at: string;
}

export async function listMealPlanEntries(): Promise<MealPlanEntry[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<MealPlanRow>(
    'SELECT * FROM meal_plan_entries ORDER BY week_start ASC, day_index ASC, id ASC'
  );
  return rows.map((row) => ({
    id: row.id,
    weekStart: row.week_start,
    dayIndex: row.day_index,
    mealSlot: isMealSlot(row.meal_slot) ? row.meal_slot : 'dinner',
    recipeId: row.recipe_id,
    servings: Math.max(1, row.servings),
    notes: row.notes,
    createdAt: row.created_at,
  }));
}

export async function createMealPlanEntry(
  input: MealPlanEntryInput
): Promise<number> {
  const db = await getDatabase();
  const res = await db.runAsync(
    `INSERT INTO meal_plan_entries
      (week_start, day_index, meal_slot, recipe_id, servings, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      input.weekStart,
      input.dayIndex,
      input.mealSlot,
      input.recipeId,
      Math.max(1, Math.round(input.servings)),
      (input.notes ?? '').trim(),
      new Date().toISOString(),
    ]
  );
  return res.lastInsertRowId;
}

export async function updateMealPlanServings(
  id: number,
  servings: number
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE meal_plan_entries SET servings = ? WHERE id = ?', [
    Math.max(1, Math.round(servings)),
    id,
  ]);
}

export async function deleteMealPlanEntry(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM meal_plan_entries WHERE id = ?', [id]);
}

export async function clearMealPlanWeek(weekStart: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM meal_plan_entries WHERE week_start = ?', [weekStart]);
}

// ---------------------------------------------------------------------------
// Groceries CRUD + Smart Merging + Move Checked to Pantry
// ---------------------------------------------------------------------------

interface GroceryRow {
  id: number;
  name: string;
  normalized_name: string;
  quantity: number | null;
  unit: string;
  category: string;
  checked: number;
  source_note: string;
  created_at: string;
  updated_at: string;
}

function mapGroceryRow(row: GroceryRow): GroceryItem {
  return {
    id: row.id,
    name: row.name,
    normalizedName: row.normalized_name,
    quantity: row.quantity,
    unit: row.unit,
    category: isGroceryCategory(row.category) ? row.category : 'pantry_dry',
    checked: row.checked === 1,
    sourceNote: row.source_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listGroceryItems(): Promise<GroceryItem[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<GroceryRow>(
    'SELECT * FROM grocery_items ORDER BY checked ASC, LOWER(name) ASC'
  );
  return rows.map(mapGroceryRow);
}

function mergeSourceNotes(existing: string, incoming: string): string {
  const parts = new Set(
    [existing, incoming]
      .flatMap((s) => s.split(','))
      .map((s) => s.trim())
      .filter(Boolean)
  );
  return Array.from(parts).join(', ');
}

/**
 * Adds one or more grocery items, automatically merging with any unchecked
 * grocery item that has the same normalized name and compatible unit.
 */
export async function addOrMergeGroceryItems(
  inputs: GroceryItemInput[]
): Promise<{ added: number; merged: number }> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  let added = 0;
  let merged = 0;

  await db.withTransactionAsync(async () => {
    const existingRows = await db.getAllAsync<GroceryRow>(
      'SELECT * FROM grocery_items WHERE checked = 0'
    );
    const active = existingRows.map(mapGroceryRow);

    for (const input of inputs) {
      const trimmedName = input.name.trim();
      if (!trimmedName) continue;
      const normName = normalizeIngredientName(trimmedName);
      const normUnit = normalizeUnit(input.unit ?? '').canonical;
      const incomingQty =
        input.quantity !== undefined &&
        input.quantity !== null &&
        Number.isFinite(input.quantity) &&
        input.quantity > 0
          ? Math.round(input.quantity * 100) / 100
          : null;
      const incomingSource = (input.sourceNote ?? '').trim();
      const category: GroceryCategory = input.category ?? 'pantry_dry';

      await upsertHistoryRow(
        db,
        trimmedName,
        category,
        GROCERY_CATEGORY_MAP[category].defaultPantryLocation,
        normUnit,
        now
      );

      let didMerge = false;
      for (const item of active) {
        if (item.normalizedName !== normName) continue;
        const combined = tryMergeQuantities(
          item.quantity,
          item.unit,
          incomingQty,
          normUnit
        );
        if (combined) {
          const nextSource = mergeSourceNotes(item.sourceNote, incomingSource);
          await db.runAsync(
            `UPDATE grocery_items
             SET quantity = ?, unit = ?, source_note = ?, updated_at = ?
             WHERE id = ?`,
            [combined.quantity, combined.unit, nextSource, now, item.id]
          );
          item.quantity = combined.quantity;
          item.unit = combined.unit;
          item.sourceNote = nextSource;
          merged += 1;
          didMerge = true;
          break;
        }
      }

      if (!didMerge) {
        const res = await db.runAsync(
          `INSERT INTO grocery_items
            (name, normalized_name, quantity, unit, category, checked, source_note, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`,
          [
            trimmedName,
            normName,
            incomingQty,
            normUnit,
            category,
            incomingSource,
            now,
            now,
          ]
        );
        active.push({
          id: res.lastInsertRowId,
          name: trimmedName,
          normalizedName: normName,
          quantity: incomingQty,
          unit: normUnit,
          category,
          checked: false,
          sourceNote: incomingSource,
          createdAt: now,
          updatedAt: now,
        });
        added += 1;
      }
    }
  });

  return { added, merged };
}

export async function insertExactGroceryItem(item: {
  name: string;
  quantity: number | null;
  unit: string;
  category: GroceryCategory;
  checked: boolean;
  sourceNote: string;
}): Promise<number> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const trimmedName = item.name.trim();
  const res = await db.runAsync(
    `INSERT INTO grocery_items
      (name, normalized_name, quantity, unit, category, checked, source_note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      trimmedName,
      normalizeIngredientName(trimmedName),
      item.quantity,
      normalizeUnit(item.unit).canonical,
      item.category,
      item.checked ? 1 : 0,
      item.sourceNote,
      now,
      now,
    ]
  );
  return res.lastInsertRowId;
}

export async function toggleGroceryItemChecked(
  id: number,
  checked: boolean
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE grocery_items SET checked = ?, updated_at = ? WHERE id = ?',
    [checked ? 1 : 0, new Date().toISOString(), id]
  );
}

export async function updateGroceryItem(
  id: number,
  input: {
    name: string;
    quantity: number | null;
    unit: string;
    category: GroceryCategory;
  }
): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const trimmedName = input.name.trim();
  const normUnit = normalizeUnit(input.unit).canonical;
  await db.runAsync(
    `UPDATE grocery_items
     SET name = ?, normalized_name = ?, quantity = ?, unit = ?, category = ?, updated_at = ?
     WHERE id = ?`,
    [
      trimmedName,
      normalizeIngredientName(trimmedName),
      input.quantity,
      normUnit,
      input.category,
      now,
      id,
    ]
  );
  await upsertHistoryRow(
    db,
    trimmedName,
    input.category,
    GROCERY_CATEGORY_MAP[input.category].defaultPantryLocation,
    normUnit,
    now
  );
}

export async function deleteGroceryItem(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM grocery_items WHERE id = ?', [id]);
}

export async function clearCheckedGroceries(): Promise<number> {
  const db = await getDatabase();
  const res = await db.runAsync('DELETE FROM grocery_items WHERE checked = 1');
  return res.changes;
}

/**
 * Moves all checked grocery items into the Pantry (updating existing pantry
 * items to `in_stock` or inserting new ones in the appropriate storage location)
 * and removes them from the grocery list.
 */
export async function moveCheckedGroceriesToPantry(): Promise<number> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  let movedCount = 0;

  await db.withTransactionAsync(async () => {
    const checkedRows = await db.getAllAsync<GroceryRow>(
      'SELECT * FROM grocery_items WHERE checked = 1'
    );
    if (checkedRows.length === 0) return;

    const pantryRows = await db.getAllAsync<PantryRow>('SELECT * FROM pantry_items');
    const pantryByNorm = new Map<string, PantryRow>();
    for (const p of pantryRows) {
      if (!pantryByNorm.has(p.normalized_name)) {
        pantryByNorm.set(p.normalized_name, p);
      }
    }

    for (const row of checkedRows) {
      const existing =
        pantryByNorm.get(row.normalized_name) ??
        pantryRows.find((p) => namesMatchForPantry(row.normalized_name, p.normalized_name));
      if (existing) {
        await db.runAsync(
          `UPDATE pantry_items
           SET stock_level = 'in_stock',
               quantity = COALESCE(?, quantity),
               unit = CASE WHEN ? != '' THEN ? ELSE unit END,
               updated_at = ?
           WHERE id = ?`,
          [row.quantity, row.unit, row.unit, now, existing.id]
        );
      } else {
        const cat: GroceryCategory = isGroceryCategory(row.category)
          ? row.category
          : 'pantry_dry';
        const defaultLocation = GROCERY_CATEGORY_MAP[cat].defaultPantryLocation;
        await db.runAsync(
          `INSERT INTO pantry_items
            (name, normalized_name, location, stock_level, quantity, unit, category, expires_at, notes, created_at, updated_at)
           VALUES (?, ?, ?, 'in_stock', ?, ?, ?, NULL, '', ?, ?)`,
          [
            row.name,
            row.normalized_name,
            defaultLocation,
            row.quantity,
            row.unit,
            cat,
            now,
            now,
          ]
        );
      }
      movedCount += 1;
    }

    await db.runAsync('DELETE FROM grocery_items WHERE checked = 1');
  });

  return movedCount;
}

// ---------------------------------------------------------------------------
// Seed / Restore / Clear All
// ---------------------------------------------------------------------------

export async function clearAllLarderData(): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM meal_plan_entries');
    await db.runAsync('DELETE FROM recipe_ingredients');
    await db.runAsync('DELETE FROM recipes');
    await db.runAsync('DELETE FROM grocery_items');
    await db.runAsync('DELETE FROM pantry_items');
    await db.runAsync('DELETE FROM item_history');
    await db.runAsync('DELETE FROM barcode_catalog');
    await db.runAsync("DELETE FROM app_settings WHERE key = 'last_backup_at'");
  });
}

export async function replaceAllWithBackup(
  payload: LarderBackupPayload
): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM meal_plan_entries');
    await db.runAsync('DELETE FROM recipe_ingredients');
    await db.runAsync('DELETE FROM recipes');
    await db.runAsync('DELETE FROM grocery_items');
    await db.runAsync('DELETE FROM pantry_items');

    for (const p of payload.pantryItems) {
      const name = p.name.trim();
      if (!name) continue;
      const cat = p.category ?? 'pantry_dry';
      const unit = normalizeUnit(p.unit ?? '').canonical;
      await db.runAsync(
        `INSERT INTO pantry_items
          (name, normalized_name, location, stock_level, quantity, unit, category, expires_at, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          name,
          normalizeIngredientName(name),
          p.location,
          p.stockLevel,
          p.quantity ?? null,
          unit,
          cat,
          p.expiresAt ?? null,
          (p.notes ?? '').trim(),
          now,
          now,
        ]
      );
      await upsertHistoryRow(db, name, cat, p.location, unit, now);
    }

    const recipeIdsByIndex: number[] = [];
    const recipeIdByTitle = new Map<string, number>();

    for (const r of payload.recipes) {
      const res = await db.runAsync(
        `INSERT INTO recipes
          (title, description, servings, prep_minutes, cook_minutes, photo_uri, source_url, tags_json, steps_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          r.title.trim(),
          (r.description ?? '').trim(),
          Math.max(1, Math.round(r.servings)),
          Math.max(0, Math.round(r.prepMinutes)),
          Math.max(0, Math.round(r.cookMinutes)),
          r.photoUri ?? null,
          r.sourceUrl?.trim() || null,
          JSON.stringify(r.tags),
          JSON.stringify(r.steps),
          now,
          now,
        ]
      );
      const recipeId = res.lastInsertRowId;
      recipeIdsByIndex.push(recipeId);
      recipeIdByTitle.set(r.title.trim().toLowerCase(), recipeId);

      for (let i = 0; i < r.ingredients.length; i++) {
        const ing = r.ingredients[i];
        const ingName = ing.name.trim();
        if (!ingName) continue;
        await db.runAsync(
          `INSERT INTO recipe_ingredients
            (recipe_id, name, normalized_name, quantity, unit, category, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            recipeId,
            ingName,
            normalizeIngredientName(ingName),
            ing.quantity,
            normalizeUnit(ing.unit).canonical,
            ing.category,
            i,
          ]
        );
      }
    }

    for (const entry of payload.mealPlanEntries) {
      let recipeId: number | undefined;
      if (
        entry.recipeIndex !== undefined &&
        entry.recipeIndex >= 0 &&
        entry.recipeIndex < recipeIdsByIndex.length
      ) {
        recipeId = recipeIdsByIndex[entry.recipeIndex];
      } else {
        recipeId = recipeIdByTitle.get(entry.recipeTitle.trim().toLowerCase());
      }
      if (!recipeId) continue;

      await db.runAsync(
        `INSERT INTO meal_plan_entries
          (week_start, day_index, meal_slot, recipe_id, servings, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          entry.weekStart,
          entry.dayIndex,
          entry.mealSlot,
          recipeId,
          Math.max(1, Math.round(entry.servings)),
          (entry.notes ?? '').trim(),
          now,
        ]
      );
    }

    for (const g of payload.groceryItems) {
      const name = g.name.trim();
      if (!name) continue;
      const cat = g.category ?? 'pantry_dry';
      const unit = normalizeUnit(g.unit ?? '').canonical;
      await db.runAsync(
        `INSERT INTO grocery_items
          (name, normalized_name, quantity, unit, category, checked, source_note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          name,
          normalizeIngredientName(name),
          g.quantity ?? null,
          unit,
          cat,
          g.checked ? 1 : 0,
          (g.sourceNote ?? '').trim(),
          now,
          now,
        ]
      );
      await upsertHistoryRow(
        db,
        name,
        cat,
        GROCERY_CATEGORY_MAP[cat].defaultPantryLocation,
        unit,
        now
      );
    }
  });
}
