// Development-only rendering QA. This is not the Android renderer.
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true},
}).outputText, filename);
const {renderEquation} = require('../src/render.ts');
const {plotSvg} = require('../src/math.ts');
const {Resvg} = require('@resvg/resvg-js');
const dir = path.resolve(__dirname, '../preview'); fs.mkdirSync(dir, {recursive: true});
fs.writeFileSync(path.resolve(__dirname, '../assets/math.png'), new Resvg(fs.readFileSync(path.resolve(__dirname, '../assets/math.svg'))).render().asPng());
const equation = renderEquation('y=\\frac{x^{2}+1}{2}');
const matrix = renderEquation('A=\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}');
for (const [name, source] of [
  ['equation', equation.svg.replace('width="100%" height="100%"', `width="600" height="${600 / equation.aspect}"`)],
  ['matrix', matrix.svg.replace('width="100%" height="100%"', `width="600" height="${600 / matrix.aspect}"`)],
  ['plot', plotSvg('(x^2+1)/2', {xmin: -5, xmax: 5, ymin: -2, ymax: 12})],
  ['unit-grid', plotSvg('x^2', {xmin: -3, xmax: 3, ymin: -1, ymax: 5}, 1)],
  ['pole', plotSvg('1/x', {xmin: -5, xmax: 5, ymin: -5, ymax: 5})],
]) {
  fs.writeFileSync(path.join(dir, name + '.svg'), source);
  fs.writeFileSync(path.join(dir, name + '.png'), new Resvg(source, {background: 'white'}).render().asPng());
}
console.log('Wrote 5 SVG and PNG previews to', dir);
