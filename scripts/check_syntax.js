const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
const js = src.match(/<script>([\s\S]*?)<\/script>/)[1];
try { new Function(js); console.log('JS syntax OK'); }
catch (e) { console.error('Syntax error:', e.message); process.exit(1); }
