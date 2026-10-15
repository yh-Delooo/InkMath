import {PluginManager} from 'sn-plugin-lib';

export async function ensureFilePermissions(): Promise<void> {
  for (const permission of ['plugin.permission.FILE:READ', 'plugin.permission.FILE:WRITE']) {
    if ((await PluginManager.hasPermission(permission)) === 1) {
      continue;
    }
    const result = await PluginManager.requestPermission(
      permission,
      'Supernote Math 需要文件权限读取公式图片、保存公式记录并插入笔记。',
    );
    if (result !== 1 && result !== 2) {
      throw new Error('File access was denied. Allow file access and try again.');
    }
  }
}

export async function requestDeletePermission(): Promise<boolean> {
  const permission = 'plugin.permission.FILE:DELETE';
  if (await PluginManager.hasPermission(permission) === 1) { return true; }
  const result = await PluginManager.requestPermission(permission, '用于确认插入后删除对应原内容：圈选替换的原笔迹，或你勾选删除的导入图片。');
  return result === 1 || result === 2;
}
