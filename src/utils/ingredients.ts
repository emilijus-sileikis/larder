import type {
  GroceryCategory,
  GroceryItem,
  PantryItem,
  PantryMatchSummary,
  RecipeIngredient,
  StockLevel,
} from '@/types/larder';
import { isExpiringSoon } from './dates';

const INVARIANT_PLURALS = new Set([
  'hummus',
  'couscous',
  'asparagus',
  'oats',
  'rice',
  'lettuce',
  'cheese',
  'sauce',
  'juice',
  'molasses',
  'cress',
  'watercress',
  'swiss',
  'bass',
  'grass',
  'lemongrass',
  'chips',
  'greens',
  'lentils',
  'chickpeas',
  'peas',
  'beans',
]);

const IRREGULAR_SINGULARS: Record<string, string> = {
  tomatoes: 'tomato',
  potatoes: 'potato',
  halves: 'half',
  loaves: 'loaf',
  leaves: 'leaf',
  berries: 'berry',
  blueberries: 'blueberry',
  strawberries: 'strawberry',
  raspberries: 'raspberry',
  cherries: 'cherry',
  anchovies: 'anchovy',
};

function singularizeWord(word: string): string {
  if (word.length <= 3 || INVARIANT_PLURALS.has(word)) return word;
  if (word in IRREGULAR_SINGULARS) return IRREGULAR_SINGULARS[word];
  if (word.endsWith('ies') && word.length > 4) {
    return `${word.slice(0, -3)}y`;
  }
  if (/(ches|shes|xes|zes|ses)$/.test(word) && word.length > 4) {
    return word.slice(0, -2);
  }
  if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us') && !word.endsWith('is')) {
    return word.slice(0, -1);
  }
  return word;
}

/**
 * Produces a canonical comparison key for ingredient and pantry item names.
 * Supports both English and Lithuanian (UTF-8 letters like ąčęėįšųūž).
 */
