import RNFS from 'react-native-fs';
import {getImageDirectory} from './imageStorage';

export const STORAGE_ROOT = RNFS.ExternalStorageDirectoryPath.replace(/\/+$/, '');
export const SHARED_FOLDERS = ['Document', 'EXPORT', 'MyStyle', 'Note', 'SCREENSHOT', 'INBOX'];
export const DEFAULT_DIRECTORY = `${STORAGE_ROOT}/SCREENSHOT`;
export type Preferences = {defaultDirectory: string; deleteImportedImageAfterInsert: boolean};
export const DEFAULT_PREFERENCES: Preferences = {
  defaultDirectory: DEFAULT_DIRECTORY,
  deleteImportedImageAfterInsert: false,
};

export function isSharedDirectory(path: string): boolean {
  if (path === STORAGE_ROOT) { return true; }
  if (!path.startsWith(`${STORAGE_ROOT}/`) || /[\\\0]/.test(path)) { return false; }
  const segments = path.slice(STORAGE_ROOT.length + 1).split('/');
  return SHARED_FOLDERS.includes(segments[0]) && segments.every(part => part !== '' && part !== '.' && part !== '..');
}

export async function loadPreferences(): Promise<Preferences> {
  const path = `${await getImageDirectory()}/preferences.json`;
  if (!await RNFS.exists(path)) { return {...DEFAULT_PREFERENCES}; }
  try {
    const value = JSON.parse(await RNFS.readFile(path, 'utf8'));
    return {
      deleteImportedImageAfterInsert: value?.deleteImportedImageAfterInsert === true,
      defaultDirectory: typeof value?.defaultDirectory === 'string' && isSharedDirectory(value.defaultDirectory)
        ? value.defaultDirectory : DEFAULT_DIRECTORY,
    };
  } catch {
    // Ignore invalid or legacy settings.
    return {...DEFAULT_PREFERENCES};
  }
}

export async function savePreferences(value: Preferences): Promise<void> {
  if (!isSharedDirectory(value.defaultDirectory)) { throw new Error('请选择设备上的图片文件夹。'); }
  await RNFS.writeFile(`${await getImageDirectory()}/preferences.json`, JSON.stringify({defaultDirectory: value.defaultDirectory, deleteImportedImageAfterInsert: value.deleteImportedImageAfterInsert === true}), 'utf8');
}
