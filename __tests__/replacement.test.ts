jest.mock('react-native-fs', () => ({hash: jest.fn(async () => 'formula-hash'), exists: jest.fn(async () => true), mkdir: jest.fn(), writeFile: jest.fn(), ExternalStorageDirectoryPath: '/storage/emulated/0'}));
import RNFS from 'react-native-fs';
jest.mock('../imageStorage', () => ({getImageDirectory: async () => '/plugin'}));
jest.mock('sn-plugin-lib', () => ({
  PluginCommAPI: {setLassoBoxState: jest.fn(), getLassoElements: jest.fn(), getLassoRect: jest.fn(), getCurrentFilePath: jest.fn(), getCurrentPageNum: jest.fn(), modifyPageElements: jest.fn(), lassoElements: jest.fn(), resizeLassoRect: jest.fn(), deletePageElements: jest.fn(), getPageDisplaySize: jest.fn(), reloadFile: jest.fn()},
  PluginFileAPI: {getElements: jest.fn()}, PluginNoteAPI: {saveCurrentNote: jest.fn(), insertImage: jest.fn()},
  PointUtils: {androidPoint2Emr: (p: any) => ({x: 2000 - p.y * 2, y: p.x * 2}), emrPoint2Android: (p: any) => ({x: p.y / 2, y: (2000 - p.x) / 2})},
}));
jest.mock('../permissions', () => ({requestDeletePermission: jest.fn(async () => true)}));
jest.mock('../src/storage', () => ({checked: (r: any) => { if (!r?.success || r.result == null || r.result === false) { throw Error('failed'); } return r.result; }, exportSelection: async () => '/selection.png'}));
import {PluginCommAPI as C, PluginFileAPI as F, PluginNoteAPI as N} from 'sn-plugin-lib';
import {requestDeletePermission} from '../permissions';
import {captureHandwriting, insertRecognizedFormula, strokeIds, fitRect, integerRect} from '../src/replacement';
const ok = (result: any) => ({success: true, result});
const accessor = (values: any[]) => ({size: async () => values.length || -1, getRange: async (start: number, count: number) => values.slice(start, start + count)});
const stroke = (id = 1, x = 10) => ({type: 0, numInPage: id, pageNum: 0, layerNum: 0, thickness: 2,
  stroke: {penType: 10, penColor: 0, points: accessor([{x, y: 20}, {x: x + 5, y: 30}]),
    pressures: accessor([2, 3]), eraseLineTrailNums: accessor([]), flagDraw: accessor([]), markPenDirection: accessor([])}});