export function normalizeIngredientName(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/['’„“"]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/-/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

  if (!cleaned) return '';
  return cleaned
    .split(' ')
    .map(singularizeWord)
    .join(' ');
}

export type UnitFamily = 'weight' | 'volume' | 'count' | 'other';

interface CanonicalUnitInfo {
  canonical: string;
  family: UnitFamily;
  /** Factor to convert into the family's base unit (g for weight, ml for volume, 1 for count). */
  toBase: number;
}

const UNIT_ALIASES: Record<string, CanonicalUnitInfo> = {
  '': { canonical: '', family: 'count', toBase: 1 },
  pc: { canonical: '', family: 'count', toBase: 1 },
  pcs: { canonical: '', family: 'count', toBase: 1 },
  piece: { canonical: '', family: 'count', toBase: 1 },
  pieces: { canonical: '', family: 'count', toBase: 1 },
  whole: { canonical: '', family: 'count', toBase: 1 },
  unit: { canonical: '', family: 'count', toBase: 1 },
  units: { canonical: '', family: 'count', toBase: 1 },
  vnt: { canonical: '', family: 'count', toBase: 1 },
  vienetas: { canonical: '', family: 'count', toBase: 1 },
  vienetai: { canonical: '', family: 'count', toBase: 1 },

  // Weight (base = g)
  g: { canonical: 'g', family: 'weight', toBase: 1 },
  gram: { canonical: 'g', family: 'weight', toBase: 1 },
  grams: { canonical: 'g', family: 'weight', toBase: 1 },
  gramas: { canonical: 'g', family: 'weight', toBase: 1 },
  gramai: { canonical: 'g', family: 'weight', toBase: 1 },
  gramų: { canonical: 'g', family: 'weight', toBase: 1 },
  gr: { canonical: 'g', family: 'weight', toBase: 1 },
  kg: { canonical: 'kg', family: 'weight', toBase: 1000 },
  kilogram: { canonical: 'kg', family: 'weight', toBase: 1000 },
  kilograms: { canonical: 'kg', family: 'weight', toBase: 1000 },
  kilogramas: { canonical: 'kg', family: 'weight', toBase: 1000 },
  kilogramai: { canonical: 'kg', family: 'weight', toBase: 1000 },
  kilo: { canonical: 'kg', family: 'weight', toBase: 1000 },
  kilos: { canonical: 'kg', family: 'weight', toBase: 1000 },
  oz: { canonical: 'oz', family: 'weight', toBase: 28.3495 },
  ounce: { canonical: 'oz', family: 'weight', toBase: 28.3495 },
  ounces: { canonical: 'oz', family: 'weight', toBase: 28.3495 },
  lb: { canonical: 'lb', family: 'weight', toBase: 453.592 },
  lbs: { canonical: 'lb', family: 'weight', toBase: 453.592 },
  pound: { canonical: 'lb', family: 'weight', toBase: 453.592 },
  pounds: { canonical: 'lb', family: 'weight', toBase: 453.592 },

  // Volume (base = ml)
  ml: { canonical: 'ml', family: 'volume', toBase: 1 },
  milliliter: { canonical: 'ml', family: 'volume', toBase: 1 },
  milliliters: { canonical: 'ml', family: 'volume', toBase: 1 },
  millilitre: { canonical: 'ml', family: 'volume', toBase: 1 },
  millilitres: { canonical: 'ml', family: 'volume', toBase: 1 },
  l: { canonical: 'l', family: 'volume', toBase: 1000 },
  liter: { canonical: 'l', family: 'volume', toBase: 1000 },
  liters: { canonical: 'l', family: 'volume', toBase: 1000 },
  litre: { canonical: 'l', family: 'volume', toBase: 1000 },
  litres: { canonical: 'l', family: 'volume', toBase: 1000 },
  litras: { canonical: 'l', family: 'volume', toBase: 1000 },
  litrai: { canonical: 'l', family: 'volume', toBase: 1000 },
  tsp: { canonical: 'tsp', family: 'volume', toBase: 5 },
  teaspoon: { canonical: 'tsp', family: 'volume', toBase: 5 },
  teaspoons: { canonical: 'tsp', family: 'volume', toBase: 5 },
  'a. š': { canonical: 'tsp', family: 'volume', toBase: 5 },
  'a.š': { canonical: 'tsp', family: 'volume', toBase: 5 },
  'arb. š': { canonical: 'tsp', family: 'volume', toBase: 5 },
  'arb.š': { canonical: 'tsp', family: 'volume', toBase: 5 },
  šaukštelis: { canonical: 'tsp', family: 'volume', toBase: 5 },
  šaukšteliai: { canonical: 'tsp', family: 'volume', toBase: 5 },
  šaukštelių: { canonical: 'tsp', family: 'volume', toBase: 5 },
  tbsp: { canonical: 'tbsp', family: 'volume', toBase: 15 },
  tbs: { canonical: 'tbsp', family: 'volume', toBase: 15 },
  tablespoon: { canonical: 'tbsp', family: 'volume', toBase: 15 },
  tablespoons: { canonical: 'tbsp', family: 'volume', toBase: 15 },
  'v. š': { canonical: 'tbsp', family: 'volume', toBase: 15 },
  'v.š': { canonical: 'tbsp', family: 'volume', toBase: 15 },
  'valg. š': { canonical: 'tbsp', family: 'volume', toBase: 15 },
  šaukštas: { canonical: 'tbsp', family: 'volume', toBase: 15 },
  šaukštai: { canonical: 'tbsp', family: 'volume', toBase: 15 },
  šaukštų: { canonical: 'tbsp', family: 'volume', toBase: 15 },
  cup: { canonical: 'cup', family: 'volume', toBase: 240 },
  cups: { canonical: 'cup', family: 'volume', toBase: 240 },
  stikl: { canonical: 'cup', family: 'volume', toBase: 240 },
  stiklinė: { canonical: 'cup', family: 'volume', toBase: 240 },
  stiklinės: { canonical: 'cup', family: 'volume', toBase: 240 },
  puodelis: { canonical: 'cup', family: 'volume', toBase: 240 },
  puodeliai: { canonical: 'cup', family: 'volume', toBase: 240 },

  // Discrete container/shape units
  clove: { canonical: 'clove', family: 'other', toBase: 1 },
  cloves: { canonical: 'clove', family: 'other', toBase: 1 },
  skilt: { canonical: 'clove', family: 'other', toBase: 1 },
  skiltelė: { canonical: 'clove', family: 'other', toBase: 1 },
  skiltelės: { canonical: 'clove', family: 'other', toBase: 1 },
  skiltelių: { canonical: 'clove', family: 'other', toBase: 1 },
  can: { canonical: 'can', family: 'other', toBase: 1 },
  cans: { canonical: 'can', family: 'other', toBase: 1 },
  tin: { canonical: 'can', family: 'other', toBase: 1 },
  tins: { canonical: 'can', family: 'other', toBase: 1 },
  skard: { canonical: 'can', family: 'other', toBase: 1 },
  skardinė: { canonical: 'can', family: 'other', toBase: 1 },
  skardinės: { canonical: 'can', family: 'other', toBase: 1 },
  bunch: { canonical: 'bunch', family: 'other', toBase: 1 },
  bunches: { canonical: 'bunch', family: 'other', toBase: 1 },
  ryšulėlis: { canonical: 'bunch', family: 'other', toBase: 1 },
  sauja: { canonical: 'bunch', family: 'other', toBase: 1 },
  slice: { canonical: 'slice', family: 'other', toBase: 1 },
  slices: { canonical: 'slice', family: 'other', toBase: 1 },
  riekė: { canonical: 'slice', family: 'other', toBase: 1 },
  riekės: { canonical: 'slice', family: 'other', toBase: 1 },
  riekelė: { canonical: 'slice', family: 'other', toBase: 1 },
  riekelės: { canonical: 'slice', family: 'other', toBase: 1 },
  head: { canonical: 'head', family: 'other', toBase: 1 },
  heads: { canonical: 'head', family: 'other', toBase: 1 },
  galva: { canonical: 'head', family: 'other', toBase: 1 },
  galvutė: { canonical: 'head', family: 'other', toBase: 1 },
  pack: { canonical: 'pack', family: 'other', toBase: 1 },
  packs: { canonical: 'pack', family: 'other', toBase: 1 },
  pkg: { canonical: 'pack', family: 'other', toBase: 1 },
  package: { canonical: 'pack', family: 'other', toBase: 1 },
  packages: { canonical: 'pack', family: 'other', toBase: 1 },
  pakuotė: { canonical: 'pack', family: 'other', toBase: 1 },
  bottle: { canonical: 'bottle', family: 'other', toBase: 1 },
  bottles: { canonical: 'bottle', family: 'other', toBase: 1 },
  butelis: { canonical: 'bottle', family: 'other', toBase: 1 },
  jar: { canonical: 'jar', family: 'other', toBase: 1 },
  jars: { canonical: 'jar', family: 'other', toBase: 1 },
  stiklainis: { canonical: 'jar', family: 'other', toBase: 1 },
  pinch: { canonical: 'pinch', family: 'other', toBase: 1 },
  pinches: { canonical: 'pinch', family: 'other', toBase: 1 },
  žiupsnelis: { canonical: 'pinch', family: 'other', toBase: 1 },
  žiupsn: { canonical: 'pinch', family: 'other', toBase: 1 },
  sprig: { canonical: 'sprig', family: 'other', toBase: 1 },
  sprigs: { canonical: 'sprig', family: 'other', toBase: 1 },
  šakelė: { canonical: 'sprig', family: 'other', toBase: 1 },
  stalk: { canonical: 'stalk', family: 'other', toBase: 1 },
  stalks: { canonical: 'stalk', family: 'other', toBase: 1 },
};

export function normalizeUnit(raw: string | null | undefined): CanonicalUnitInfo {
  const key = (raw ?? '').trim().toLowerCase().replace(/\.$/, '');
  if (key in UNIT_ALIASES) {
    return UNIT_ALIASES[key];
  }
  return {
    canonical: singularizeWord(key),
    family: 'other',
    toBase: 1,
  };
}

function roundClean(num: number): number {
  return Math.round(num * 100) / 100;
}

/**
 * Attempts to combine two quantities with unit awareness.
 * Returns null if units belong to incompatible families (e.g. "200 g" + "1 bunch").
 */
export function tryMergeQuantities(
  qtyA: number | null,
  unitA: string,
  qtyB: number | null,
  unitB: string
): { quantity: number | null; unit: string } | null {
  const infoA = normalizeUnit(unitA);
  const infoB = normalizeUnit(unitB);

  // If neither has a quantity, merge cleanly keeping whichever unit is non-empty.
  if (qtyA === null && qtyB === null) {
    if (infoA.canonical === infoB.canonical || !infoA.canonical || !infoB.canonical) {
      return { quantity: null, unit: infoA.canonical || infoB.canonical };
    }
    return null;
  }

  // If one item has no quantity (e.g. quick-added "Eggs") and the other has "4 eggs"
  if (qtyA === null && qtyB !== null) {
    if (!infoA.canonical || infoA.canonical === infoB.canonical) {
      return { quantity: roundClean(qtyB), unit: infoB.canonical };
    }
    return null;
  }
  if (qtyA !== null && qtyB === null) {
    if (!infoB.canonical || infoA.canonical === infoB.canonical) {
      return { quantity: roundClean(qtyA), unit: infoA.canonical };
    }
    return null;
  }

  // Both have quantities
  const a = qtyA as number;
  const b = qtyB as number;

  // Exact same canonical unit
  if (infoA.canonical === infoB.canonical) {
    const sum = roundClean(a + b);
    if (infoA.canonical === 'g' && sum >= 1000 && sum % 50 === 0) {
      return { quantity: roundClean(sum / 1000), unit: 'kg' };
    }
    if (infoA.canonical === 'ml' && sum >= 1000 && sum % 50 === 0) {
      return { quantity: roundClean(sum / 1000), unit: 'l' };
    }
    return { quantity: sum, unit: infoA.canonical };
  }

  // Same convertible family (weight or volume)
  if (infoA.family === infoB.family && (infoA.family === 'weight' || infoA.family === 'volume')) {
    const totalBase = a * infoA.toBase + b * infoB.toBase;

    if (infoA.family === 'weight') {
      // If both imperial, keep imperial
      const imperial = (u: string) => u === 'oz' || u === 'lb';
      if (imperial(infoA.canonical) && imperial(infoB.canonical)) {
        const totalOz = totalBase / 28.3495;
        if (totalOz >= 16) {
          return { quantity: roundClean(totalOz / 16), unit: 'lb' };
        }
        return { quantity: roundClean(totalOz), unit: 'oz' };
      }
      if (totalBase >= 1000) {
        return { quantity: roundClean(totalBase / 1000), unit: 'kg' };
      }
      return { quantity: Math.round(totalBase), unit: 'g' };
    }

    if (infoA.family === 'volume') {
      const spoonUnits = new Set(['tsp', 'tbsp']);
      if (spoonUnits.has(infoA.canonical) && spoonUnits.has(infoB.canonical)) {
        if (totalBase >= 15) {
          return { quantity: roundClean(totalBase / 15), unit: 'tbsp' };
        }
        return { quantity: roundClean(totalBase / 5), unit: 'tsp' };
      }
      const kitchenUnits = new Set(['tsp', 'tbsp', 'cup']);
      if (kitchenUnits.has(infoA.canonical) && kitchenUnits.has(infoB.canonical)) {
        if (totalBase >= 60) {
          return { quantity: roundClean(totalBase / 240), unit: 'cup' };
        }
        return { quantity: roundClean(totalBase / 15), unit: 'tbsp' };
      }
      if (totalBase >= 1000) {
        return { quantity: roundClean(totalBase / 1000), unit: 'l' };
      }
      return { quantity: Math.round(totalBase), unit: 'ml' };
    }
  }

  return null;
}

export interface AggregatedIngredient {
  name: string;
  normalizedName: string;
  quantity: number | null;
  unit: string;
  category: GroceryCategory;
  sources: string[];
}

/**
 * Merges a list of ingredient lines (e.g. across multiple planned recipes),
 * combining matching normalized names when units are compatible.
 */
export function mergeIngredientList(
  items: {
    name: string;
    quantity: number | null;
    unit: string;
    category: GroceryCategory;
    source?: string;
  }[]
): AggregatedIngredient[] {
  const result: AggregatedIngredient[] = [];

  for (const item of items) {
    const trimmedName = item.name.trim();
    if (!trimmedName) continue;
    const normalizedName = normalizeIngredientName(trimmedName);
    const normUnit = normalizeUnit(item.unit).canonical;

    let merged = false;
    for (const existing of result) {
      if (existing.normalizedName !== normalizedName) continue;
      const combined = tryMergeQuantities(
        existing.quantity,
        existing.unit,
        item.quantity,
        normUnit
      );
      if (combined) {
        existing.quantity = combined.quantity;
        existing.unit = combined.unit;
        if (item.source && !existing.sources.includes(item.source)) {
          existing.sources.push(item.source);
        }
        merged = true;
        break;
      }
    }

    if (!merged) {
      result.push({
        name: trimmedName,
        normalizedName,
        quantity: item.quantity !== null ? roundClean(item.quantity) : null,
        unit: normUnit,
        category: item.category,
        sources: item.source ? [item.source] : [],
      });
    }
  }

  return result;
}

const FRACTIONS: [number, string][] = [
  [0.125, '⅛'],
  [0.25, '¼'],
  [1 / 3, '⅓'],
  [0.5, '½'],
  [2 / 3, '⅔'],
  [0.75, '¾'],
];

export function formatQuantity(quantity: number | null): string {
  if (quantity === null || !Number.isFinite(quantity)) return '';
  if (quantity === 0) return '0';

  const whole = Math.floor(quantity);
  const frac = quantity - whole;

  if (frac < 0.03) return String(whole);
  if (frac > 0.97) return String(whole + 1);

  for (const [val, glyph] of FRACTIONS) {
    if (Math.abs(frac - val) < 0.04) {
      return whole > 0 ? `${whole}${glyph}` : glyph;
    }
  }

  const rounded = Math.round(quantity * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

const PLURALIZABLE_UNITS = new Set([
  'clove',
  'can',
  'bunch',
  'slice',
  'head',
  'pack',
  'bottle',
  'jar',
  'pinch',
  'sprig',
  'stalk',
  'cup',
]);

export function formatQuantityWithUnit(quantity: number | null, unit: string): string {
  const qtyStr = formatQuantity(quantity);
  const cleanUnit = unit.trim();
  if (!qtyStr && !cleanUnit) return '';
  if (!qtyStr) return cleanUnit;
  if (!cleanUnit) return qtyStr;

  let displayUnit = cleanUnit;
  if (quantity !== null && quantity > 1 && PLURALIZABLE_UNITS.has(cleanUnit)) {
    displayUnit =
      cleanUnit === 'bunch' || cleanUnit === 'pinch' ? `${cleanUnit}es` : `${cleanUnit}s`;
  }
  return `${qtyStr} ${displayUnit}`;
}

export function formatIngredientLine(
  name: string,
  quantity: number | null,
  unit: string
): string {
  const prefix = formatQuantityWithUnit(quantity, unit);
  return prefix ? `${prefix} ${name}` : name;
}

const HARMLESS_QUALIFIERS = new Set([
  'extra',
  'virgin',
  'fresh',
  'organic',
  'large',
  'medium',
  'small',
  'raw',
  'whole',
  'kosher',
  'sea',
  'fine',
  'coarse',
  'unsalted',
  'salted',
  'baby',
  'yellow',
  'red',
  'white',
  'green',
  'free',
  'range',
  'low',
  'fat',
  'plain',
  'ripe',
  'boneless',
  'skinless',
  'lean',
  'firm',
  'regular',
  'pure',
]);

/**
 * Checks whether a recipe ingredient matches a pantry item by normalized name
 * or safe head-noun qualifier matching (e.g. "olive oil" matches "extra virgin
 * olive oil", "salt" matches "kosher salt", while "garlic" will NOT falsely
 * match "garlic powder" and "milk" will NOT match "coconut milk").
 */
export function namesMatchForPantry(a: string, b: string): boolean {
  const normA = normalizeIngredientName(a);
  const normB = normalizeIngredientName(b);
  if (!normA || !normB) return false;
  if (normA === normB) return true;

  const tokensA = normA.split(' ');
  const tokensB = normB.split(' ');

  // Head noun (final word) must match
  if (tokensA[tokensA.length - 1] !== tokensB[tokensB.length - 1]) {
    return false;
  }

  const [shorter, longer] =
    tokensA.length <= tokensB.length ? [tokensA, tokensB] : [tokensB, tokensA];

  if (shorter.length === 1 && shorter[0].length < 3) return false;
  const shorterSet = new Set(shorter);
  const longerSet = new Set(longer);
  if (!shorter.every((tok) => longerSet.has(tok))) {
    return false;
  }

  // Every extra modifier token in the longer name must be a harmless qualifier
  const extraTokens = longer.filter((tok) => !shorterSet.has(tok));
  return extraTokens.length > 0 && extraTokens.every((tok) => HARMLESS_QUALIFIERS.has(tok));
}

/**
 * Parses a quick-add string like "4 eggs", "500g pasta", "1/2 cup milk",
 * or "1 1/2 tbsp honey".
 */
export function parseQuickGroceryInput(raw: string): {
  name: string;
  quantity: number | null;
  unit: string;
} {
  const trimmed = raw.trim();
  if (!trimmed) return { name: '', quantity: null, unit: '' };

  const match = trimmed.match(
    /^(?:(\d+)\s+(\d+)\/(\d+)|(\d+)\/(\d+)|(\d+(?:[.,]\d+)?))\s*(g|kg|ml|l|tsp|tbsp|cup|cups|oz|lb|lbs|can|cans|clove|cloves|bunch|bunches|slice|slices|pack|packs|bottle|bottles|jar|jars|loaf|loaves|pcs|pc|vnt\.?|stikl\.?|skilt\.?|skiltelės?|skard\.?|šaukšt(?:as|ai|ų|elis|eliai|elių)?|arb\.\s*š\.?|v\.\s*š\.?|a\.\s*š\.?)?\s+(.+)$/i
  );
  if (!match) {
    return { name: trimmed, quantity: null, unit: '' };
  }

  let qty = NaN;
  if (match[1] && match[2] && match[3]) {
    const denom = Number(match[3]);
    if (denom > 0) qty = Number(match[1]) + Number(match[2]) / denom;
  } else if (match[4] && match[5]) {
    const denom = Number(match[5]);
    if (denom > 0) qty = Number(match[4]) / denom;
  } else if (match[6]) {
    qty = Number(match[6].replace(',', '.'));
  }

  const unit = match[7] ?? '';
  const name = match[8].trim();
  if (!Number.isFinite(qty) || qty <= 0 || !name) {
    return { name: trimmed, quantity: null, unit: '' };
  }
  return { name, quantity: Math.round(qty * 100) / 100, unit };
}

export function findMatchingPantryItem(
  ingredientName: string,
  pantryItems: PantryItem[]
): PantryItem | null {
  const norm = normalizeIngredientName(ingredientName);
  if (!norm) return null;

  // Prefer exact normalized match first
  const exact = pantryItems.find((p) => p.normalizedName === norm);
  if (exact) return exact;

  // Then prefer in_stock fuzzy match over low/out fuzzy match
  const fuzzyMatches = pantryItems.filter((p) =>
    namesMatchForPantry(norm, p.normalizedName)
  );
  if (fuzzyMatches.length === 0) return null;
  const inStock = fuzzyMatches.find((p) => p.stockLevel === 'in_stock');
  if (inStock) return inStock;
  const low = fuzzyMatches.find((p) => p.stockLevel === 'low');
  return low ?? fuzzyMatches[0];
}

export function computeRecipePantryMatch(
  ingredients: RecipeIngredient[],
  pantryItems: PantryItem[]
): PantryMatchSummary {
  const ingredientStatus: Record<number, StockLevel | 'missing'> = {};
  let onHandCount = 0;
  let lowCount = 0;
  let usesExpiringCount = 0;

  for (const ing of ingredients) {
    const match = findMatchingPantryItem(ing.name, pantryItems);
    if (!match) {
      ingredientStatus[ing.id] = 'missing';
    } else {
      ingredientStatus[ing.id] = match.stockLevel;
      if (match.stockLevel === 'in_stock') {
        onHandCount += 1;
      } else if (match.stockLevel === 'low') {
        lowCount += 1;
      }
      if (match.stockLevel !== 'out' && isExpiringSoon(match.expiresAt, 3)) {
        usesExpiringCount += 1;
      }
    }
  }

  const totalCount = ingredients.length;
  return {
    onHandCount,
    lowCount,
    totalCount,
    ratio: totalCount > 0 ? onHandCount / totalCount : 0,
    usesExpiringCount,
    ingredientStatus,
  };
}

/**
 * Formats unchecked grocery items grouped by store aisle into a clean plain-text checklist
 * for copying or sharing.
 */
export function formatGroceryListAsPlainText(
  items: GroceryItem[],
  aisleOrder: GroceryCategory[],
  aisleLabelResolver: (cat: GroceryCategory) => string,
  title: string
): string {
  const unchecked = items.filter((i) => !i.checked);
  if (unchecked.length === 0) return '';

  const byCat = new Map<GroceryCategory, GroceryItem[]>();
  for (const item of unchecked) {
    const list = byCat.get(item.category) ?? [];
    list.push(item);
    byCat.set(item.category, list);
  }

  const lines: string[] = [title, ''];
  for (const cat of aisleOrder) {
    const group = byCat.get(cat);
    if (!group || group.length === 0) continue;
    lines.push(`${aisleLabelResolver(cat)}:`);
    for (const g of group) {
      lines.push(`☐ ${formatIngredientLine(g.name, g.quantity, g.unit)}`);
    }
    lines.push('');
  }
  return lines.join('\n').trim();
}
