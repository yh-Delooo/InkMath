import {mathjax} from 'mathjax-full/js/mathjax';
import {TeX} from 'mathjax-full/js/input/tex';
import {SVG} from 'mathjax-full/js/output/svg';
import {liteAdaptor} from 'mathjax-full/js/adaptors/liteAdaptor';
import {RegisterHTMLHandler} from 'mathjax-full/js/handlers/html';
import 'mathjax-full/js/input/tex/base/BaseConfiguration';
import 'mathjax-full/js/input/tex/ams/AmsConfiguration';
import {stripMath} from './math';

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const tex = new TeX({packages: ['base', 'ams'], maxBuffer: 6000, maxMacros: 1000,
  formatError: (_jax: unknown, err: Error) => { throw err; }});
const document = mathjax.document('', {InputJax: tex, OutputJax: new SVG({fontCache: 'none'})});
export function renderEquation(source: string): {svg: string; aspect: number} {
  const latex = stripMath(source);
  if (!latex || latex.length > 2000) { throw new Error('请输入 LaTeX（最多 2000 字符）。'); }
  const result = document.convert(latex, {display: true});
  const svgNode = adaptor.firstChild(result);
  let svg = adaptor.outerHTML(svgNode as any);
  if (svg.includes('data-mml-node="merror"')) { throw new Error('LaTeX 排版失败，请检查公式。'); }
  const box = /viewBox="([^"]+)"/.exec(svg)?.[1].split(/\s+/).map(Number);
  if (!box || box.length !== 4 || !(box[2] > 0 && box[3] > 0)) { throw new Error('无法计算公式尺寸。'); }
  box[0] -= 80; box[1] -= 80; box[2] += 160; box[3] += 160;
  svg = svg.replace(/currentColor/g, '#000').replace(/<svg[^>]*>/,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.join(' ')}" width="100%" height="100%">`);
  return {svg, aspect: box[2] / box[3]};
}