let elements: any[];
beforeEach(() => {
  jest.resetAllMocks(); (C.setLassoBoxState as jest.Mock).mockResolvedValue(ok(true)); (RNFS.exists as jest.Mock).mockResolvedValue(true); (RNFS.hash as jest.Mock).mockResolvedValue('formula-hash'); elements = [stroke(), stroke(2, 50)];
  (requestDeletePermission as jest.Mock).mockResolvedValue(true);
  (C.getLassoElements as jest.Mock).mockResolvedValue(ok([stroke()]));
  (C.getLassoRect as jest.Mock).mockResolvedValue(ok({left: 10, top: 20, right: 110, bottom: 120}));
  (C.getCurrentFilePath as jest.Mock).mockResolvedValue(ok('/test.note'));
  (C.getCurrentPageNum as jest.Mock).mockResolvedValue(ok(0));
  (C.getPageDisplaySize as jest.Mock).mockResolvedValue(ok({width: 1404, height: 1872}));
  (N.insertImage as jest.Mock).mockImplementation(async path => {
    elements.push({uuid: 'native-image', type: 200, pageNum: 0, layerNum: 0, numInPage: 3,
      picture: {picturePath: path, rect: {left: 0, top: 0, right: 100, bottom: 50}}});
    (C.getLassoElements as jest.Mock).mockImplementation(async () => ok(elements.filter(e => e.numInPage === 3)));
    (C.getLassoRect as jest.Mock).mockResolvedValue(ok({left: 0, top: 950, right: 25, bottom: 1000}));
    return ok(true);
  });
  (C.lassoElements as jest.Mock).mockImplementation(async () => {
    (C.getLassoElements as jest.Mock).mockImplementation(async () => ok(elements.filter(e => e.numInPage === 3)));
    return ok(true);
  });
  (C.resizeLassoRect as jest.Mock).mockImplementation(async r => {
    elements.find(e => e.numInPage === 3).picture.rect = {...r};
    (C.getLassoRect as jest.Mock).mockResolvedValue(ok(r));
    return ok(true);
  });
  (C.modifyPageElements as jest.Mock).mockImplementation(async ([image]) => {
    elements = elements.map(e => e.numInPage === image.numInPage ? JSON.parse(JSON.stringify(image)) : e);
    return ok([image.numInPage]);
  });
  (C.deletePageElements as jest.Mock).mockImplementation(async ids => {elements = elements.filter(e => !ids.includes(e.numInPage)); return ok(true);});
  (C.reloadFile as jest.Mock).mockResolvedValue(ok(true));
  (N.saveCurrentNote as jest.Mock).mockResolvedValue(ok(true));
  (F.getElements as jest.Mock).mockImplementation(async () => ok(elements.map(e => e.type === 200 ? JSON.parse(JSON.stringify(e)) : e)));
});
const replace = async () => insertRecognizedFormula(await captureHandwriting(), '/formula.png', 2);
test('rejects mixed, empty, cross-layer and duplicate selections', () => {
  for (const list of [[], [{...stroke(), type: 200}], [stroke(), {...stroke(2), layerNum: 1}], [stroke(), stroke()]]) {
    expect(() => strokeIds(list)).toThrow();
  }
});
test('fits centered without stretching', () => {
  const rect = fitRect({left: 10, top: 20, right: 110, bottom: 120}, 2);
  expect(rect).toEqual({left: 10, top: 45, right: 110, bottom: 95});
  expect(() => fitRect(rect, 0)).toThrow();
});
test('inserts at original position then deletes only the matching original stroke', async () => {
  expect(await replace()).toEqual({warning: ''});
  expect(N.insertImage).toHaveBeenCalledWith('/formula.png');
  expect(C.resizeLassoRect).toHaveBeenCalledWith({left: 10, top: 45, right: 110, bottom: 95});
  expect(C.modifyPageElements).not.toHaveBeenCalled();
  expect(C.deletePageElements).toHaveBeenCalledWith([1], 0, 0);
  expect(elements.some(e => e.numInPage === 2)).toBe(true);
  expect(C.reloadFile).toHaveBeenCalledTimes(1);
});
test('uses fresh element numbers after insertion', async () => {
  const insert = (N.insertImage as jest.Mock).getMockImplementation()!;
  (N.insertImage as jest.Mock).mockImplementation(async path => {await insert(path); elements[0] = stroke(7); elements[1] = stroke(8, 50); return ok(true);});
  expect(await replace()).toEqual({warning: ''});
  expect(C.deletePageElements).toHaveBeenCalledWith([7], 0, 0);
});
test.each(['page', 'file', 'stroke', 'duplicate', 'permission'])('changed %s prevents insertion and deletion', async reason => {
  const selection = await captureHandwriting();
  if (reason === 'page') { (C.getCurrentPageNum as jest.Mock).mockResolvedValue(ok(1)); }
  if (reason === 'file') { (C.getCurrentFilePath as jest.Mock).mockResolvedValue(ok('/other.note')); }
  if (reason === 'stroke') { elements = [stroke(1, 99)]; }
  if (reason === 'duplicate') { elements.push(stroke(3)); }
  if (reason === 'permission') { (requestDeletePermission as jest.Mock).mockResolvedValue(false); }
  await expect(insertRecognizedFormula(selection, '/formula.png', 2)).rejects.toThrow();
  expect(N.insertImage).not.toHaveBeenCalled(); expect(C.deletePageElements).not.toHaveBeenCalled();
});
test.each(['failed', 'missing', 'changed-stroke', 'changed-page', 'save', 'wrong-layer', 'ambiguous'])('unconfirmed insertion (%s) preserves original strokes', async reason => {
  const insert = (N.insertImage as jest.Mock).getMockImplementation()!;
  (N.insertImage as jest.Mock).mockImplementation(async path => {
    if (reason === 'failed') { return ok(false); }
    if (reason !== 'missing') { await insert(path); }
    if (reason === 'changed-stroke') { elements[0] = stroke(1, 99); }
    if (reason === 'changed-page') { (C.getCurrentPageNum as jest.Mock).mockResolvedValue(ok(1)); }
    if (reason === 'save') { (N.saveCurrentNote as jest.Mock).mockResolvedValue(ok(false)); }
    if (reason === 'wrong-layer') { elements[elements.length - 1].layerNum = 1; }
    if (reason === 'ambiguous') { await insert(path); }
    return ok(true);
  });
  expect((await replace()).warning).toContain('勿重复插入');
  expect(C.deletePageElements).not.toHaveBeenCalled();
  expect(N.insertImage).toHaveBeenCalledTimes(1);
});
test('a silently ignored move does not delete originals', async () => {
  (C.resizeLassoRect as jest.Mock).mockResolvedValue(ok(true));
  expect((await replace()).warning).toContain('[R3-保存]');
  expect(C.reloadFile).toHaveBeenCalledTimes(2);
  expect(C.deletePageElements).not.toHaveBeenCalled();
});
test.each(['/host/embedded.png', 'content://note/embedded', ''])('tracks a unique native import with path %s without reading its bytes', async nativePath => {
  const insert = (N.insertImage as jest.Mock).getMockImplementation()!;
  (N.insertImage as jest.Mock).mockImplementation(async path => {
    await insert(path); elements[2].picture.picturePath = nativePath; return ok(true);
  });
  (RNFS.hash as jest.Mock).mockRejectedValue(Error('host image inaccessible'));
  expect(await replace()).toEqual({warning: ''});
  expect(RNFS.hash).not.toHaveBeenCalled();
});
test('a changed existing picture cannot be mistaken for the new import', async () => {
  elements.push({uuid: 'old', type: 200, layerNum: 0, numInPage: 5, picture: {picturePath: '/old.png', rect: {left: 1, top: 2, right: 3, bottom: 4}}});
  (N.insertImage as jest.Mock).mockImplementation(async () => {
    elements[2].picture.rect.left += 10; return ok(true);
  });
  expect((await replace()).warning).toContain('[R2]');
  expect(C.modifyPageElements).not.toHaveBeenCalled();
  expect(C.deletePageElements).not.toHaveBeenCalled();
});
test('an existing identical picture is preserved when the new one is added', async () => {
  elements.push({uuid: 'old', type: 200, layerNum: 0, numInPage: 5, picture: {picturePath: '/formula.png', rect: {left: 0, top: 0, right: 100, bottom: 50}}});
  expect(await replace()).toEqual({warning: ''});
  expect(elements.find(e => e.numInPage === 5).picture.rect.left).toBe(0);
});
test('missing delete result warns even if host reported success', async () => {
  (C.deletePageElements as jest.Mock).mockResolvedValue(ok(true));
  expect((await replace()).warning).toContain('部分原笔迹仍然存在');
});
test('expired lasso does not prevent replacement', async () => {
  const selection = await captureHandwriting();
  (C.getLassoElements as jest.Mock).mockClear().mockRejectedValue(Error('NO lasso Action'));
  expect(await insertRecognizedFormula(selection, '/formula.png', 2)).toEqual({warning: ''});
  expect(C.getLassoElements).toHaveBeenCalled();
});

