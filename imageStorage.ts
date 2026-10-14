import RNFS from 'react-native-fs';
import {PluginManager} from 'sn-plugin-lib';

export async function getImageDirectory(): Promise<string> {
  const directory = await PluginManager.getPluginDirPath();
  if (!directory || !directory.startsWith('/')) {
    throw new Error('The plugin image directory is unavailable.');
  }
  const imageDirectory = `${directory.replace(/\/$/, '')}/supernote-math-llm`;
  await RNFS.mkdir(imageDirectory);
  return imageDirectory;
}

export async function saveCapture(base64: string): Promise<string> {
  const directory = await getImageDirectory();
  const path = `${directory}/capture.png`;
  await RNFS.writeFile(path, base64, 'base64');
  return `file://${path}`;
}

