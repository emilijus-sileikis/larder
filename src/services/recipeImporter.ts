import { Directory, File, Paths } from 'expo-file-system';
import type { RecipeInput } from '@/types/larder';
import {
  extractRecipeFromHtml,
  isSafeHttpUrl,
  parseRecipeFromText,
} from '@/utils/recipeParser';

const MAX_HTML_BYTES = 1_500_000;
const MAX_CONTENT_LENGTH = 3_000_000;

function getPhotosDir(): Directory {
  const dir = new Directory(Paths.document, 'recipe-photos');
  if (!dir.exists) {
    dir.create({ idempotent: true, intermediates: true });
  }
  return dir;
}

async function downloadRecipePhotoLocally(imageUrl: string): Promise<string | null> {
  if (!isSafeHttpUrl(imageUrl)) return null;
  try {
    const extMatch = imageUrl.match(/\.(jpg|jpeg|png|webp)(?:\?|$)/i);
    const ext = (extMatch ? extMatch[1] : 'jpg').toLowerCase();
    const filename = `imported_${Date.now()}_${Math.floor(Math.random() * 1000)}.${ext}`;
    const dest = new File(getPhotosDir(), filename);
    const downloaded = await File.downloadFileAsync(imageUrl, dest, {
      idempotent: true,
    });
    return downloaded.uri;
  } catch {
    // Photo download is best-effort; recipe still imports cleanly without it
    return null;
  }
}

export function normalizeRecipeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('Please enter a website URL.');
  }
  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw new Error('That does not look like a valid web address.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http:// and https:// recipe links are supported.');
  }
  return parsed.toString();
}

export async function importRecipeFromUrl(rawUrl: string): Promise<RecipeInput> {
  const url = normalizeRecipeUrl(rawUrl);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);

  let html: string;
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'lt-LT,lt;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });
    if (!response.ok) {
      throw new Error(`Website returned HTTP ${response.status}. Try copying the text and using "Paste Text".`);
    }
    const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
    if (
      contentType &&
      /^(?:video|audio|image)\/|application\/(?:pdf|octet-stream|zip)/i.test(contentType)
    ) {
      throw new Error('That link points to a media or binary file instead of a recipe webpage.');
    }
    const contentLength = Number(response.headers.get('content-length') ?? 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_CONTENT_LENGTH) {
      throw new Error('That webpage is too large to parse. Try copying the recipe text instead.');
    }
    const rawHtml = await response.text();
    html = rawHtml.length > MAX_HTML_BYTES ? rawHtml.slice(0, MAX_HTML_BYTES) : rawHtml;
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('Request timed out. Check your internet connection or use "Paste Text".');
    }
    if (e instanceof Error) throw e;
    throw new Error('Could not load that webpage.');
  } finally {
    clearTimeout(timer);
  }

  const { recipe, imageUrl } = extractRecipeFromHtml(html, url);

  let localPhotoUri: string | null = null;
  if (imageUrl) {
    localPhotoUri = await downloadRecipePhotoLocally(imageUrl);
  }

  return {
    ...recipe,
    sourceUrl: url,
    photoUri: localPhotoUri,
  };
}

export { parseRecipeFromText };
