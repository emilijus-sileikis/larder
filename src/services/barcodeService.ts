import { GROCERY_CATEGORY_MAP } from '@/constants/categories';
import {
  getLocalBarcodeProduct,
  saveLocalBarcodeProduct,
} from '@/db/database';
import type { Language } from '@/i18n/translations';
import type { GroceryCategory, PantryLocation } from '@/types/larder';
import { guessGroceryCategory } from '@/utils/recipeParser';

export interface BarcodeLookupResult {
  barcode: string;
  found: boolean;
  source: 'local' | 'openfoodfacts' | 'none';
  name: string;
  category: GroceryCategory;
  location: PantryLocation;
  quantity: number | null;
  unit: string;
}

function parseOpenFoodFactsQuantity(raw: unknown): {
  quantity: number | null;
  unit: string;
} {
  if (typeof raw !== 'string') return { quantity: null, unit: '' };
  const match = raw.trim().match(/^(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l|oz|lb)\b/i);
  if (!match) return { quantity: null, unit: '' };
  const qty = Number(match[1].replace(',', '.'));
  if (!Number.isFinite(qty) || qty <= 0) return { quantity: null, unit: '' };
  return { quantity: Math.round(qty * 100) / 100, unit: match[2].toLowerCase() };
}

/**
 * Resolves a scanned barcode:
 * 1. Checks local SQLite barcode_catalog first (100% offline, instant).
 * 2. If not cached locally, tries the free public Open Food Facts API (5s timeout)
 *    and caches any match locally for offline reuse.
 */
export async function lookupBarcodeProduct(
  rawCode: string,
  lang: Language = 'en'
): Promise<BarcodeLookupResult> {
  const barcode = rawCode.trim();
  if (!/^[A-Za-z0-9._-]{3,48}$/.test(barcode)) {
    return {
      barcode,
      found: false,
      source: 'none',
      name: '',
      category: 'pantry_dry',
      location: 'pantry',
      quantity: null,
      unit: '',
    };
  }
  const local = await getLocalBarcodeProduct(barcode);
  if (local) {
    return {
      barcode,
      found: true,
      source: 'local',
      name: local.name,
      category: local.category,
      location: local.location,
      quantity: null,
      unit: local.unit,
    };
  }

  // Optional online lookup via free Open Food Facts API
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=product_name,product_name_lt,product_name_en,categories_tags,quantity`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'LarderApp/1.1 (local-first personal pantry app)',
      },
    });
    if (res.ok) {
      const json = (await res.json()) as {
        status?: number;
        product?: {
          product_name?: string;
          product_name_lt?: string;
          product_name_en?: string;
          categories_tags?: string[];
          quantity?: string;
        };
      };
      const prod = json?.product;
      const rawName =
        (lang === 'lt' ? prod?.product_name_lt : prod?.product_name_en) ||
        prod?.product_name ||
        prod?.product_name_en ||
        prod?.product_name_lt ||
        '';
      const name = rawName.trim();
      if (json.status === 1 && name) {
        const hintText = [name, ...(prod?.categories_tags ?? [])].join(' ');
        const category = guessGroceryCategory(hintText);
        const location = GROCERY_CATEGORY_MAP[category].defaultPantryLocation;
        const { quantity, unit } = parseOpenFoodFactsQuantity(prod?.quantity);

        await saveLocalBarcodeProduct({
          barcode,
          name,
          category,
          location,
          unit,
        });

        return {
          barcode,
          found: true,
          source: 'openfoodfacts',
          name,
          category,
          location,
          quantity,
          unit,
        };
      }
    }
  } catch {
    // Offline or timeout — gracefully fall back to manual entry
  } finally {
    clearTimeout(timer);
  }

  return {
    barcode,
    found: false,
    source: 'none',
    name: '',
    category: 'pantry_dry',
    location: 'pantry',
    quantity: null,
    unit: '',
  };
}
