// Deliberately small, non-evaluating function grammar. No eval / Function.
export function stripMath(source: string): string {
  let s = source.trim();
  for (const [a, b] of [['$$', '$$'], ['\\[', '\\]'], ['\\(', '\\)'], ['$', '$']]) {
    if (s.startsWith(a) && s.endsWith(b)) { s = s.slice(a.length, -b.length).trim(); break; }
  }
  return s;
}

export function latexToExpression(source: string): string {
  let s = stripMath(source);
  if (s.length > 2000) { throw new Error('公式过长（最多 2000 字符）。'); }
  s = s.replace(/\\(?:left|right)\b/g, '').replace(/\\[,;! ]/g, ' ')
    .replace(/\\(?:cdot|times)\b/g, '*').replace(/\\pi\b/g, 'pi');
  // Parse braces rather than using a regex: nested fractions must stay correct.
  let i = 0;
  function group(): string {
    while (/\s/.test(s[i] || '') && i < s.length) { i++; }
    if (s[i++] !== '{') { throw new Error('分式和根号需要花括号，例如 \\frac{1}{x}。'); }
    return sequence(true);
  }
  function sequence(nested = false): string {
    let out = '';
    while (i < s.length) {
      const c = s[i++];
      if (c === '}') { if (!nested) { throw new Error('多余的右括号。'); } return out; }
      if (c === '{') { out += '(' + sequence(true) + ')'; }
      else if (c === '\\') {
        const m = /^[a-zA-Z]+/.exec(s.slice(i));
        if (!m) { throw new Error('无法将此 LaTeX 命令用于绘图。'); }
        i += m[0].length;
        if (['frac', 'dfrac', 'tfrac'].includes(m[0])) { const a = group(), b = group(); out += '((' + a + ')/(' + b + '))'; }
        else if (m[0] === 'sqrt') { out += 'sqrt(' + group() + ')'; }
        else if (['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'ln', 'log', 'exp', 'abs'].includes(m[0])) { out += m[0] + ' '; }
        else { throw new Error('绘图暂不支持命令 \\' + m[0] + '；可手动编辑 y(x)。'); }
      } else { out += c; }
    }
    if (nested) { throw new Error('缺少右花括号。'); }
    return out;
  }
  let out = sequence().replace(/−/g, '-').trim();
  if (out.includes('=')) {
    const parts = out.split('=');
    if (parts.length !== 2 || !/^(y|f\s*\(\s*x\s*\))$/.test(parts[0].trim())) {
      throw new Error('当前仅支持 y=f(x)；隐式方程和多变量公式请先改写。');
    }
    out = parts[1].trim();
  }
  compileExpression(out); // Refuse unsupported syntax, never guess a function.
  return out;
}

type Fn = (x: number) => number;
const funcs: Record<string, Fn> = {sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan, sqrt: Math.sqrt, abs: Math.abs,
  exp: Math.exp, ln: Math.log, log: Math.log10};
export function compileExpression(input: string): Fn {
  if (!input.trim() || input.length > 2000) { throw new Error('请输入长度不超过 2000 的函数。'); }
  const tokens: string[] = [];
  let rest = input.trim();
  while (rest) {
    const m = /^(\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?|[A-Za-z]+|[()+\-*/^])/.exec(rest);
    if (!m) { throw new Error('不支持的函数字符：' + rest.slice(0, 12)); }
    tokens.push(m[0]); rest = rest.slice(m[0].length).trimStart();
  }
  if (tokens.length > 500) { throw new Error('函数过于复杂。'); }
  let p = 0, depth = 0;
  const peek = () => tokens[p];
  const atomStart = () => !!peek() && (/^[\d.A-Za-z]/.test(peek()) || peek() === '(');
  function atom(): Fn {
    if (++depth > 64) { throw new Error('括号嵌套过深。'); }
    const t = tokens[p++];
    let f: Fn;
    if (t === '(') { f = add(); if (tokens[p++] !== ')') { throw new Error('括号不匹配。'); } }
    else if (t === 'x') { f = x => x; }
    else if (t === 'pi' || t === 'e') { const v = t === 'pi' ? Math.PI : Math.E; f = () => v; }
    else if (Object.prototype.hasOwnProperty.call(funcs, t)) {
      if (peek() !== '(') { throw new Error('函数参数请加括号，例如 sin(x)。'); }
      const arg = atom(); f = x => funcs[t](arg(x));
    } else if (t && /^(\d|\.)/.test(t)) { const n = Number(t); if (!Number.isFinite(n)) { throw new Error('数字超出范围。'); } f = () => n; }
    else { throw new Error('未知变量或不完整函数：' + (t || '结尾')); }
    depth--; return f;
  }
  function power(): Fn { const a = atom(); if (peek() === '^') { p++; const b = unary(); return x => Math.pow(a(x), b(x)); } return a; }
  function unary(): Fn {
    if (peek() === '+' || peek() === '-') { const sign = tokens[p++]; const f = unary(); return x => sign === '-' ? -f(x) : f(x); }
    return power();
  }
  function mul(): Fn {
    let a = unary();
    while (peek() === '*' || peek() === '/' || atomStart()) {
      const op = peek() === '*' || peek() === '/' ? tokens[p++] : '*'; const b = unary(), prev = a;
      a = op === '*' ? x => prev(x) * b(x) : x => prev(x) / b(x);
    } return a;
  }
  function add(): Fn {
    let a = mul();
    while (peek() === '+' || peek() === '-') { const op = tokens[p++], b = mul(), prev = a; a = op === '+' ? x => prev(x) + b(x) : x => prev(x) - b(x); }
    return a;
  }
  const f = add(); if (p !== tokens.length) { throw new Error('公式末尾有多余字符。'); } return f;
}

export type Range = {xmin: number; xmax: number; ymin: number; ymax: number};
export function validateRange(r: Range) {
  if (!Object.values(r).every(v => Number.isFinite(v) && Math.abs(v) <= 1e6) ||
    r.xmax - r.xmin < 1e-6 || r.ymax - r.ymin < 1e-6) {
    throw new Error('坐标范围需递增，跨度至少 0.000001，绝对值不超过 1000000。');
  }
}
export function plotLayout(r: Range, unit = 1) {
  validateRange(r);
  if (!Number.isFinite(unit) || unit <= 0) { throw new Error('单位格必须是大于 0 的数字。'); }
  const columns = (r.xmax - r.xmin) / unit, rows = (r.ymax - r.ymin) / unit;
  if (Math.max(columns, rows) > 100 || Math.min(columns, rows) < 0.1 ||
      Math.max(Math.abs(r.xmin / unit), Math.abs(r.xmax / unit), Math.abs(r.ymin / unit), Math.abs(r.ymax / unit)) > 1e12) {
    throw new Error('每个方向请保留 0.1 到 100 个单位格，调整范围或单位格。');
  }
  const scale = 60 / unit, w = columns * 60, h = rows * 60;
  return {width: w + 115, height: h + 100, left: 85, top: 30, w, h, scale};
}
export function gridTicks(min: number, max: number, unit: number): number[] {
  const start = Math.ceil(min / unit - 1e-9), end = Math.floor(max / unit + 1e-9);
  if (!Number.isFinite(start) || !Number.isFinite(end) || unit <= 0 || end - start > 100) { throw new Error('单位格无效或过密。'); }
  return Array.from({length: Math.max(0, end - start + 1)}, (_, i) => Number(((start + i) * unit).toPrecision(12)));
}
export function plotSvg(expression: string, r: Range, unit = 1): string {
  const {width, height, left, top, w, h} = plotLayout(r, unit);
  const f = compileExpression(expression);
  const px = (x: number) => left + (x - r.xmin) / (r.xmax - r.xmin) * w;
  const py = (y: number) => top + h - (y - r.ymin) / (r.ymax - r.ymin) * h;
  let paths = '', previous: {x: number; y: number} | undefined, count = 0;
  for (let n = 0; n <= 1600; n++) {
    const x = r.xmin + n / 1600 * (r.xmax - r.xmin), y = f(x);
    const visible = Number.isFinite(y) && y >= r.ymin && y <= r.ymax;
    if (!visible) { previous = undefined; continue; }
    const middle = previous ? f((x + previous.x) / 2) : NaN;
    // Break poles and steep jumps. Finite sampling is not symbolic discontinuity detection.
    const continuous = previous && Number.isFinite(middle) &&
      Math.abs(py(y) - py(previous.y)) < h / 3 &&
      Math.abs(py(middle) - (py(y) + py(previous.y)) / 2) < 12;
    paths += `${continuous ? 'L' : 'M'}${px(x).toFixed(2)},${py(y).toFixed(2)} `;
    previous = {x, y}; count++;
  }
  if (!count) { throw new Error('当前范围内没有可见实数值，请调整范围。'); }
  let grid = '';
  for (const value of gridTicks(r.xmin, r.xmax, unit)) {
    const x = px(value);
    grid += `<path d="M${x} ${top}V${top + h}" stroke="#bbb" stroke-width="1"/><text x="${x}" y="${top + h + 28}" text-anchor="middle" font-size="18">${value}</text>`;
  }
  for (const value of gridTicks(r.ymin, r.ymax, unit)) {
    const y = py(value);
    grid += `<path d="M${left} ${y}H${left + w}" stroke="#bbb" stroke-width="1"/><text x="${left - 12}" y="${y + 6}" text-anchor="end" font-size="18">${value}</text>`;
  }
  let axes = '';
  if (r.xmin <= 0 && r.xmax >= 0) { axes += `M${px(0)} ${top}V${top + h} `; }
  if (r.ymin <= 0 && r.ymax >= 0) { axes += `M${left} ${py(0)}H${left + w}`; }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="white"/><g fill="black">${grid}<text x="${width - 20}" y="${height - 30}" font-size="22">x</text><text x="25" y="25" font-size="22">y</text></g><path d="${axes}" fill="none" stroke="black" stroke-width="2"/><rect x="${left}" y="${top}" width="${w}" height="${h}" fill="none" stroke="black"/><path d="${paths}" fill="none" stroke="black" stroke-width="3"/></svg>`;
}
