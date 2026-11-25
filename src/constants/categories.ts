import type {
  GroceryCategory,
  IoniconName,
  MealSlot,
  PantryLocation,
  StockLevel,
} from '@/types/larder';

export interface GroceryCategoryMeta {
  id: GroceryCategory;
  label: string;
  shortLabel: string;
  icon: IoniconName;
  defaultPantryLocation: PantryLocation;
}

export const GROCERY_CATEGORIES: GroceryCategoryMeta[] = [
  {
    id: 'produce',
    label: 'Produce',
    shortLabel: 'Produce',
    icon: 'leaf-outline',
    defaultPantryLocation: 'fridge',
  },
  {
    id: 'dairy_eggs',
    label: 'Dairy & Eggs',
    shortLabel: 'Dairy & Eggs',
    icon: 'egg-outline',
    defaultPantryLocation: 'fridge',
  },
  {
    id: 'meat_fish',
    label: 'Meat & Fish',
    shortLabel: 'Meat & Fish',
    icon: 'fish-outline',
    defaultPantryLocation: 'fridge',
  },
  {
    id: 'bakery',
    label: 'Bakery',
    shortLabel: 'Bakery',
    icon: 'cafe-outline',
    defaultPantryLocation: 'pantry',
  },
  {
    id: 'pantry_dry',
    label: 'Pantry / Dry Goods',
    shortLabel: 'Dry Goods',
    icon: 'cube-outline',
    defaultPantryLocation: 'pantry',
  },
  {
    id: 'frozen',
    label: 'Frozen',
    shortLabel: 'Frozen',
    icon: 'snow-outline',
    defaultPantryLocation: 'freezer',
  },
  {
    id: 'household',
    label: 'Household / Other',
    shortLabel: 'Household',
    icon: 'basket-outline',
    defaultPantryLocation: 'pantry',
  },
];

export const GROCERY_CATEGORY_MAP: Record<GroceryCategory, GroceryCategoryMeta> =
  Object.fromEntries(GROCERY_CATEGORIES.map((c) => [c.id, c])) as Record<
    GroceryCategory,
    GroceryCategoryMeta
  >;

export interface PantryLocationMeta {
  id: PantryLocation;
  label: string;
  icon: IoniconName;
  defaultGroceryCategory: GroceryCategory;
}

export const PANTRY_LOCATIONS: PantryLocationMeta[] = [
  {
    id: 'fridge',
    label: 'Fridge',
    icon: 'thermometer-outline',
    defaultGroceryCategory: 'produce',
  },
  {
    id: 'freezer',
    label: 'Freezer',
    icon: 'snow-outline',
    defaultGroceryCategory: 'frozen',
  },
  {
    id: 'pantry',
    label: 'Pantry',
    icon: 'file-tray-stacked-outline',
    defaultGroceryCategory: 'pantry_dry',
  },
  {
    id: 'spices',
    label: 'Spices & Staples',
    icon: 'flame-outline',
    defaultGroceryCategory: 'pantry_dry',
  },
];

export const PANTRY_LOCATION_MAP: Record<PantryLocation, PantryLocationMeta> =
  Object.fromEntries(PANTRY_LOCATIONS.map((l) => [l.id, l])) as Record<
    PantryLocation,
    PantryLocationMeta
  >;

export const STOCK_LEVELS: { id: StockLevel; label: string; shortLabel: string }[] = [
  { id: 'in_stock', label: 'In Stock', shortLabel: 'In Stock' },
  { id: 'low', label: 'Low', shortLabel: 'Low' },
  { id: 'out', label: 'Out', shortLabel: 'Out' },
];

export const MEAL_SLOTS: { id: MealSlot; label: string; icon: IoniconName }[] = [
  { id: 'breakfast', label: 'Breakfast', icon: 'sunny-outline' },
  { id: 'lunch', label: 'Lunch', icon: 'partly-sunny-outline' },
  { id: 'dinner', label: 'Dinner', icon: 'moon-outline' },
  { id: 'snack', label: 'Snack', icon: 'nutrition-outline' },
];

export const DEFAULT_RECIPE_TAGS = [
  'Quick',
  'High-Protein',
  'Dinner',
  'Lunch',
  'Breakfast',
  'Meal Prep',
  'Vegetarian',
  'One-Pot',
  'Comfort',
];

export const COMMON_UNITS = [
  '',
  'g',
  'kg',
  'ml',
  'l',
  'tsp',
  'tbsp',
  'cup',
  'oz',
  'lb',
  'clove',
  'can',
  'bunch',
  'slice',
  'pack',
  'pinch',
];

export function isGroceryCategory(val: unknown): val is GroceryCategory {
  return typeof val === 'string' && val in GROCERY_CATEGORY_MAP;
}

export function isPantryLocation(val: unknown): val is PantryLocation {
  return typeof val === 'string' && val in PANTRY_LOCATION_MAP;
}

export function isStockLevel(val: unknown): val is StockLevel {
  return val === 'in_stock' || val === 'low' || val === 'out';
}

export function isMealSlot(val: unknown): val is MealSlot {
  return val === 'breakfast' || val === 'lunch' || val === 'dinner' || val === 'snack';
}
