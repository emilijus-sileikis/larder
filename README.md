# Larder

A 100% offline, local-first Pantry, Recipes, Meal Planner, and Grocery Checklist app built with Expo SDK 58, React Native, TypeScript, Expo Router, and `expo-sqlite`.

## Running Locally

```bash
npm start
# or
npm run android
npm run ios
```

## Verification

```bash
npm run typecheck
npm run lint
```

## Architecture

- **Navigation (`src/app/`)**: Expo Router with 4 bottom tabs (`Groceries`, `Recipes`, `Meal Plan`, `Pantry`), plus stack/modal routes for Recipe Detail (`recipe/[id]`) and Recipe Editor (`recipe/editor`).
- **Localization (`src/i18n/translations.ts`)**: Full English (`EN`) and Lithuanian (`LT`) UI, localized dates/expiry badges, Lithuanian unit aliases (`v. š.`, `arb. š.`, `skiltelės`, `vnt.`), and localized sample data.
- **On-Device Recipe Importer (`src/utils/recipeParser.ts`, `src/services/recipeImporter.ts`)**: Extracts recipes from web URLs via Schema.org JSON-LD and Microdata (with local photo caching), plus a **Paste Text** converter for raw recipes in English or Lithuanian — zero backend and zero paid APIs.
- **Database (`src/db/database.ts`)**: Local SQLite database (`larder_v1.db`) with foreign keys and WAL mode covering `pantry_items`, `recipes`, `recipe_ingredients`, `meal_plan_entries`, `grocery_items`, and `app_settings`.
- **Smart Ingredient Merging (`src/utils/ingredients.ts`)**: Plural-aware name normalization, convertible unit merging (weight `g`/`kg`/`oz`/`lb`, volume `ml`/`l`/`tsp`/`tbsp`/`cup`, and discrete counts), and live Pantry Match calculation.
- **Backup & Photos (`src/services/`)**: Local JSON export/import via `expo-file-system` (`File`, `Paths`, `File.pickFileAsync`) and `expo-sharing`, plus persistent local recipe photos via `expo-image-picker`.
