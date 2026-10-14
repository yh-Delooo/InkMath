export type CropBox = {x: number; y: number; w: number; h: number};
export type CropMode = 'move' | 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se';
export type Bounds = {width: number; height: number};
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi));

export function hitCrop(box: CropBox, x: number, y: number): CropMode | null {
  // Keep a central move area even for small selections; corners take priority.
  const rx = Math.min(24, box.w / 3), ry = Math.min(24, box.h / 3);
  const left = Math.abs(x - box.x) <= rx, right = Math.abs(x - box.x - box.w) <= rx;
  const top = Math.abs(y - box.y) <= ry, bottom = Math.abs(y - box.y - box.h) <= ry;
  if (top && left) { return 'nw'; }
  if (top && right) { return 'ne'; }
  if (bottom && left) { return 'sw'; }
  if (bottom && right) { return 'se'; }
  if (x >= box.x && x <= box.x + box.w) {
    if (top) { return 'n'; }
    if (bottom) { return 's'; }
  }
  if (y >= box.y && y <= box.y + box.h) {
    if (left) { return 'w'; }
    if (right) { return 'e'; }
  }
  return x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h ? 'move' : null;
}

export function dragCrop(start: CropBox, mode: CropMode, dx: number, dy: number, bounds: Bounds): CropBox {
  if (mode === 'move') {
    return {...start, x: clamp(start.x + dx, 0, bounds.width - start.w), y: clamp(start.y + dy, 0, bounds.height - start.h)};
  }
  const minW = Math.min(64, bounds.width), minH = Math.min(64, bounds.height);
  let left = start.x, top = start.y, right = start.x + start.w, bottom = start.y + start.h;
  if (mode.includes('w')) { left = clamp(start.x + dx, 0, right - minW); }
  if (mode.includes('e')) { right = clamp(right + dx, left + minW, bounds.width); }
  if (mode.includes('n')) { top = clamp(start.y + dy, 0, bottom - minH); }
  if (mode.includes('s')) { bottom = clamp(bottom + dy, top + minH, bounds.height); }
  return {x: left, y: top, w: right - left, h: bottom - top};
}

export function cropPixels(box: CropBox, display: Bounds, source: Bounds) {
  const x = clamp(Math.floor(box.x / display.width * source.width), 0, source.width - 1);
  const y = clamp(Math.floor(box.y / display.height * source.height), 0, source.height - 1);
  const right = clamp(Math.ceil((box.x + box.w) / display.width * source.width), x + 1, source.width);
  const bottom = clamp(Math.ceil((box.y + box.h) / display.height * source.height), y + 1, source.height);
  return {offset: {x, y}, size: {width: right - x, height: bottom - y}};
}