test('negative imported page metadata and embedded paths are not sent to element modification', async () => {
  const insert = (N.insertImage as jest.Mock).getMockImplementation()!;
  (N.insertImage as jest.Mock).mockImplementation(async path => {
    await insert(path); elements[2].pageNum = -1; elements[2].picture.picturePath = 'note://embedded'; return ok(true);
  });
  expect(await replace()).toEqual({warning: ''});
  expect(C.modifyPageElements).not.toHaveBeenCalled();
});
test('creates a fresh lasso when the import did not automatically select the picture', async () => {
  const insert = (N.insertImage as jest.Mock).getMockImplementation()!;
  (N.insertImage as jest.Mock).mockImplementation(async path => {
    await insert(path); (C.getLassoElements as jest.Mock).mockRejectedValue(Error('no lasso')); return ok(true);
  });
  expect(await replace()).toEqual({warning: ''});
  expect(C.lassoElements).toHaveBeenCalledTimes(1);
});
test('never resizes a mixed lasso containing handwriting', async () => {
  const insert = (N.insertImage as jest.Mock).getMockImplementation()!;
  (N.insertImage as jest.Mock).mockImplementation(async path => {
    await insert(path); (C.getLassoElements as jest.Mock).mockImplementation(async () => ok(elements)); return ok(true);
  });
  (C.lassoElements as jest.Mock).mockResolvedValue(ok(true));
  expect((await replace()).warning).toContain('[R3-选区]');
  expect(C.resizeLassoRect).not.toHaveBeenCalled();
  expect(C.deletePageElements).not.toHaveBeenCalled();
});
test('a changed selection box without saved image movement cannot authorize deletion', async () => {
  (C.resizeLassoRect as jest.Mock).mockImplementation(async r => {
    (C.getLassoRect as jest.Mock).mockResolvedValue(ok(r)); return ok(true);
  });
  expect((await replace()).warning).toContain('[R3-保存]');
  expect(C.deletePageElements).not.toHaveBeenCalled();
});
test('if the host loses the image during resize, handwriting stays intact', async () => {
  (C.resizeLassoRect as jest.Mock).mockImplementation(async r => {
    (C.getLassoRect as jest.Mock).mockResolvedValue(ok(r)); elements = elements.filter(e => e.type !== 200); return ok(true);
  });
  expect((await replace()).warning).toContain('[R3-保存]');
  expect(C.deletePageElements).not.toHaveBeenCalled();
});
test('missing source PNG prevents insertion', async () => {
  (RNFS.exists as jest.Mock).mockResolvedValue(false);
  await expect(replace()).rejects.toThrow('PNG 文件不存在');
  expect(N.insertImage).not.toHaveBeenCalled();
});

