import type {
  GroceryCategory,
  RecipeIngredientInput,
  RecipeInput,
} from '@/types/larder';
import { normalizeUnit } from './ingredients';

const UNICODE_FRACTIONS: Record<string, string> = {
  '½': ' 1/2',
  '⅓': ' 1/3',
  '⅔': ' 2/3',
  '¼': ' 1/4',
  '¾': ' 3/4',
  '⅕': ' 1/5',
  '⅖': ' 2/5',
  '⅗': ' 3/5',
  '⅘': ' 4/5',
  '⅙': ' 1/6',
  '⅚': ' 5/6',
  '⅛': ' 1/8',
  '⅜': ' 3/8',
  '⅝': ' 5/8',
  '⅞': ' 7/8',
};

export function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&ndash;/gi, '–')
    .replace(/&mdash;/gi, '—')
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCharCode(Number(dec)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseIsoDurationToMinutes(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.max(0, Math.round(raw));
  }
  if (typeof raw !== 'string') return 0;
  const trimmed = raw.trim();
  if (!trimmed) return 0;

  // ISO 8601 duration: P0DT1H30M, PT45M, PT2H
  const isoMatch = trimmed.match(
    /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i
  );
  if (isoMatch && (isoMatch[1] || isoMatch[2] || isoMatch[3] || isoMatch[4])) {
    const days = Number(isoMatch[1] ?? 0);
    const hours = Number(isoMatch[2] ?? 0);
    const mins = Number(isoMatch[3] ?? 0);
    const secs = Number(isoMatch[4] ?? 0);
    return Math.max(0, days * 1440 + hours * 60 + mins + Math.round(secs / 60));
  }

  // Fallback plain text like "1 val. 20 min." or "45 mins"
  const hoursMatch = trimmed.match(/(\d+)\s*(?:h|hr|hrs|hour|hours|val)/i);
  const minsMatch = trimmed.match(/(\d+)\s*(?:m|min|mins|minute|minutes|min\.)/i);
  if (hoursMatch || minsMatch) {
    return (
      Number(hoursMatch?.[1] ?? 0) * 60 + Number(minsMatch?.[1] ?? 0)
    );
  }
  const bare = Number(trimmed);
  return Number.isFinite(bare) && bare > 0 ? Math.round(bare) : 0;
}

export function parseServings(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return Math.min(50, Math.max(1, Math.round(raw)));
  }
  if (Array.isArray(raw) && raw.length > 0) {
    return parseServings(raw[0]);
  }
  if (typeof raw === 'string') {
    const match = raw.match(/\d+/);
    if (match) {
      const n = Number(match[0]);
      if (Number.isFinite(n) && n > 0) {
        return Math.min(50, Math.max(1, n));
      }
    }
  }
  return 2;
}

const CATEGORY_PATTERNS: [GroceryCategory, RegExp][] = [
  [
    'frozen',
    /(?:^|[^\p{L}])(frozen|šaldyt|šaldik|ice cream|ledai)/iu,
  ],
  [
    'meat_fish',
    /(?:^|[^\p{L}])(chicken|beef|pork|turkey|lamb|bacon|sausage|ham|steak|salmon|tuna|shrimp|prawn|cod|fish|vištien|jautien|kiaulien|kalakutien|šonin|dešr|kump|lašiš|tun|krevet|žuv|menk|farš)/iu,
  ],
  [
    'dairy_eggs',
    /(?:^|[^\p{L}])(milk|eggs?|butter|cheese|parmesan|feta|mozzarella|cheddar|yogh?urt|cream|sour cream|ricotta|tofu|pien|kiaušin|sviest|sūr|parmezan|fet|mocarel|jogurt|grietin|varšk|kefyr)/iu,
  ],
  [
    'bakery',
    /(?:^|[^\p{L}])(bread|sourdough|baguette|bun|roll|tortilla|pita|croissant|duon|baton|bandel|lavaš|tortilij)/iu,
  ],
  [
    'produce',
    /(?:^|[^\p{L}])(onion|garlic|tomato|spinach|lemon|lime|potato|carrot|pepper|bell pepper|cucumber|lettuce|broccoli|cauliflower|mushroom|avocado|apple|banana|berr(?:y|ies)|cilantro|parsley|basil|dill|ginger|celery|zucchini|courgette|cabbage|beet|leek|scallion|shallot|svogūn|česnak|pomidor|špinat|citrin|laim|bulv|mork|paprik|agurk|salot|brokol|žiedin|gryb|pievagryb|avokad|obuol|banan|uog|petražol|bazilik|krap|imbier|salier|cukinij|kopūst|burok|por)/iu,
  ],
];

