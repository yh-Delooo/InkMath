import RNFS from 'react-native-fs';
import {PluginCommAPI, PluginFileAPI, PluginNoteAPI, PointUtils} from 'sn-plugin-lib';
import {checked, exportSelection} from './storage';
import {requestDeletePermission} from '../permissions';
import {getImageDirectory} from '../imageStorage';

export type Rect = {left: number; top: number; right: number; bottom: number};
export type Selection = {file: string; page: number; layer: number; ids: number[]; rect: Rect; image: string; signatures: string[]};
export type ReplacementResult = {warning: string};
export function strokeIds(elements: any[]): number[] {
  if (!elements.length || elements.some(e => e.type !== 0 || !Number.isInteger(e.numInPage) || e.numInPage < 1 ||
      e.pageNum !== elements[0].pageNum || e.layerNum !== elements[0].layerNum)) {
    throw new Error('请只圈选同一图层的一条手写公式。混合图片、标题或跨图层选区不能自动处理。');
  }
  const ids = elements.map(e => e.numInPage).sort((a, b) => a - b);
  if (new Set(ids).size !== ids.length) { throw new Error('选区编号不完整，请重新圈选。'); }
  return ids;
}
// Materialize the data, not the cache UUID: UUIDs are handles, not durable IDs.
async function signature(element: any): Promise<string> {
  const stroke = element.stroke;
  if (!stroke?.points?.size || !stroke.points.getRange) { throw new Error('无法读取原笔迹数据，已停止替换。'); }
  const count = await stroke.points.size();
  if (!Number.isInteger(count) || count < 1 || count > 30000) { throw new Error('笔迹数据过大或不可用，请缩小选区。'); }
  const points: unknown[] = [];
  for (let start = 0; start < count; start += 512) {
    const length = Math.min(512, count - start), values = await stroke.points.getRange(start, length);
    if (!Array.isArray(values) || values.length !== length || values.some(p => !Number.isFinite(p?.x) || !Number.isFinite(p?.y))) {
      throw new Error('笔迹数据不完整，已停止替换。');
    }
    points.push(...values.map(p => [p.x, p.y]));
  }
  const metadata: Record<string, unknown> = {};
  for (const key of Object.keys(stroke).sort()) {
    const value = stroke[key];
    if (value == null || ['number', 'string', 'boolean'].includes(typeof value)) { metadata[key] = value; }
  }
  // Include eraser/visibility data so an edited stroke cannot match an old one.
  const extra: Record<string, unknown> = {};
  for (const key of ['pressures', 'eraseLineTrailNums', 'flagDraw', 'markPenDirection']) {
    const accessor = stroke[key];
    if (!accessor?.size || !accessor.getRange) { throw new Error('笔迹校验数据不可用，已停止替换。'); }
    const size = await accessor.size();
    if (!Number.isInteger(size) || size < -1 || size > 30000) { throw new Error('笔迹校验数据异常。'); }
    // SDK 0.1.65 reports -1 for an empty accessor (its size() uses a truthiness check).
    const values: unknown[] = [];
    for (let start = 0; start < size; start += 512) {
      const length = Math.min(512, size - start), chunk = await accessor.getRange(start, length);
      if (!Array.isArray(chunk) || chunk.length !== length) { throw new Error('笔迹校验数据不完整。'); }
      values.push(...chunk);
    }
    extra[key] = values;
  }
  return JSON.stringify([element.thickness, metadata, points, extra]);
}
function accepted(response: any, label: string) { if (checked(response, label) !== true) { throw new Error(`${label}未得到明确确认`); } }
async function validate(s: Pick<Selection, 'file' | 'page'>) {
  if (checked<string>(await PluginCommAPI.getCurrentFilePath(), '读取笔记') !== s.file ||
      checked<number>(await PluginCommAPI.getCurrentPageNum(), '读取页码') !== s.page) { throw new Error('笔记或页面已经变化，请重新圈选。'); }
}
export async function captureHandwriting(): Promise<Selection> {
  const elements = checked<any[]>(await PluginCommAPI.getLassoElements(), '读取手写选区');
  const ids = strokeIds(elements);
  if (elements.length > 200) { throw new Error('请只圈选一条公式。'); }
  const rect = checked<Rect>(await PluginCommAPI.getLassoRect(), '读取选区位置');
  if (![rect.left, rect.top, rect.right, rect.bottom].every(Number.isFinite) || rect.right <= rect.left || rect.bottom <= rect.top) {
    throw new Error('选区位置无效，请重新圈选。');
  }
  const file = checked<string>(await PluginCommAPI.getCurrentFilePath(), '读取笔记路径');
  const page = checked<number>(await PluginCommAPI.getCurrentPageNum(), '读取页码');
  if (!/\.note$/i.test(file) || elements[0].pageNum !== page || !Number.isInteger(elements[0].layerNum) || elements[0].layerNum < 0 || elements[0].layerNum > 3) {
    throw new Error('请在笔记的同一页、同一图层圈选手写公式。');
  }
  const signatures: string[] = [];
  for (const element of elements) { signatures.push(await signature(element)); }
  if (new Set(signatures).size !== signatures.length) { throw new Error('选区有完全重叠的笔迹，无法安全定位，请重新圈选。'); }
  const image = await exportSelection();
  const selection = {file, page, layer: elements[0].layerNum, ids, rect, image, signatures};
  await validate(selection);
  return selection;
}
export function fitRect(rect: Rect, aspect: number): Rect {
  if (!Number.isFinite(aspect) || aspect <= 0) { throw new Error('公式图片尺寸无效。'); }
  const width = Math.min(rect.right - rect.left, (rect.bottom - rect.top) * aspect), height = width / aspect;
  const left = (rect.left + rect.right - width) / 2, top = (rect.top + rect.bottom - height) / 2;
  return {left, top, right: left + width, bottom: top + height};
}
async function pageElements(s: Selection): Promise<any[]> {
  await validate(s);
  accepted(await PluginNoteAPI.saveCurrentNote(), '保存笔记');
  await validate(s);
  return checked<any[]>(await PluginFileAPI.getElements(s.page, s.file), '读取页面元素');
}
async function matchingIds(s: Selection, elements: any[]): Promise<number[]> {
  const candidates = elements.filter(e => e.type === 0 && e.layerNum === s.layer && e.pageNum === s.page);
  if (candidates.length > 1000) { throw new Error('本页笔迹过多，暂不能安全替换。'); }
  const matches = new Map<string, number[]>();
  for (const element of candidates) {
    const value = await signature(element);
    if (s.signatures.includes(value)) { matches.set(value, [...(matches.get(value) || []), element.numInPage]); }
  }
  const ids = s.signatures.map(value => {
    const list = matches.get(value);
    if (list?.length !== 1 || !Number.isInteger(list[0]) || list[0] < 1) { throw new Error('原笔迹已变化或无法唯一定位，已停止删除。'); }
    return list[0];
  });
  if (new Set(ids).size !== ids.length) { throw new Error('笔迹编号冲突，已停止删除。'); }
  return ids;
}
function closeRect(a: Rect, b: Rect, tolerance = 2): boolean {
  return !!a && !!b && (['left', 'top', 'right', 'bottom'] as const).every(k =>
    Number.isFinite(a[k]) && Number.isFinite(b[k]) && Math.abs(a[k] - b[k]) <= tolerance);
}
function validRect(r: Rect): boolean {
  return !!r && Object.values(r).every(Number.isFinite) && r.right > r.left && r.bottom > r.top;
}
export function integerRect(r: Rect, outward = false): Rect {
  const low = outward ? Math.floor : Math.round, high = outward ? Math.ceil : Math.round;
  const result = {left: low(r.left), top: low(r.top), right: high(r.right), bottom: high(r.bottom)};
  if (!validRect(result)) { throw new Error('选区尺寸太小或无效，请重新圈选。'); }
  return result;
}
function pictureSnapshot(elements: any[]): object[] {
  return elements.filter(e => e.type === 200).map(e => ({num: e.numInPage, page: e.pageNum, layer: e.layerNum,
    rect: e.picture?.rect, hasPath: !!e.picture?.picturePath, hasCacheHandle: !!e.uuid}));
}
async function saveReplacementDiagnostic(data: object): Promise<string> {
  // Only structural metadata, never note paths, handwriting points or API keys.
  const text = JSON.stringify({version: '0.1.16', ...data}, null, 2);
  try {
    const dir = `${RNFS.ExternalStorageDirectoryPath}/EXPORT`;
    await RNFS.mkdir(dir);
    await RNFS.writeFile(`${dir}/InkMath-debug.json`, text, 'utf8');
    return '\n诊断记录：EXPORT/InkMath-debug.json';
  } catch {
    try { await RNFS.writeFile(`${await getImageDirectory()}/replacement-debug.json`, text, 'utf8'); } catch { /* Never hide the original error. */ }
    return '';
  }
}
// Subtract existing picture bounds to find a selectable part of the import.
// A partial intersection can select an image; always verify the returned IDs.
function isolatedImageAreas(rect: Rect, others: any[]): Rect[] {
  let areas = [rect];
  for (const other of others) {
    const r = other.picture?.rect as Rect;
    if (other.type !== 200 || !validRect(r)) { continue; }
    const block = {left: Math.floor(r.left) - 2, top: Math.floor(r.top) - 2,
      right: Math.ceil(r.right) + 2, bottom: Math.ceil(r.bottom) + 2};
    areas = areas.flatMap(a => {
      if (block.left >= a.right || block.right <= a.left || block.top >= a.bottom || block.bottom <= a.top) { return [a]; }
      return [
        {...a, bottom: Math.min(a.bottom, block.top)},
        {...a, top: Math.max(a.top, block.bottom)},
        {...a, right: Math.min(a.right, block.left)},
        {...a, left: Math.max(a.left, block.right)},
      ].filter(validRect);
    }).sort((a, b) => (b.right - b.left) * (b.bottom - b.top) - (a.right - a.left) * (a.bottom - a.top)).slice(0, 16);
  }
  return areas.filter(a => a.right - a.left >= 2 && a.bottom - a.top >= 2).slice(0, 8);
}
async function selectImportedImage(image: any, size: {width: number; height: number}, targetNote: Pick<Selection, 'file' | 'page'>, diagnostic: Record<string, unknown>, allowedOriginalIds: number[] = [], existingPictures: any[] = [], forceReselect = false): Promise<{rect: Rect; overlapsOriginals: boolean}> {
  let overlapsOriginals = false;
  const attempts: object[] = [];
  const groups = (diagnostic.selectionGroups || []) as object[]; groups.push({attempts}); diagnostic.selectionGroups = groups;
  const selected = async () => {
    try {
      const list = checked<any[]>(await PluginCommAPI.getLassoElements(), '读取图片选区');
      attempts.push({selection: list.map(e => ({type: e.type, num: e.numInPage, layer: e.layerNum}))});
      const pictures = list.filter(e => e.type === 200);
      const originals = list.filter(e => e.type === 0);
      const correctImage = pictures.length === 1 && pictures[0].numInPage === image.numInPage && pictures[0].layerNum === image.layerNum;
      const safeOriginals = originals.every(e => e.layerNum === image.layerNum && allowedOriginalIds.includes(e.numInPage));
      const acceptedSelection = correctImage && safeOriginals && pictures.length + originals.length === list.length;
      overlapsOriginals = acceptedSelection && originals.length > 0;
      return acceptedSelection;
    } catch { attempts.push({selectionUnavailable: true}); return false; }
  };
  if (forceReselect || !await selected()) {
    const r = image.picture?.rect as Rect;
    if (!validRect(r)) { throw new Error('无法读取新图片边界，保留原笔迹。[R3-选区]'); }
    const candidates = [integerRect(r, true), ...isolatedImageAreas(r, existingPictures).filter(a => !closeRect(a, r, 0)).map(a => integerRect(a))];
    // Device diagnostics show Picture.rect can be pixels despite the pinned
    // SDK's EMR comment. Try native bounds first; confirm identity before resizing.
    try {
      const points = [{x: r.left, y: r.top}, {x: r.right, y: r.bottom}].map(p => PointUtils.emrPoint2Android(p, size));
      candidates.push(integerRect({left: Math.min(...points.map(p => p.x)), top: Math.min(...points.map(p => p.y)),
        right: Math.max(...points.map(p => p.x)), bottom: Math.max(...points.map(p => p.y))}, true));
    } catch { /* Pixel coordinates need no legacy conversion. */ }
    let found = false;
    for (const area of candidates) {
      if (area.left < 0 || area.top < 0 || area.right >= size.width || area.bottom >= size.height) { continue; }
      await validate(targetNote);
      try {
        const response = await PluginCommAPI.lassoElements(area);
        attempts.push({area, accepted: response?.success === true && response.result === true});
        accepted(response, '选中新公式 [R3-选区]');
        if (await selected()) { found = true; break; }
      } catch { /* Selecting a box does not edit content; try the other coordinate format. */ }
    }
    if (!found) { throw new Error('无法单独选中新公式，未移动图片或删除原笔迹。[R3-选区]'); }
  }
  const current = checked<Rect>(await PluginCommAPI.getLassoRect(), '读取新公式位置');
  if (!validRect(current)) { throw new Error('新公式选区尺寸无效。[R3-选区]'); }
  return {rect: current, overlapsOriginals};
}
const normalizedPath = (path: string) => path.replace(/^file:\/\//, '');
function pictureKey(e: any): string {
  const r = e.picture?.rect;
  // Embedded image paths may be regenerated on every read. Position and layer
  // describe the unchanged page content; file paths are not element identities.
  return JSON.stringify([e.layerNum, r?.left, r?.top, r?.right, r?.bottom]);
}
function pictureChanges(before: any[], after: any[], selected?: any): {added: any[]; missing: number} {
  const counts = new Map<string, number>();
  for (const e of before.filter(e => e.type === 200)) {
    const key = pictureKey(e); counts.set(key, (counts.get(key) || 0) + 1);
  }
  const pictures = after.filter(e => e.type === 200);
  // Consume pre-existing equal rectangles first, leaving the host-selected import
  // unmatched when a previous formula occupies exactly the same default position.
  const preferred = (e: any) => selected && e.numInPage === selected.numInPage && e.layerNum === selected.layerNum;
  const ordered = selected ? [...pictures.filter(e => !preferred(e)), ...pictures.filter(preferred)] : pictures;
  const added = ordered.filter(e => {
    const key = pictureKey(e), count = counts.get(key) || 0;
    if (count) { counts.set(key, count - 1); return false; }
    return true;
  });
  return {added, missing: [...counts.values()].reduce((sum, count) => sum + count, 0)};
}
function confirmPicture(elements: any[], before: any[], s: Selection, rect: Rect): void {
  const {added, missing} = pictureChanges(before, elements);
  // Track the result of this single import, not the source PNG bytes: the host
  // embeds/re-encodes images and may not expose a readable picturePath.
  if (!missing && added.length === 1) {
    const e = added[0];
    if (e.layerNum === s.layer && (Object.keys(rect) as (keyof Rect)[]).every(k =>
      Number.isFinite(e.picture?.rect?.[k]) && Math.abs(e.picture.rect[k] - rect[k]) <= 2)) { return; }
  }
  throw new Error('未能确认新公式位于原选区。[R3]');
}
export async function insertRecognizedFormula(s: Selection, path: string, aspect: number): Promise<ReplacementResult> {
  await validate(s);
  const sourcePath = normalizedPath(path);
  if (!await RNFS.exists(sourcePath)) { throw new Error('公式 PNG 文件不存在，请重新生成预览。'); }
  if (!await requestDeletePermission()) { throw new Error('未获得删除权限，原笔迹保留。'); }
  const before = await pageElements(s);
  await matchingIds(s, before);
  const size = checked<{width: number; height: number}>(await PluginCommAPI.getPageDisplaySize(), '读取页面尺寸');
  const target = integerRect(fitRect(s.rect, aspect));
  const diagnostic: Record<string, unknown> = {size, target, before: pictureSnapshot(before)};
  await validate(s);
  // Use the same image-import operation as ordinary insertion. Generic element
  // insertion may silently skip unavailable cache entries despite a success result.
  let deletionAttempted = false, originalsRemoved = false;
  try {
    accepted(await PluginNoteAPI.insertImage(sourcePath), '插入公式图片 [R1]');
    let selected: any;
    try {
      const list = checked<any[]>(await PluginCommAPI.getLassoElements(), '读取插入选区');
      if (list.length === 1 && list[0].type === 200) { selected = list[0]; }
    } catch { /* A unique page difference can still identify an unselected image. */ }
    diagnostic.stage = 'identify-import';
    const imported = await pageElements(s);
    diagnostic.imported = pictureSnapshot(imported);
    diagnostic.selected = selected ? pictureSnapshot([selected]) : [];
    const {added, missing} = pictureChanges(before, imported, selected);
    if (added.length !== 1 || missing !== 0) {
      throw new Error(`图片接口返回成功，但未能确认新增公式图片（图片总数 ${before.filter(e => e.type === 200).length} → ${imported.filter(e => e.type === 200).length}；未匹配 ${added.length} 张），原笔迹未删除。[R2]`);
    }
    let image = added[0];
    if (before.some(e => e.type === 200 && pictureKey(e) === pictureKey(image)) &&
        (!selected || selected.numInPage !== image.numInPage || selected.layerNum !== image.layerNum)) {
      throw new Error('新旧图片位置重叠，设备未明确选中新图片，原笔迹未删除。[R2-身份]');
    }
    if (!image.uuid || image.layerNum !== s.layer || !Number.isInteger(image.numInPage) || image.numInPage < 1) {
      throw new Error('新公式所在图层或编号未确认，原笔迹未删除。[R2]');
    }
    diagnostic.stage = 'select-image';
    const originalIds = await matchingIds(s, imported);
    let selectedImage = await selectImportedImage(image, size, s, diagnostic, originalIds, before);
    if (selectedImage.overlapsOriginals) {
      // User approved deleting the confirmed original formula before moving when
      // it overlaps the imported picture. Never delete other lasso contents.
      if (before.some(e => e.type === 200 && pictureKey(e) === pictureKey(image))) {
        throw new Error('新旧图片重叠，无法保证删除后准确定位新图，已停止。[R2-身份]');
      }
      await validate(s);
      diagnostic.stage = 'delete-overlapping-originals';
      deletionAttempted = true;
      accepted(await PluginCommAPI.deletePageElements(originalIds, s.page, s.layer), '删除对应原笔迹');
      const cleared = await pageElements(s);
      diagnostic.afterEarlyDelete = pictureSnapshot(cleared);
      for (const e of cleared.filter(e => e.type === 0 && e.layerNum === s.layer)) {
        if (s.signatures.includes(await signature(e))) { throw new Error('部分原笔迹仍在，已停止缩放。'); }
      }
      originalsRemoved = true;
      const remaining = pictureChanges(before, cleared);
      if (remaining.missing || remaining.added.length !== 1 || remaining.added[0].layerNum !== s.layer ||
          pictureKey(remaining.added[0]) !== pictureKey(image)) {
        throw new Error('删除后无法唯一确认新图片，请返回笔记检查。');
      }
      image = remaining.added[0];
      if (!Number.isInteger(image.numInPage) || image.numInPage < 1) { throw new Error('新图片编号未确认。'); }
      diagnostic.stage = 'select-image-after-delete';
      selectedImage = await selectImportedImage(image, size, s, diagnostic, [], before);
    }
    diagnostic.oldPosition = selectedImage.rect;
    await validate(s);
    // Resize the existing picture through the native lasso. Do not rewrite its
    // backing element: that path has removed the imported image on the device.
    diagnostic.stage = 'resize-image';
    accepted(await PluginCommAPI.resizeLassoRect(target), '套索移动新公式 [R3-缩放]');
    // The host can return the pre-resize lasso bounds even after a successful
    // move. Read them for diagnostics only; verify the persisted picture itself.
    try { diagnostic.actual = checked<Rect>(await PluginCommAPI.getLassoRect(), '读取移动后位置'); }
    catch { diagnostic.actualUnavailable = true; }
    diagnostic.stage = 'verify-saved-image';
    let inserted: any[] = [], rect: Rect | undefined;
    const reads: object[] = []; diagnostic.savedReads = reads;
    for (let moveAttempt = 0; moveAttempt < 2; moveAttempt++) {
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt) { await new Promise(resolve => setTimeout(resolve, attempt * 200)); }
        inserted = await pageElements(s);
        diagnostic.positioned = pictureSnapshot(inserted);
        reads.push({pictures: pictureSnapshot(inserted)});
        const changed = pictureChanges(before, inserted, image);
        if (changed.missing || changed.added.length !== 1 || changed.added[0].layerNum !== s.layer) {
          throw new Error('移动后未能确认新图片仍在，原笔迹未删除。[R3-保存]');
        }
        const saved = changed.added[0].picture?.rect as Rect;
        // Native lasso bounds include a small selection border. At the requested
        // formula size the image can be inset by a few pixels, not a different box.
        if (validRect(saved) && closeRect(saved, target, 3)) { rect = saved; break; }
      }
      if (rect || moveAttempt === 1) { break; }
      const unchanged = pictureChanges(before, inserted, image);
      if (unchanged.missing || unchanged.added.length !== 1 ||
          unchanged.added[0].layerNum !== s.layer || pictureKey(unchanged.added[0]) !== pictureKey(image)) { break; }
      // A host success response can be a no-op after editing an existing page.
      // Save before reloading; never reinsert or retry an ambiguous/partial move.
      diagnostic.stage = 'refresh-unmoved-image';
      diagnostic.recoveryAttempted = true;
      await validate(s);
      accepted(await PluginNoteAPI.saveCurrentNote(), '保存定位重试前的笔记');
      await validate(s);
      checked(await PluginCommAPI.reloadFile(), '刷新定位状态');
      const refreshed = await pageElements(s);
      diagnostic.afterRefresh = pictureSnapshot(refreshed);
      const fresh = pictureChanges(before, refreshed);
      if (fresh.missing || fresh.added.length !== 1 || fresh.added[0].layerNum !== s.layer ||
          !Number.isInteger(fresh.added[0].numInPage) || fresh.added[0].numInPage < 1) {
        throw new Error('刷新后无法唯一确认新公式，已停止重试。[R3-重试]');
      }
      image = fresh.added[0];
      // Reload can expose a move that was already saved. Do not resize it twice.
      if (validRect(image.picture?.rect) && closeRect(image.picture.rect, target, 3)) {
        rect = image.picture.rect; inserted = refreshed; break;
      }
      if (pictureKey(image) !== pictureKey(unchanged.added[0])) {
        throw new Error('刷新后图片位置发生变化，已停止重试。[R3-重试]');
      }
      diagnostic.stage = 'reselect-unmoved-image';
      // No handwriting is permitted in this retry selection. The normal flow
      // already handles original-stroke overlap before reaching this point.
      await selectImportedImage(image, size, s, diagnostic, [], before, true);
      // Reload alone has left a valid-looking but ineffective native lasso on
      // devices. Explicitly rebuild its UI state before the bounded retry.
      diagnostic.stage = 'rebuild-image-lasso';
      accepted(await PluginCommAPI.setLassoBoxState(2), '清除旧套索状态');
      await selectImportedImage(image, size, s, diagnostic, [], before, true);
      accepted(await PluginCommAPI.setLassoBoxState(0), '显示新公式套索');
      await new Promise(resolve => setTimeout(resolve, 100));
      await validate(s);
      const live = checked<any[]>(await PluginCommAPI.getLassoElements(), '核验移动前选区');
      diagnostic.retrySelection = pictureSnapshot(live);
      if (live.length !== 1 || live[0].type !== 200 || live[0].numInPage !== image.numInPage || live[0].layerNum !== image.layerNum) {
        throw new Error('移动前选区发生变化，已停止重试。[R3-选区]');
      }
      diagnostic.stage = 'retry-resize-image';
      accepted(await PluginCommAPI.resizeLassoRect(target), '重新定位新公式 [R3-重试]');
    }
    if (!rect) { throw new Error('笔记中图片的实际位置未到原选区，原笔迹未删除。[R3-保存]'); }
    confirmPicture(inserted, before, s, rect);
    if (!originalsRemoved) {
      const ids = await matchingIds(s, inserted);
      await validate(s);
      diagnostic.stage = 'delete-original';
      deletionAttempted = true;
      accepted(await PluginCommAPI.deletePageElements(ids, s.page, s.layer), '删除原笔迹');
    }
    const after = await pageElements(s);
    confirmPicture(after, before, s, rect);
    for (const e of after.filter(e => e.type === 0 && e.layerNum === s.layer)) {
      if (s.signatures.includes(await signature(e))) { throw new Error('部分原笔迹仍然存在。'); }
    }
    checked(await PluginCommAPI.reloadFile(), '刷新笔记');
    return {warning: ''};
  } catch (e) {
    // A failed verification may still leave an inserted image. Refresh only after
    // a confirmed save, and only if the user is still on the original page.
    try {
      await validate(s);
      accepted(await PluginNoteAPI.saveCurrentNote(), '保存笔记');
      await validate(s);
      checked(await PluginCommAPI.reloadFile(), '刷新笔记');
    } catch { /* Keep the original error; never reload an unsaved or different note. */ }
    // The message may originate in the host and include a file path, so it is
    // displayed locally but not copied into the shareable diagnostic.
    diagnostic.deletionAttempted = deletionAttempted;
    diagnostic.originalsRemoved = originalsRemoved;
    const diagnosticHint = await saveReplacementDiagnostic(diagnostic);
    let reason = e instanceof Error ? e.message : '';
    if (deletionAttempted) { reason = reason.replace(/原笔迹未删除|保留原笔迹|未移动图片或删除原笔迹/g, '请检查笔记'); }
    const outcome = originalsRemoved ? '原笔迹已删除，新公式未能完成定位，请返回笔记手动调整，勿重复插入。'
      : deletionAttempted ? '已尝试删除对应原笔迹，请返回笔记检查图片与笔迹，勿重复插入。'
      : '替换未能完整确认，请返回笔记检查，勿重复插入。';
    return {warning: `${outcome}${reason}${diagnosticHint}`};
  }
}