test('regenerated paths on existing pictures do not count as additional imports', async () => {
  elements.push({uuid: 'old', type: 200, layerNum: 0, numInPage: 5, picture: {picturePath: '/old-1.png', rect: {left: 300, top: 400, right: 350, bottom: 450}}});
  let read = 0;
  (F.getElements as jest.Mock).mockImplementation(async () => {
    read++;
    return ok(elements.map(e => e.type === 200 ? {...JSON.parse(JSON.stringify(e)), picture: {...e.picture, picturePath: `/internal/read-${read}-${e.numInPage}.png`}} : e));
  });
  expect(await replace()).toEqual({warning: ''});
  expect(C.deletePageElements).toHaveBeenCalledWith([1], 0, 0);
  expect(elements.find(e => e.numInPage === 5).picture.rect.left).toBe(300);
});
test('overlapping old and new images use the host selection even when the new image is listed first', async () => {
  elements.push({uuid: 'old', type: 200, layerNum: 0, numInPage: 5, picture: {picturePath: '/old.png', rect: {left: 0, top: 0, right: 100, bottom: 50}}});
  const insert = (N.insertImage as jest.Mock).getMockImplementation()!;
  (N.insertImage as jest.Mock).mockImplementation(async path => {await insert(path); elements.unshift(elements.pop()); return ok(true);});
  expect(await replace()).toEqual({warning: ''});
  expect(elements.find(e => e.numInPage === 5).picture.rect.left).toBe(0);
});
test('overlapping images without an explicit new-image selection stop before moving', async () => {
  elements.push({uuid: 'old', type: 200, layerNum: 0, numInPage: 5, picture: {picturePath: '/old.png', rect: {left: 0, top: 0, right: 100, bottom: 50}}});
  const insert = (N.insertImage as jest.Mock).getMockImplementation()!;
  (N.insertImage as jest.Mock).mockImplementation(async path => {await insert(path); (C.getLassoElements as jest.Mock).mockRejectedValue(Error('no selection')); return ok(true);});
  expect((await replace()).warning).toContain('[R2-身份]');
  expect(C.resizeLassoRect).not.toHaveBeenCalled();
  expect(C.deletePageElements).not.toHaveBeenCalled();
});

