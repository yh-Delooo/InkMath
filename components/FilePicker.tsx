import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  FlatList,
  Image,
  Dimensions,
} from 'react-native';
import RNFS from 'react-native-fs';
import {PluginManager} from 'sn-plugin-lib';
import {DEFAULT_DIRECTORY, STORAGE_ROOT, SHARED_FOLDERS} from '../preferences';

// Configure 3 columns
const numColumns = 3;
const screenWidth = Dimensions.get('window').width;
// Increased gap to better separate stylus touches
const gap = 8;
const itemSize = (screenWidth - (gap * (numColumns + 1))) / numColumns;

interface FilePickerProps {
  onSelect: (path: string) => void;
  onClose: () => void;
  initialDirectory?: string;
  defaultDirectory?: string;
  onSetDefaultDirectory?: (path: string) => void;
  onDirectoryChange?: (path: string) => void;
  settingsBusy?: boolean;
  showAllFolders?: boolean;
}

// List of allowed folders when showAllFolders is false
const ALLOWED_ROOT_FOLDERS = SHARED_FOLDERS;

export const FilePicker: React.FC<FilePickerProps> = ({
  onSelect,
  onClose,
  initialDirectory = DEFAULT_DIRECTORY,
  defaultDirectory = DEFAULT_DIRECTORY,
  onSetDefaultDirectory,
  onDirectoryChange,
  settingsBusy = false,
  showAllFolders = false
}) => {
  const [currentPath, setCurrentPath] = useState(initialDirectory);
  const [items, setItems] = useState<{ name: string, path: string, isDir: boolean }[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(0);
  const pathRef = useRef(currentPath);
  pathRef.current = currentPath;

  const loadItems = useCallback(async (path: string) => {
    const id = ++requestId.current;
    try {
      setIsRefreshing(true);
      setError('');
      setItems([]);
      // The new firmware grants access to these folders, not to an arbitrary
      // listing of the shared-storage root. Show the entry folders directly.
      if (path === RNFS.ExternalStorageDirectoryPath && !showAllFolders) {
        setItems(ALLOWED_ROOT_FOLDERS.map(name => ({name, path: `${path}/${name}`, isDir: true})));
        return;
      }
      const result = await RNFS.readDir(path);
      if (id !== requestId.current) { return; }
      if (!result || !Array.isArray(result)) {
        setItems([]);
        return;
      }
      const mappedItems = result
        .map(item => ({
          name: item.name,
          path: item.path,
          isDir: item.isDirectory(),
        }))
        .filter(item => {
          // 1. Hide files/folders starting with "."
          if (item.name.startsWith('.')) return false;

          if (item.isDir) {
            // 2. If in root directory and showAllFolders is false, filter folders
            if (!showAllFolders && path === STORAGE_ROOT) {
              return ALLOWED_ROOT_FOLDERS.includes(item.name);
            }
            return true;
          }

          // 3. Filter only supported images
          return /\.(jpg|jpeg|png|bmp)$/i.test(item.name);
        })
        .sort((a, b) => (b.isDir === a.isDir ? a.name.localeCompare(b.name) : b.isDir ? 1 : -1));

      setItems(mappedItems);
    } catch (err) {
      if (id !== requestId.current) { return; }
      setItems([]);
      setError(err instanceof Error ? err.message : 'Unable to read this folder. Check file access permissions.');
      console.error("Error reading directory:", err);
    } finally {
      if (id === requestId.current) { setIsRefreshing(false); }
    }
  }, [showAllFolders]);

  useEffect(() => {
    loadItems(currentPath);
    return () => { requestId.current++; };
  }, [currentPath, loadItems]);

  useEffect(() => { onDirectoryChange?.(currentPath); }, [currentPath, onDirectoryChange]);

  useEffect(() => {
    // The host can reopen a mounted plugin without remounting React.
    // SDK lifecycle state 2 means start (see PluginManager.PluginLifeType).
    const subscription = PluginManager.registerPluginLifeListener({
      onMsg: event => { if (event?.state === 2) { loadItems(pathRef.current); } },
    });
    return () => subscription.remove();
  }, [loadItems]);

  const openDirectory = (path: string) => {
    if (path === currentPath) { loadItems(path); }
    else { setCurrentPath(path); }
  };

  const renderGridItem = ({ item }: { item: any }) => (
    <Pressable
      style={styles.gridItem}
      onPress={() => item.isDir ? openDirectory(item.path) : onSelect(item.path)}
    >
      <View style={styles.thumbnailContainer}>
        {item.isDir ? (
          <View style={styles.folderContainer}>
            <Text style={styles.folderIcon}>📁</Text>
          </View>
        ) : (
          <Image
            source={{ uri: `file://${item.path}` }}
            style={styles.thumbnail}
            resizeMode="cover"
          />
        )}
      </View>
      <View style={styles.textContainer}>
        <Text style={styles.itemText} numberOfLines={2}>
          {item.name}
        </Text>
      </View>
    </Pressable>
  );

  return (
    <View style={styles.pickerContainer}>
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            const parent = currentPath.substring(0, currentPath.lastIndexOf('/'));
            setCurrentPath(parent.length < STORAGE_ROOT.length ? STORAGE_ROOT : parent);
          }}
          disabled={currentPath === STORAGE_ROOT}
          style={styles.backBtn}
        >
          {/* Larger icon and text for the back button */}
          <Text style={[styles.navBtn, currentPath === STORAGE_ROOT && { color: '#ccc' }]}>
            ⬅ <Text style={{ fontSize: 14 }}>Back</Text>
          </Text>
        </Pressable>

        {/* Folder name enlarged and centered */}
        <View style={styles.titleWrapper}>
          <Text style={styles.pathTitle} numberOfLines={1}>
            {currentPath.split('/').pop() || 'Storage'}
          </Text>
        </View>

        <View style={styles.rightNav}>
          <Pressable
            onPress={() => loadItems(currentPath)}
            style={styles.refreshBtn}
            disabled={isRefreshing}
          >
            <Text style={[styles.navBtn, isRefreshing && { color: '#ccc' }]}>
              {isRefreshing ? '⏳' : '🔄'}
            </Text>
          </Pressable>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.navBtn}>✕</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.defaultBar}>
        <Text style={{color: '#000'}}>默认目录：{defaultDirectory.slice(STORAGE_ROOT.length) || '设备文件夹'}</Text>
        <View style={styles.defaultButtons}>
          <Pressable style={styles.defaultButton} onPress={() => openDirectory(defaultDirectory)}>
            <Text style={{color: '#000'}}>打开默认目录</Text>
          </Pressable>
          {onSetDefaultDirectory && <Pressable style={styles.defaultButton}
            disabled={settingsBusy || isRefreshing || !!error || currentPath === defaultDirectory}
            onPress={() => onSetDefaultDirectory(currentPath)}>
            <Text style={{color: '#000'}}>{currentPath === defaultDirectory ? '当前已是默认目录' : '将当前文件夹设为默认'}</Text>
          </Pressable>}
        </View>
      </View>
      {!!error && <Text style={{padding: 16, color: '#000'}}>{error}{'\n可点 Back 返回其他文件夹。'}</Text>}
      <FlatList
        data={items}
        key={`grid-${numColumns}`}
        keyExtractor={(item) => item.path}
        renderItem={renderGridItem}
        numColumns={numColumns}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  defaultBar: {padding: 12, borderBottomWidth: 1, borderColor: '#000'},
  defaultButtons: {flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, gap: 8},
  defaultButton: {minHeight: 44, padding: 10, justifyContent: 'center', borderWidth: 1, borderColor: '#000'},
  pickerContainer: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingTop: 10,
    paddingBottom: 10,
    paddingHorizontal: 15,
    alignItems: 'center',
    borderBottomWidth: 3, // More visible on E-Ink
    borderColor: '#000'
  },
  titleWrapper: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  navBtn: { fontSize: 22, fontWeight: 'bold' },
  backBtn: { padding: 5 },
  rightNav: { flexDirection: 'row', alignItems: 'center' },
  refreshBtn: { padding: 5, marginRight: 10 },
  closeBtn: { padding: 5 },
  pathTitle: {
    fontSize: 20, // Set to 20px for maximum readability
    color: '#000',
    fontWeight: 'bold', // Bold font
    textTransform: 'uppercase', // Helps distinguish folder names
  },
  listContent: { padding: gap / 2 },
  gridItem: {
    width: itemSize,
    margin: gap / 2,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#000', // Sharp black border for contrast
    borderRadius: 4,
    overflow: 'hidden'
  },
  thumbnailContainer: {
    width: '100%',
    height: itemSize - 20, // Leave space for text below
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#eee',
  },
  folderContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnail: { width: '100%', height: '100%' },
  folderIcon: { fontSize: 40 },
  textContainer: {
    padding: 4,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderColor: '#000',
    minHeight: 40, // Min height to accommodate 2 lines of text
    justifyContent: 'center'
  },
  itemText: {
    fontSize: 14, // Increased for readability
    color: '#000',
    textAlign: 'center',
    fontWeight: '600'
  },
});