export function guessGroceryCategory(name: string): GroceryCategory {
  for (const [cat, pattern] of CATEGORY_PATTERNS) {
    if (pattern.test(name)) return cat;
  }
  return 'pantry_dry';
}

const UNIT_TOKEN_PATTERN =
  /^(g|gr|gram|grams|gramas|gramai|gramų|kg|kilogram|kilograms|kilo|ml|milliliter|milliliters|l|liter|liters|litre|litres|tsp|teaspoon|teaspoons|tbsp|tbs|tablespoon|tablespoons|cup|cups|oz|ounce|ounces|lb|lbs|pound|pounds|clove|cloves|can|cans|tin|tins|bunch|bunches|slice|slices|head|heads|pack|packs|pkg|package|packages|bottle|bottles|jar|jars|pinch|pinches|sprig|sprigs|stalk|stalks|piece|pieces|pcs|pc|vnt|stikl|stiklinė|stiklinės|puodelis|puodeliai|skilt|skiltelė|skiltelės|skiltelių|skard|skardinė|skardinės|riekė|riekės|riekelė|riekelės|sauja|žiupsnelis|žiupsn|šakelė|pakuotė|butelis|stiklainis|šaukštas|šaukštai|šaukštų|šaukštelis|šaukšteliai|šaukštelių|arb\.\s*š|v\.\s*š|a\.\s*š|valg\.\s*š)\.?(?=$|[\s,.:;()/-])/iu;

function parseLeadingNumber(text: string): { value: number; rest: string } | null {
  // Range like "2-3" or "2–3" -> take upper/avg cleanly (use first number if range is small)
  const rangeMatch = text.match(/^(\d+(?:[.,]\d+)?)\s*[-–]\s*(\d+(?:[.,]\d+)?)\b\s*/);
  if (rangeMatch) {
    const a = Number(rangeMatch[1].replace(',', '.'));
    const b = Number(rangeMatch[2].replace(',', '.'));
    if (Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > 0) {
      return {
        value: Math.round(((a + b) / 2) * 100) / 100,
        rest: text.slice(rangeMatch[0].length),
      };
    }
  }

  // Mixed number "1 1/2"
  const mixedMatch = text.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)\b\s*/);
  if (mixedMatch) {
    const whole = Number(mixedMatch[1]);
    const num = Number(mixedMatch[2]);
    const den = Number(mixedMatch[3]);
    if (den > 0) {
      return {
        value: Math.round((whole + num / den) * 100) / 100,
        rest: text.slice(mixedMatch[0].length),
      };
    }
  }

  // Simple fraction "1/2"
  const fracMatch = text.match(/^(\d+)\s*\/\s*(\d+)\b\s*/);
  if (fracMatch) {
    const num = Number(fracMatch[1]);
    const den = Number(fracMatch[2]);
    if (den > 0) {
      return {
        value: Math.round((num / den) * 100) / 100,
        rest: text.slice(fracMatch[0].length),
      };
    }
  }

  // Decimal or integer "200" or "1.5" or "0,5"
  const decMatch = text.match(/^(\d+(?:[.,]\d+)?)\s*/);
  if (decMatch) {
    const val = Number(decMatch[1].replace(',', '.'));
    if (Number.isFinite(val) && val > 0) {
      return {
        value: Math.round(val * 100) / 100,
        rest: text.slice(decMatch[0].length),
      };
    }
  }

  return null;
}

export function parseRecipeIngredientLine(rawLine: string): RecipeIngredientInput | null {
  let line = decodeHtmlEntities(rawLine)
    .replace(/^[-•*·▪◦☐□]\s*/, '')
    .trim();
  if (!line) return null;

  // Replace unicode fractions with ASCII fractions
  for (const [glyph, ascii] of Object.entries(UNICODE_FRACTIONS)) {
    line = line.replaceAll(glyph, ascii);
  }
  line = line.replace(/\s+/g, ' ').trim();

  let quantity: number | null = null;
  let unit = '';
  let rest = line;

  const numParsed = parseLeadingNumber(rest);
  if (numParsed) {
    quantity = numParsed.value;
    rest = numParsed.rest;

    // Strip optional parenthetical package size like "(400g)" right before unit
    const parenMatch = rest.match(/^\([^)]{1,20}\)\s*/);
    if (parenMatch) {
      rest = rest.slice(parenMatch[0].length);
    }

    const unitMatch = rest.match(UNIT_TOKEN_PATTERN);
    if (unitMatch) {
      const afterUnit = rest.slice(unitMatch[0].length);
      // Only accept unit if followed by whitespace, end, or punctuation (not mid-word like "lemons")
      if (!afterUnit || /^[\s,.:;()/-]/.test(afterUnit)) {
        unit = normalizeUnit(unitMatch[1]).canonical;
        rest = afterUnit.replace(/^\s*(?:of\s+)?/i, '').trim();
      }
    }
  }

  // Clean trailing punctuation or excess whitespace
  const cleanedName = rest
    .replace(/^[,.:;\-–]+\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();

  const finalName = cleanedName || line;
  return {
    name: finalName.charAt(0).toUpperCase() + finalName.slice(1),
    quantity,
    unit,
    category: guessGroceryCategory(finalName),
  };
}