test('both lasso selection and resize receive integer coordinates', async () => {
  const insert = (N.insertImage as jest.Mock).getMockImplementation()!;
  (N.insertImage as jest.Mock).mockImplementation(async path => {
    await insert(path); elements[2].picture.rect = {left: 0.5, top: 0.5, right: 100.5, bottom: 50.5};
    (C.getLassoElements as jest.Mock).mockRejectedValue(Error('no lasso')); return ok(true);
  });
  for (const method of [C.lassoElements, C.resizeLassoRect]) {
    const native = (method as jest.Mock).getMockImplementation()!;
    (method as jest.Mock).mockImplementation(async r => {
      if (!Object.values(r).every(Number.isInteger)) { return {success: false, error: {message: 'must be an integer'}}; }
      return native(r);
    });
  }
  expect(await insertRecognizedFormula(await captureHandwriting(), '/formula.png', 1.7)).toEqual({warning: ''});
  expect(C.lassoElements).toHaveBeenCalled(); expect(C.resizeLassoRect).toHaveBeenCalled();
  expect(integerRect({left: 1.2, top: 2.3, right: 30.4, bottom: 40.5}, true)).toEqual({left: 1, top: 2, right: 31, bottom: 41});
});
test('failure diagnostics retain image counts and bounds without note content or paths', async () => {
  const insert = (N.insertImage as jest.Mock).getMockImplementation()!;
  (N.insertImage as jest.Mock).mockImplementation(async path => {await insert(path); await insert(path); return ok(true);});
  const result = await replace();
  expect(result.warning).toContain('图片总数 0 → 2');
  expect(result.warning).toContain('EXPORT/InkMath-debug.json');
  const payload = JSON.parse((RNFS.writeFile as jest.Mock).mock.calls[0][1]);
  expect(payload.before).toHaveLength(0); expect(payload.imported).toHaveLength(2);
  expect(JSON.stringify(payload)).not.toContain('/test.note');
  expect(JSON.stringify(payload)).not.toContain('/formula.png');
  expect(C.deletePageElements).not.toHaveBeenCalled();
});

test('device diagnostic pixel bounds select image 8 without incorrect EMR conversion', async () => {
  const insert = (N.insertImage as jest.Mock).getMockImplementation()!;
  const nativeRect = {left: 200, top: 750, right: 1203, bottom: 1122};
  (N.insertImage as jest.Mock).mockImplementation(async path => {
    await insert(path); elements[2].numInPage = 8; elements[2].pageNum = -1; elements[2].picture.rect = {...nativeRect};
    (C.getLassoElements as jest.Mock).mockResolvedValue(ok([])); return ok(true);
  });
  (C.lassoElements as jest.Mock).mockImplementation(async area => {
    (C.getLassoElements as jest.Mock).mockResolvedValue(ok(JSON.stringify(area) === JSON.stringify(nativeRect) ? [elements[2]] : []));
    (C.getLassoRect as jest.Mock).mockResolvedValue(ok(nativeRect)); return ok(true);
  });
  (C.resizeLassoRect as jest.Mock).mockImplementation(async rect => {
    elements[2].picture.rect = {...rect}; (C.getLassoRect as jest.Mock).mockResolvedValue(ok(rect)); return ok(true);
  });
  const selection = await captureHandwriting();
  selection.rect = {left: 608, top: 600, right: 788, bottom: 666};
  expect(await insertRecognizedFormula(selection, '/formula.png', 180 / 66)).toEqual({warning: ''});
  expect(C.lassoElements).toHaveBeenCalledTimes(1);
  expect(C.lassoElements).toHaveBeenCalledWith(nativeRect);
  expect(C.resizeLassoRect).toHaveBeenCalledWith(selection.rect);
});
test('legacy coordinates are attempted only if direct bounds do not select the imported image', async () => {
  const insert = (N.insertImage as jest.Mock).getMockImplementation()!;
  (N.insertImage as jest.Mock).mockImplementation(async path => {
    await insert(path); (C.getLassoElements as jest.Mock).mockResolvedValue(ok([])); return ok(true);
  });
  const lasso = (C.lassoElements as jest.Mock).getMockImplementation()!;
  (C.lassoElements as jest.Mock).mockResolvedValueOnce(ok(true)).mockImplementationOnce(lasso);
  expect(await replace()).toEqual({warning: ''});
  expect(C.lassoElements).toHaveBeenCalledTimes(2);
  expect(C.lassoElements).toHaveBeenLastCalledWith({left: 0, top: 950, right: 25, bottom: 1000});
});

