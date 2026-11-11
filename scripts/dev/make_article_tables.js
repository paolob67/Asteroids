// Builds one .drawio file per table described in a JSON spec, so tables can be exported to PNG
// (LinkedIn articles have no table support).
//
// Usage: node scripts/dev/make_article_tables.js docs/articles/linkedin/tables.json docs/diagrams
//
// Spec: [{ id, width?, header: [..], rows: [[..], ..] }]
// Cell text supports **bold**, `code` and \n for a line break.
const fs = require('fs');
const path = require('path');

const [specFile, outDir] = process.argv.slice(2);
if (!specFile || !outDir) {
  console.error('Usage: node make_article_tables.js <tables.json> <outDir>');
  process.exit(1);
}

const FONT = 14;
const CHAR_W = 7.9;          // estimated average character width at 14 px, with margin for word wrapping
const LINE_H = 19;
const PAD_Y = 16;
const PAD_X = 20;

const plain = s => s.replace(/\*\*/g, '').replace(/`/g, '');
const attr = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const html = s => {
  const e = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return e
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/`(.+?)`/g, '<font face="Courier New" style="font-size:13px">$1</font>')
    .replace(/\n/g, '<br>');
};

function build(spec) {
  const W = spec.width || 840;
  const cols = spec.header.length;
  const all = [spec.header, ...spec.rows];
  const maxLen = Array.from({ length: cols }, (_, c) =>
    Math.max(...all.map(r => Math.max(...plain(r[c] || '').split('\n').map(l => l.length)))));
  const longestWord = Array.from({ length: cols }, (_, c) =>
    Math.max(...all.map(r => Math.max(...plain(r[c] || '').split(/\s+/).map(w => w.length)))));
  const weight = maxLen.map(n => Math.min(Math.max(n, 6), 70) + 8);
  const wsum = weight.reduce((a, b) => a + b, 0);
  const widths = weight.map((w, c) => Math.round(Math.max(W * w / wsum, longestWord[c] * CHAR_W + PAD_X)));
  const total = widths.reduce((a, b) => a + b, 0);
  const align = Array.from({ length: cols }, (_, c) => (c > 0 && maxLen[c] <= 24 ? 'center' : 'left'));

  const rowHeight = r => {
    const lines = Math.max(...r.map((cell, c) => {
      const usable = Math.max(widths[c] - PAD_X, 20);
      return plain(cell || '').split('\n').reduce((n, para) => n + Math.max(1, Math.ceil(para.length * CHAR_W / usable)), 0);
    }));
    return lines * LINE_H + PAD_Y;
  };

  const cells = [];
  let y = 20, id = 2;
  all.forEach((r, ri) => {
    const h = rowHeight(r);
    let x = 20;
    r.forEach((cell, c) => {
      const header = ri === 0;
      const fill = header ? '#dae8fc' : (ri % 2 === 0 ? '#f7f8fa' : '#ffffff');
      const stroke = header ? '#6c8ebf' : '#c9d1d9';
      const style = `rounded=0;whiteSpace=wrap;html=1;align=${header ? 'center' : align[c]};verticalAlign=middle;` +
        `spacingLeft=8;spacingRight=8;fillColor=${fill};strokeColor=${stroke};fontSize=${FONT};fontColor=#1f2328;` +
        (header ? 'fontStyle=1;' : '');
      cells.push(`        <mxCell id="c${id++}" value="${attr(html(cell || ''))}" style="${style}" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="${widths[c]}" height="${h}" as="geometry"/></mxCell>`);
      x += widths[c];
    });
    y += h;
  });

  return `<mxfile host="app.diagrams.net">
  <diagram id="${spec.id}" name="${attr(spec.id)}">
    <mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${total + 40}" pageHeight="${y + 20}" math="0" shadow="0">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
${cells.join('\n')}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
`;
}

const specs = JSON.parse(fs.readFileSync(specFile, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });
for (const spec of specs) {
  const out = path.join(outDir, `${spec.id}.drawio`);
  fs.writeFileSync(out, build(spec));
  console.log(out);
}