function hasRecipeType(node: Record<string, unknown>): boolean {
  const t = node['@type'];
  if (typeof t === 'string') return t.toLowerCase() === 'recipe';
  if (Array.isArray(t)) {
    return t.some((item) => typeof item === 'string' && item.toLowerCase() === 'recipe');
  }
  return false;
}

function findRecipeJsonLdNode(node: unknown): Record<string, unknown> | null {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findRecipeJsonLdNode(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    if (hasRecipeType(obj)) return obj;
    if (Array.isArray(obj['@graph'])) {
      const found = findRecipeJsonLdNode(obj['@graph']);
      if (found) return found;
    }
    for (const val of Object.values(obj)) {
      if (val && typeof val === 'object') {
        const found = findRecipeJsonLdNode(val);
        if (found) return found;
      }
    }
  }
  return null;
}

function extractInstructions(raw: unknown): string[] {
  if (!raw) return [];
  if (typeof raw === 'string') {
    const decoded = decodeHtmlEntities(raw);
    return decoded
      .split(/\r?\n+|(?:\s*\d+\.\s+)/)
      .map((s) => s.trim())
      .filter((s) => s.length > 2);
  }
  if (Array.isArray(raw)) {
    const out: string[] = [];
    for (const item of raw) {
      if (typeof item === 'string') {
        const clean = decodeHtmlEntities(item);
        if (clean) out.push(clean);
      } else if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        if (Array.isArray(obj.itemListElement)) {
          out.push(...extractInstructions(obj.itemListElement));
        } else if (typeof obj.text === 'string') {
          const clean = decodeHtmlEntities(obj.text);
          if (clean) out.push(clean);
        } else if (typeof obj.name === 'string') {
          const clean = decodeHtmlEntities(obj.name);
          if (clean) out.push(clean);
        }
      }
    }
    return out;
  }
  return [];
}

