import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

export type IoniconName = ComponentProps<typeof Ionicons>['name'];

export type ThemeMode = 'system' | 'light' | 'dark';

export type GroceryCategory =
  | 'produce'
  | 'dairy_eggs'
  | 'meat_fish'
  | 'bakery'
  | 'pantry_dry'
  | 'frozen'
  | 'household';

export type PantryLocation = 'fridge' | 'freezer' | 'pantry' | 'spices';

export type StockLevel = 'in_stock' | 'low' | 'out';

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface PantryItem {
  id: number;
  name: string;
  normalizedName: string;
  location: PantryLocation;
  stockLevel: StockLevel;
  quantity: number | null;
  unit: string;
  category: GroceryCategory;
  expiresAt: string | null; // YYYY-MM-DD
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface PantryItemInput {
  name: string;
  location: PantryLocation;
  stockLevel: StockLevel;
  quantity?: number | null;
  unit?: string;
  category?: GroceryCategory;
  expiresAt?: string | null;
  notes?: string;
}

export interface RecipeIngredient {
  id: number;
  recipeId: number;
  name: string;
  normalizedName: string;
  quantity: number | null;
  unit: string;
  category: GroceryCategory;
  sortOrder: number;
}

export interface RecipeIngredientInput {
  name: string;
  quantity: number | null;
  unit: string;
  category: GroceryCategory;
}

export interface Recipe {
  id: number;
  title: string;
  description: string;
  servings: number;
  prepMinutes: number;
  cookMinutes: number;
  photoUri: string | null;
  sourceUrl: string | null;
  tags: string[];
  steps: string[];
  ingredients: RecipeIngredient[];
  createdAt: string;
  updatedAt: string;
}

export interface RecipeInput {
  title: string;
  description?: string;
  servings: number;
  prepMinutes: number;
  cookMinutes: number;
  photoUri?: string | null;
  sourceUrl?: string | null;
  tags: string[];
  steps: string[];
  ingredients: RecipeIngredientInput[];
}

export interface MealPlanEntry {
  id: number;
  weekStart: string; // YYYY-MM-DD (Monday)
  dayIndex: number; // 0..6 (Mon..Sun), or -1 for flexible "This Week" queue
  mealSlot: MealSlot;
  recipeId: number;
  servings: number;
  notes: string;
  createdAt: string;
}

export interface MealPlanEntryInput {
  weekStart: string;
  dayIndex: number;
  mealSlot: MealSlot;
  recipeId: number;
  servings: number;
  notes?: string;
}

export interface GroceryItem {
  id: number;
  name: string;
  normalizedName: string;
  quantity: number | null;
  unit: string;
  category: GroceryCategory;
  checked: boolean;
  sourceNote: string;
  createdAt: string;
  updatedAt: string;
}

export interface GroceryItemInput {
  name: string;
  quantity?: number | null;
  unit?: string;
  category?: GroceryCategory;
  sourceNote?: string;
}

export interface PantryMatchSummary {
  onHandCount: number;
  lowCount: number;
  totalCount: number;
  ratio: number;
  usesExpiringCount: number;
  ingredientStatus: Record<number, StockLevel | 'missing'>;
}

export interface StapleHistoryEntry {
  normalizedName: string;
  name: string;
  category: GroceryCategory;
  location: PantryLocation;
  unit: string;
  useCount: number;
  lastUsedAt: string;
}

export interface BarcodeProductEntry {
  barcode: string;
  name: string;
  category: GroceryCategory;
  location: PantryLocation;
  unit: string;
  updatedAt: string;
}

export interface BackupRecipeEntry extends RecipeInput {
  photoBase64?: string | null;
  photoExt?: string | null;
}

export interface LarderBackupPayload {
  version: 1;
  app: 'Larder';
  exportedAt: string;
  pantryItems: PantryItemInput[];
  recipes: BackupRecipeEntry[];
  mealPlanEntries: {
    weekStart: string;
    dayIndex: number;
    mealSlot: MealSlot;
    recipeTitle: string;
    recipeIndex?: number;
    servings: number;
    notes: string;
  }[];
  groceryItems: (GroceryItemInput & { checked?: boolean })[];
}