test('stale lasso bounds do not reject a correctly saved picture', async () => {
  (C.resizeLassoRect as jest.Mock).mockImplementation(async target => {
    elements.find(e => e.type === 200).picture.rect = {...target};
    // getLassoRect deliberately keeps its old position, as on the device.
    return ok(true);
  });
  expect(await replace()).toEqual({warning: ''});
  expect(C.deletePageElements).toHaveBeenCalledWith([1], 0, 0);
});
test('waits for a delayed saved image without repeating resize or insertion', async () => {
  let target: any, reads = 0;
  (C.resizeLassoRect as jest.Mock).mockImplementation(async r => {target = r; return ok(true);});
  const read = (F.getElements as jest.Mock).getMockImplementation()!;
  (F.getElements as jest.Mock).mockImplementation(async (...args) => {
    if (target && ++reads === 2) { elements.find(e => e.type === 200).picture.rect = {...target}; }
    return read(...args);
  });
  expect(await replace()).toEqual({warning: ''});
  expect(N.insertImage).toHaveBeenCalledTimes(1); expect(C.resizeLassoRect).toHaveBeenCalledTimes(1);
});
test('a moved but incorrectly positioned saved image never authorizes deletion', async () => {
  (C.resizeLassoRect as jest.Mock).mockImplementation(async target => {
    elements.find(e => e.type === 200).picture.rect = {...target, left: target.left + 20, right: target.right + 20};
    (C.getLassoRect as jest.Mock).mockResolvedValue(ok(target)); return ok(true);
  });
  expect((await replace()).warning).toContain('[R3-保存]');
  expect(C.resizeLassoRect).toHaveBeenCalledTimes(1);
  expect(C.deletePageElements).not.toHaveBeenCalled();
});