function extractImageUrl(raw: unknown): string | null {
  if (!raw) return null;
  if (typeof raw === 'string' && /^https?:\/\//i.test(raw)) return raw;
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const found = extractImageUrl(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (typeof obj.url === 'string' && /^https?:\/\//i.test(obj.url)) return obj.url;
    if (typeof obj.contentUrl === 'string' && /^https?:\/\//i.test(obj.contentUrl)) {
      return obj.contentUrl;
    }
  }
  return null;
}

function extractTags(recipeNode: Record<string, unknown>): string[] {
  const tags = new Set<string>();
  const addRaw = (val: unknown) => {
    if (typeof val === 'string') {
      for (const piece of val.split(',')) {
        const clean = decodeHtmlEntities(piece).trim();
        if (clean.length >= 2 && clean.length <= 24) {
          tags.add(clean);
        }
      }
    } else if (Array.isArray(val)) {
      for (const item of val) addRaw(item);
    }
  };
  addRaw(recipeNode.recipeCategory);
  addRaw(recipeNode.recipeCuisine);
  addRaw(recipeNode.keywords);
  return Array.from(tags).slice(0, 5);
}

function extractMetaContent(html: string, nameOrProp: string): string | null {
  const escaped = nameOrProp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re1 = new RegExp(
    `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`,
    'i'
  );
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`,
    'i'
  );
  const match = html.match(re1) ?? html.match(re2);
  return match ? decodeHtmlEntities(match[1]) : null;
}

export interface ParsedWebRecipe {
  recipe: RecipeInput;
  imageUrl: string | null;
}

function tryParseJsonLd(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    try {
      // Handle trailing commas and stray control chars common on blog plugins
      const cleaned = raw
        .replace(/[\u0000-\u001F]+/g, ' ')
        .replace(/,\s*([}\]])/g, '$1');
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  }
}

function extractListItemsAfterHeading(
  html: string,
  headingPattern: RegExp
): string[] {
  const headingRe = /<h[1-5][^>]*>([\s\S]*?)<\/h[1-5]>/gi;
  let m: RegExpExecArray | null;
  while ((m = headingRe.exec(html)) !== null) {
    const headingText = decodeHtmlEntities(m[1]);
    if (!headingPattern.test(headingText)) continue;
    const after = html.slice(m.index + m[0].length, m.index + m[0].length + 6000);
    const listMatch = after.match(/<(?:ul|ol)[^>]*>([\s\S]*?)<\/(?:ul|ol)>/i);
    if (listMatch) {
      const items: string[] = [];
      const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
      let li: RegExpExecArray | null;
      while ((li = liRe.exec(listMatch[1])) !== null) {
        const clean = decodeHtmlEntities(li[1]);
        if (clean.length > 1) items.push(clean);
      }
      if (items.length > 0) return items;
    }
  }
  return [];
}

export function extractRecipeFromHtml(
  html: string,
  sourceUrl: string | null = null
): ParsedWebRecipe {
  // 1. Try Schema.org JSON-LD scripts
  const scriptRegex =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = scriptRegex.exec(html)) !== null) {
    const body = match[1].trim();
    if (!body) continue;
    const parsed = tryParseJsonLd(body);
    if (!parsed) continue;
    const node = findRecipeJsonLdNode(parsed);
    if (!node) continue;

    const title =
      typeof node.name === 'string' && node.name.trim()
        ? decodeHtmlEntities(node.name)
        : extractMetaContent(html, 'og:title') ?? 'Imported Recipe';
    const description =
      typeof node.description === 'string'
        ? decodeHtmlEntities(node.description).slice(0, 260)
        : '';
    const servings = parseServings(node.recipeYield);
    const prepMinutes = parseIsoDurationToMinutes(node.prepTime);
    let cookMinutes = parseIsoDurationToMinutes(node.cookTime);
    const totalMinutes = parseIsoDurationToMinutes(node.totalTime);
    if (prepMinutes === 0 && cookMinutes === 0 && totalMinutes > 0) {
      cookMinutes = totalMinutes;
    }

    const rawIngredients = Array.isArray(node.recipeIngredient)
      ? node.recipeIngredient
      : Array.isArray(node.ingredients)
        ? node.ingredients
        : [];
    const ingredients = rawIngredients
      .filter((i): i is string => typeof i === 'string')
      .map(parseRecipeIngredientLine)
      .filter((i): i is RecipeIngredientInput => i !== null);

    const steps = extractInstructions(node.recipeInstructions);
    const imageUrl =
      extractImageUrl(node.image) ?? extractMetaContent(html, 'og:image');

    if (ingredients.length > 0 || steps.length > 0) {
      return {
        recipe: {
          title,
          description,
          servings,
          prepMinutes: prepMinutes || 10,
          cookMinutes: cookMinutes || 15,
          photoUri: null,
          sourceUrl,
          tags: extractTags(node),
          ingredients:
            ingredients.length > 0
              ? ingredients
              : [{ name: 'Add ingredients', quantity: null, unit: '', category: 'pantry_dry' }],
          steps,
        },
        imageUrl,
      };
    }
  }

  // 2. Fallback: Microdata itemprop="recipeIngredient" / "recipeInstructions"
  const microIngredients: RecipeIngredientInput[] = [];
  const ingRe =
    /<[^>]+itemprop=["'](?:recipeIngredient|ingredients)["'][^>]*>([\s\S]*?)<\/[^>]+>/gi;
  while ((match = ingRe.exec(html)) !== null) {
    const parsed = parseRecipeIngredientLine(match[1]);
    if (parsed) microIngredients.push(parsed);
  }

  const microSteps: string[] = [];
  const stepRe =
    /<([a-z0-9]+)[^>]+itemprop=["'](?:recipeInstructions|step)["'][^>]*>([\s\S]*?)<\/\1>/gi;
  while ((match = stepRe.exec(html)) !== null) {
    const block = match[2];
    const nestedLi = Array.from(block.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi))
      .map((m) => decodeHtmlEntities(m[1]))
      .filter((s) => s.length > 3);
    if (nestedLi.length > 0) {
      microSteps.push(...nestedLi);
    } else {
      const text = decodeHtmlEntities(block);
      if (text.length > 3) microSteps.push(text);
    }
  }

  if (microIngredients.length > 0 || microSteps.length > 0) {
    const titleTagMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title =
      extractMetaContent(html, 'og:title') ??
      (titleTagMatch ? decodeHtmlEntities(titleTagMatch[1]) : 'Imported Recipe');
    const description = (extractMetaContent(html, 'og:description') ?? '').slice(0, 260);
    const imageUrl = extractMetaContent(html, 'og:image');

    return {
      recipe: {
        title,
        description,
        servings: 2,
        prepMinutes: 10,
        cookMinutes: 15,
        photoUri: null,
        sourceUrl,
        tags: [],
        ingredients: microIngredients,
        steps: microSteps,
      },
      imageUrl,
    };
  }

  // 3. Readability / HTML heading + list heuristic fallback (for blogs without Schema.org)
  const strippedHtml = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const heuristicIngLines = extractListItemsAfterHeading(
    strippedHtml,
    /(?:ingredients|reikės|ingredientai|produktai|sudėtis)/i
  );
  const heuristicStepLines = extractListItemsAfterHeading(
    strippedHtml,
    /(?:instructions|directions|method|steps|preparation|gaminimas|paruošimas|eiga)/i
  );

  if (heuristicIngLines.length > 0 || heuristicStepLines.length > 0) {
    const titleTagMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const h1Match = strippedHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const title =
      extractMetaContent(html, 'og:title') ??
      (h1Match ? decodeHtmlEntities(h1Match[1]) : null) ??
      (titleTagMatch ? decodeHtmlEntities(titleTagMatch[1]) : 'Imported Recipe');
    const description = (extractMetaContent(html, 'og:description') ?? '').slice(0, 260);
    const imageUrl = extractMetaContent(html, 'og:image');
    const ingredients = heuristicIngLines
      .map(parseRecipeIngredientLine)
      .filter((i): i is RecipeIngredientInput => i !== null);

    return {
      recipe: {
        title,
        description,
        servings: 2,
        prepMinutes: 10,
        cookMinutes: 15,
        photoUri: null,
        sourceUrl,
        tags: [],
        ingredients,
        steps: heuristicStepLines,
      },
      imageUrl,
    };
  }

  throw new Error(
    'No structured recipe data was found on that page. Try copying the recipe text and using "Paste Text" instead.'
  );
}

const INGREDIENTS_HEADER_RE =
  /^(?:ingredients|reikės|ingredientai|produktai|sudėtis|ko reikės)\s*:?$/i;
const STEPS_HEADER_RE =
  /^(?:instructions|directions|method|steps|preparation|gaminimas|gaminimo eiga|paruošimas|eiga|kaip gaminti)\s*:?$/i;

export function parseRecipeFromText(rawText: string): RecipeInput {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    throw new Error('Paste some recipe text first.');
  }

  let title = 'Imported Recipe';
  const ingredientLines: string[] = [];
  const stepLines: string[] = [];

  let mode: 'start' | 'ingredients' | 'steps' = 'start';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (INGREDIENTS_HEADER_RE.test(line)) {
      mode = 'ingredients';
      continue;
    }
    if (STEPS_HEADER_RE.test(line)) {
      mode = 'steps';
      continue;
    }

    if (mode === 'start') {
      if (i === 0 && line.length <= 90 && !/^\d+\s*[a-zA-Z]/.test(line)) {
        title = line.replace(/^#+\s*/, '');
        continue;
      }
      // Heuristic: numbered long sentence -> step; short qty-prefixed line -> ingredient
      if (/^\d+[.)]\s+\S.{25,}/.test(line)) {
        mode = 'steps';
        stepLines.push(line.replace(/^\d+[.)]\s+/, ''));
      } else {
        mode = 'ingredients';
        ingredientLines.push(line);
      }
      continue;
    }

    if (mode === 'ingredients') {
      // Switch to steps if we encounter a numbered multi-word instruction
      if (/^\d+[.)]\s+\S.{25,}/.test(line)) {
        mode = 'steps';
        stepLines.push(line.replace(/^\d+[.)]\s+/, ''));
      } else {
        ingredientLines.push(line);
      }
      continue;
    }

    stepLines.push(line.replace(/^\d+[.)]\s+/, ''));
  }

  const ingredients = ingredientLines
    .map(parseRecipeIngredientLine)
    .filter((i): i is RecipeIngredientInput => i !== null);

  return {
    title,
    description: '',
    servings: 2,
    prepMinutes: 10,
    cookMinutes: 15,
    photoUri: null,
    tags: [],
    ingredients:
      ingredients.length > 0
        ? ingredients
        : [{ name: lines[0], quantity: null, unit: '', category: 'pantry_dry' }],
    steps: stepLines,
  };
}
