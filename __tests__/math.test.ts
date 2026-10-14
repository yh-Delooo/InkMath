import {compileExpression, latexToExpression, plotSvg} from '../src/math';
import {renderEquation} from '../src/render';
import {newestFirst} from '../src/history';


describe('safe numerical grammar', () => {
  test.each([
    ['-x^2', 3, -9], ['2^3^2', 0, 512], ['2^-2', 0, 0.25],
    ['2x+3(x+1)', 2, 13], ['sin(pi/2)', 0, 1], ['sqrt(x)', -1, NaN],
    ['1/(1+exp(-x))', 0, 0.5], ['ln(e)', 0, 1], ['1e-3*x', 2, 0.002],
  ])('%s', (s, x, expected) => { const result = compileExpression(s as string)(x as number);
    if (Number.isNaN(expected)) { expect(result).toBeNaN(); } else { expect(result).toBeCloseTo(expected as number); }
  });
  test.each(['x.constructor', 'process.exit()', 'x=2', 'sin x', 'z+1', 'x;', 'x+', '((x)', '1e999', '__proto__(x)'])('rejects %s', s => expect(() => compileExpression(s)).toThrow());
  test('nested LaTeX fractions retain semantics', () => expect(compileExpression(latexToExpression('y=\\frac{1}{\\frac{x+1}{2}}'))(3)).toBe(0.5));
  test('braces, roots and delimiters', () => expect(compileExpression(latexToExpression('\\[f(x)=\\sqrt{x^{2}+1}\\]'))(0)).toBe(1));
  test.each(['x^2+y^2=1', '\\int x dx', '\\frac{1}', 'y=x^{2', 'a=x', 'y=\\sin^2(x)'])('refuses ambiguous conversion %s', s => expect(() => latexToExpression(s)).toThrow());
  test('1/x has separate branches', () => {
    const svg = plotSvg('1/x', {xmin: -5, xmax: 5, ymin: -5, ymax: 5});
    const curve = svg.match(/<path d="([^"]+)" fill="none" stroke="black" stroke-width="3"/)!;
    expect(curve[1].match(/M/g)?.length).toBeGreaterThanOrEqual(2);
    expect(svg).not.toMatch(/NaN|Infinity/);
  });
  test('rejects reversed ranges and invisible functions', () => {
    expect(() => plotSvg('x', {xmin: 5, xmax: -5, ymin: -5, ymax: 5})).toThrow();
    expect(() => plotSvg('sqrt(-1)', {xmin: -5, xmax: 5, ymin: -5, ymax: 5})).toThrow();
  });
});
describe('MathJax local rendering', () => {
  test.each(['y=\\frac{x^{2}+1}{2}', '\\sqrt{x}', '\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}', '\\sum_{i=1}^n i'])('renders %s', s => {
    const result = renderEquation(s); expect(result.svg).toContain('<path'); expect(result.aspect).toBeGreaterThan(0);
    expect(result.svg).not.toContain('currentColor'); expect(result.svg).not.toContain('<use');
  });
  test('invalid LaTeX is an error, not an inserted error image', () => expect(() => renderEquation('\\notacommand{x}')).toThrow());
});
describe('manual formula selection order', () => {
  const r = {id: 'old', latex: 'y=x^2', hash: 'abc', path: '/p', created: 1};
  test('newest record is first even for older unordered history', () => {
    const records = [r, {...r, id: 'new', created: 3}, {...r, id: 'middle', created: 2}];
    expect(newestFirst(records).map(v => v.id)).toEqual(['new', 'middle', 'old']);
    expect(records[0].id).toBe('old');
  });
  test('empty history remains empty', () => expect(newestFirst([])).toEqual([]));
});

import {gridTicks, plotLayout} from '../src/math';
describe('fixed square grid and cropped ranges', () => {
  test('asymmetric -1 to 5 range has integer ticks', () => {
    expect(gridTicks(-1, 5, 1)).toEqual([-1, 0, 1, 2, 3, 4, 5]);
    const svg = plotSvg('x', {xmin: -2, xmax: 2, ymin: -1, ymax: 5});
    for (const n of [-1, 0, 1, 2, 3, 4, 5]) { expect(svg).toContain(`>${n}</text>`); }
  });
  test('crop changes dimensions without changing scale or stretching either axis', () => {
    const a = plotLayout({xmin: -5, xmax: 5, ymin: -5, ymax: 5});
    const b = plotLayout({xmin: -5, xmax: 5, ymin: -1, ymax: 5});
    expect(a.scale).toBe(b.scale);
    expect(b.w / 10).toBe(b.h / 6);
    expect(a.w).toBe(b.w); expect(a.h - b.h).toBe(240);
  });
  test('fractional unit stays anchored at zero and excludes partial edge ticks', () => {
    expect(gridTicks(-0.7, 1.1, 0.5)).toEqual([-0.5, 0, 0.5, 1]);
    expect(gridTicks(-0.3, 0.3, 0.1)).toEqual([-0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3]);
    const l = plotLayout({xmin: -1, xmax: 1, ymin: -1, ymax: 5}, 0.5);
    expect(l.scale * 0.5).toBe(60);
  });
  test.each([0, -1, NaN, Infinity, 0.00001])('rejects invalid or excessive unit %s', unit => {
    expect(() => plotSvg('x', {xmin: -5, xmax: 5, ymin: -1, ymax: 5}, unit)).toThrow();
  });
  test('SVG canvas tracks the crop instead of fixed landscape dimensions', () => {
    const r = {xmin: -2, xmax: 2, ymin: -1, ymax: 5}, l = plotLayout(r);
    expect(plotSvg('x', r)).toContain(`viewBox="0 0 ${l.width} ${l.height}"`);
  });
});