function overlapOnlyOriginal() {
  const insert = (N.insertImage as jest.Mock).getMockImplementation()!;
  (N.insertImage as jest.Mock).mockImplementation(async path => {
    await insert(path);
    (C.getLassoElements as jest.Mock).mockImplementation(async () => ok(elements.filter(e => e.numInPage === 1 || e.type === 200)));
    return ok(true);
  });
}
test('overlapping original strokes are deleted before resizing and the renumbered picture is reidentified', async () => {
  overlapOnlyOriginal();
  (C.deletePageElements as jest.Mock).mockImplementation(async ids => {
    elements = elements.filter(e => !ids.includes(e.numInPage));
    elements.find(e => e.type === 200).numInPage = 11;
    return ok(true);
  });
  (C.resizeLassoRect as jest.Mock).mockImplementation(async target => {
    expect(elements.some(e => e.numInPage === 1)).toBe(false);
    elements.find(e => e.type === 200).picture.rect = {...target};
    return ok(true);
  });
  expect(await replace()).toEqual({warning: ''});
  expect(C.deletePageElements).toHaveBeenCalledTimes(1);
  expect(C.deletePageElements).toHaveBeenCalledWith([1], 0, 0);
  expect((C.deletePageElements as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan((C.resizeLassoRect as jest.Mock).mock.invocationCallOrder[0]);
  expect(elements.some(e => e.numInPage === 2)).toBe(true);
});
test('a failed resize after early deletion reports the actual outcome and retains the image', async () => {
  overlapOnlyOriginal();
  (C.resizeLassoRect as jest.Mock).mockResolvedValue(ok(false));
  const result = await replace();
  expect(result.warning).toContain('原笔迹已删除');
  expect(result.warning).toContain('手动调整');
  expect(result.warning).not.toContain('原笔迹未删除');
  expect(elements.filter(e => e.type === 200)).toHaveLength(1);
});
test('a silently ignored early deletion prevents resizing the mixed selection', async () => {
  overlapOnlyOriginal();
  (C.deletePageElements as jest.Mock).mockResolvedValue(ok(true));
  expect((await replace()).warning).toContain('部分原笔迹仍在');
  expect(C.resizeLassoRect).not.toHaveBeenCalled();
});

// Device regression: the second import overlaps the first formula by 17 pixels.
test.each([true, false])('second replacement isolates new image after deletion (host supports partial selection: %s)', async supportsPartial => {
  const oldRect = {left: 713, top: 741, right: 892, bottom: 806};
  const newRect = {left: 200, top: 789, right: 1203, bottom: 1083};
  elements.push({uuid: 'previous', type: 200, numInPage: 49, layerNum: 0, pageNum: 0, picture: {rect: {...oldRect}}});
  const insert = (N.insertImage as jest.Mock).getMockImplementation()!;
  (N.insertImage as jest.Mock).mockImplementation(async path => {
    await insert(path);
    elements.find(e => e.numInPage === 3).picture.rect = {...newRect};
    (C.getLassoElements as jest.Mock).mockImplementation(async () => ok(elements.filter(e => e.numInPage === 1 || e.numInPage === 3)));
    return ok(true);
  });
  const remove = (C.deletePageElements as jest.Mock).getMockImplementation()!;
  (C.deletePageElements as jest.Mock).mockImplementation(async (...args) => {
    await remove(...args);
    (C.getLassoElements as jest.Mock).mockImplementation(async () => ok(elements.filter(e => e.type === 200)));
    return ok(true);
  });
  (C.lassoElements as jest.Mock).mockImplementation(async area => {
    const selected = elements.filter(e => e.type === 200 && (!supportsPartial ||
      (area.left < e.picture.rect.right && area.right > e.picture.rect.left &&
       area.top < e.picture.rect.bottom && area.bottom > e.picture.rect.top)));
    (C.getLassoElements as jest.Mock).mockResolvedValue(ok(selected));
    (C.getLassoRect as jest.Mock).mockResolvedValue(ok(newRect));
    return ok(true);
  });
  const resize = (C.resizeLassoRect as jest.Mock).getMockImplementation()!;
  (C.resizeLassoRect as jest.Mock).mockImplementation(async target => {
    expect((await (C.getLassoElements as jest.Mock)()).result.map((e: any) => e.numInPage)).toEqual([3]);
    return resize(target);
  });
  const result = await replace();
  expect(elements.find(e => e.numInPage === 49).picture.rect).toEqual(oldRect);
  expect(C.deletePageElements).toHaveBeenCalledWith([1], 0, 0);
  if (supportsPartial) {
    expect(result.warning).toBe('');
    expect(C.resizeLassoRect).toHaveBeenCalledTimes(1);
    expect(C.lassoElements).toHaveBeenCalledWith({left: 200, top: 808, right: 1203, bottom: 1083});
  } else {
    expect(result.warning).toContain('原笔迹已删除');
    expect(C.resizeLassoRect).not.toHaveBeenCalled();
  }
});


test('refreshes and reselects a renumbered import after a successful resize that did nothing', async () => {
  let moves = 0;
  (C.resizeLassoRect as jest.Mock).mockImplementation(async target => {
    if (++moves === 2) {
      expect((await (C.getLassoElements as jest.Mock)()).result.map((e: any) => e.numInPage)).toEqual([75]);
      elements.find(e => e.numInPage === 75).picture.rect = {...target};
    }
    return ok(true);
  });
  (C.reloadFile as jest.Mock).mockImplementation(async () => {
    const image = elements.find(e => e.type === 200);
    image.numInPage = 75;
    (C.getLassoElements as jest.Mock).mockResolvedValue(ok([stroke(2, 50)]));
    return ok(true);
  });
  (C.lassoElements as jest.Mock).mockImplementation(async () => {
    (C.getLassoElements as jest.Mock).mockImplementation(async () => ok(elements.filter(e => e.numInPage === 75)));
    return ok(true);
  });
  expect(await replace()).toEqual({warning: ''});
  expect(N.insertImage).toHaveBeenCalledTimes(1);
  expect(C.resizeLassoRect).toHaveBeenCalledTimes(2);
  expect(C.deletePageElements).toHaveBeenCalledTimes(1);
  expect(C.deletePageElements).toHaveBeenCalledWith([1], 0, 0);
});

test('a persistent no-op is retried only once and leaves original strokes intact', async () => {
  (C.resizeLassoRect as jest.Mock).mockResolvedValue(ok(true));
  expect((await replace()).warning).toContain('[R3-保存]');
  expect(N.insertImage).toHaveBeenCalledTimes(1);
  expect(C.resizeLassoRect).toHaveBeenCalledTimes(2);
  expect(C.deletePageElements).not.toHaveBeenCalled();
});

test('refresh revealing a completed move does not resize again', async () => {
  let target: any;
  (C.resizeLassoRect as jest.Mock).mockImplementation(async r => {target = r; return ok(true);});
  (C.reloadFile as jest.Mock).mockImplementation(async () => {
    elements.find(e => e.type === 200).picture.rect = {...target}; return ok(true);
  });
  expect(await replace()).toEqual({warning: ''});
  expect(C.resizeLassoRect).toHaveBeenCalledTimes(1);
  expect(N.insertImage).toHaveBeenCalledTimes(1);
});

test('a mixed selection after refresh prevents retry and deletion', async () => {
  (C.resizeLassoRect as jest.Mock).mockResolvedValue(ok(true));
  (C.lassoElements as jest.Mock).mockImplementation(async () => {
    (C.getLassoElements as jest.Mock).mockImplementation(async () => ok(elements)); return ok(true);
  });
  expect((await replace()).warning).toContain('[R3-选区]');
  expect(C.resizeLassoRect).toHaveBeenCalledTimes(1);
  expect(C.deletePageElements).not.toHaveBeenCalled();
});


test('a failed recovery refresh does not retry the move or delete originals', async () => {
  (C.resizeLassoRect as jest.Mock).mockResolvedValue(ok(true));
  (C.reloadFile as jest.Mock).mockResolvedValue(ok(false));
  expect((await replace()).warning).not.toBe('');
  expect(C.resizeLassoRect).toHaveBeenCalledTimes(1);
  expect(N.insertImage).toHaveBeenCalledTimes(1);
  expect(C.deletePageElements).not.toHaveBeenCalled();
});


test('retry rebuilds the native lasso before resizing an otherwise inert selection', async () => {
  let reset = false, shown = false;
  const resize = (C.resizeLassoRect as jest.Mock).getMockImplementation()!;
  (C.setLassoBoxState as jest.Mock).mockImplementation(async state => {
    if (state === 2) { reset = true; }
    if (state === 0 && reset) { shown = true; }
    return ok(true);
  });
  (C.resizeLassoRect as jest.Mock).mockImplementation(async target => shown ? resize(target) : ok(true));
  expect(await replace()).toEqual({warning: ''});
  expect(C.setLassoBoxState).toHaveBeenNthCalledWith(1, 2);
  expect(C.setLassoBoxState).toHaveBeenNthCalledWith(2, 0);
  expect(N.insertImage).toHaveBeenCalledTimes(1);
});

test('a selection changed while showing the lasso cannot authorize retry', async () => {
  (C.resizeLassoRect as jest.Mock).mockResolvedValue(ok(true));
  (C.setLassoBoxState as jest.Mock).mockImplementation(async state => {
    if (state === 0) { (C.getLassoElements as jest.Mock).mockResolvedValue(ok([stroke(2, 50)])); }
    return ok(true);
  });
  expect((await replace()).warning).toContain('移动前选区发生变化');
  expect(C.resizeLassoRect).toHaveBeenCalledTimes(1);
  expect(C.deletePageElements).not.toHaveBeenCalled();
});

test('history images with changing page-local numbers are preserved during a later replacement', async () => {
  const historyRect = {left: 700, top: 200, right: 900, bottom: 300};
  elements.push({uuid: 'history-image', type: 200, pageNum: 0, layerNum: 0, numInPage: 80, picture: {rect: {...historyRect}}});
  const insert = (N.insertImage as jest.Mock).getMockImplementation()!;
  (N.insertImage as jest.Mock).mockImplementation(async path => {
    await insert(path);
    elements.find(e => e.uuid === 'history-image').numInPage = 86;
    elements.find(e => e.uuid === 'native-image').numInPage = 87;
    (C.getLassoElements as jest.Mock).mockImplementation(async () => ok(elements.filter(e => e.numInPage === 87)));
    return ok(true);
  });
  (C.resizeLassoRect as jest.Mock).mockImplementation(async target => {
    elements.find(e => e.numInPage === 87).picture.rect = {...target}; return ok(true);
  });
  expect(await replace()).toEqual({warning: ''});
  expect(elements.find(e => e.uuid === 'history-image').picture.rect).toEqual(historyRect);
  expect(C.deletePageElements).toHaveBeenCalledWith([1], 0, 0);
});
