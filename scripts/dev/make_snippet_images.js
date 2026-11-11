// Renders the code snippets of the LinkedIn articles as PNG images (LinkedIn articles have no code blocks).
// Style: Carbon Gray 100 theme, IBM Plex Mono. No dependencies except a local Google Chrome.
//
// Usage: node scripts/dev/make_snippet_images.js docs/articles/linkedin/snippets.json docs/diagrams
//
// Spec: [{ id, title, lang: "javascript" | "assembly", code, alt, label? }]
// Output: <outDir>/snippet-<id>.png
// Any edit to a snippet in an article must be made in snippets.json and re-exported.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const [specFile, outDir] = process.argv.slice(2);
if (!specFile || !outDir) {
  console.error('Usage: node make_snippet_images.js <snippets.json> <outDir>');
  process.exit(1);
}
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// Carbon Gray 100 palette
const C = {
  bg: '#161616', bar: '#262626', border: '#393939', text: '#f4f4f4', muted: '#a8a8a8',
  comment: '#8d8d8d', keyword: '#be95ff', string: '#42be65', number: '#33b1ff', punct: '#c6c6c6', fn: '#78a9ff',
};
const FONT = 15, LINE_H = 24, CHAR_W = 9, PAD_X = 28, PAD_Y = 22, BAR_H = 40;

const KEYWORDS = new Set(['function', 'let', 'const', 'var', 'if', 'else', 'return', 'true', 'false', 'null', 'new', 'for', 'while']);
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const span = (cls, s) => `<span style="color:${C[cls]}">${esc(s)}</span>`;

function highlightJs(line) {
  // A line that is only a comment, or the code part followed by a trailing comment
  const re = /(\/\/.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(\b0x[0-9a-fA-F]+\b|\b\d[\d_]*(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)(\s*\()?|(->)|(.)/g;
  let out = '', m;
  while ((m = re.exec(line)) !== null) {
    if (m[1]) out += span('comment', m[1]);
    else if (m[2]) out += span('string', m[2]);
    else if (m[3]) out += span('number', m[3]);
    else if (m[4]) {
      if (KEYWORDS.has(m[4])) out += span('keyword', m[4]) + esc(m[5] || '');
      else if (m[5]) out += span('fn', m[4]) + esc(m[5]);
      else out += esc(m[4]);
    } else if (m[6]) out += span('keyword', m[6]);
    else out += span('punct', m[7]);
  }
  return out;
}

function highlightAsm(line) {
  const i = line.indexOf(';');
  const code = i >= 0 ? line.slice(0, i) : line;
  const com = i >= 0 ? line.slice(i) : '';
  const body = esc(code).replace(/^(\s*)([A-Z]+:)?(\s*)([A-Z]{3})\b/, (_, a, lab, b, op) =>
    `${a}${lab ? `<span style="color:${C.fn}">${lab}</span>` : ''}${b}<span style="color:${C.keyword}">${op}</span>`);
  return body + (com ? span('comment', com) : '');
}

function render(spec) {
  const lines = spec.code.split('\n');
  const hl = spec.lang === 'assembly' ? highlightAsm : highlightJs;
  const longest = Math.max(...lines.map(l => l.length));
  const width = Math.max(560, Math.ceil(longest * CHAR_W + 2 * PAD_X));
  const height = BAR_H + lines.length * LINE_H + 2 * PAD_Y;
  const label = spec.label || (spec.lang === 'assembly' ? '6502 assembly' : 'JavaScript');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;background:${C.bg};}
.card{width:${width}px;height:${height}px;background:${C.bg};font-family:'IBM Plex Mono',Menlo,monospace;overflow:hidden;box-sizing:border-box;border:1px solid ${C.border};}
.bar{height:${BAR_H}px;background:${C.bar};border-bottom:1px solid ${C.border};display:flex;justify-content:space-between;align-items:center;padding:0 ${PAD_X}px;font-family:'IBM Plex Sans',Helvetica,Arial,sans-serif;font-size:13px;color:${C.muted};}
.bar b{color:${C.text};font-weight:600;}
pre{margin:0;padding:${PAD_Y}px ${PAD_X}px;font-family:'IBM Plex Mono',Menlo,monospace;font-size:${FONT}px;line-height:${LINE_H}px;color:${C.text};white-space:pre;}
</style></head><body><div class="card"><div class="bar"><b>${esc(spec.title)}</b><span>${label}</span></div><pre>${lines.map(hl).join('\n')}</pre></div></body></html>`;
  return { html, width, height };
}

const specs = JSON.parse(fs.readFileSync(specFile, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'snip-'));
for (const spec of specs) {
  const { html, width, height } = render(spec);
  const htmlFile = path.join(tmp, spec.id + '.html');
  const png = path.resolve(outDir, `snippet-${spec.id}.png`);
  fs.writeFileSync(htmlFile, html);
  execFileSync(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=2',
    `--window-size=${width},${height}`, `--screenshot=${png}`, 'file://' + htmlFile,
  ], { stdio: 'ignore' });
  console.log(`snippet-${spec.id}.png  ${width}x${height}`);
}
fs.rmSync(tmp, { recursive: true, force: true });
