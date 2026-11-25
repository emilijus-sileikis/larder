import { Alert } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

function getPhotosDir(): Directory {
  const dir = new Directory(Paths.document, 'recipe-photos');
  if (!dir.exists) {
    dir.create({ idempotent: true, intermediates: true });
  }
  return dir;
}

async function persistPhotoUri(sourceUri: string): Promise<string> {
  const dir = getPhotosDir();
  const normalized =
    sourceUri.startsWith('file://') || sourceUri.startsWith('content://')
      ? sourceUri
      : `file://${sourceUri}`;
  const extMatch = normalized.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  const rawExt = (extMatch ? extMatch[1] : 'jpg').toLowerCase();
  const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'heic'].includes(rawExt) ? rawExt : 'jpg';
  const filename = `recipe_${Date.now()}_${Math.floor(Math.random() * 1000)}.${safeExt}`;

  const sourceFile = new File(normalized);
  const destFile = new File(dir, filename);
  try {
    await sourceFile.copy(destFile, { overwrite: true });
  } catch {
    const base64 = await sourceFile.base64();
    await destFile.write(base64, { encoding: 'base64' });
  }
  return destFile.uri;
}

export async function pickRecipePhotoFromLibrary(): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert(
      'Photo Access Needed',
      'Enable photo library access in your device settings to attach recipe photos.'
    );
    return null;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [4, 3],
    quality: 0.82,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) {
    return null;
  }
  return persistPhotoUri(result.assets[0].uri);
}

export async function takeRecipePhotoWithCamera(): Promise<string | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    Alert.alert(
      'Camera Access Needed',
      'Enable camera access in your device settings to photograph recipes.'
    );
    return null;
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [4, 3],
    quality: 0.82,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) {
    return null;
  }
  return persistPhotoUri(result.assets[0].uri);
}

export function deleteLocalPhoto(uri: string | null): void {
  if (!uri) return;
  try {
    if (!uri.startsWith(Paths.document.uri)) return;
    const file = new File(uri);
    if (file.exists) {
      file.delete();
    }
  } catch {
    // Ignore cleanup errors for missing files
  }
}
