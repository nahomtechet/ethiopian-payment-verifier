const fs = require('fs');
const path = require('path');

const parsersDir = path.join(__dirname, '../src/parsers');
const files = fs.readdirSync(parsersDir).filter(f => f.endsWith('.ts') && !['base.ts', 'cbe.ts', 'telebirr.ts', 'dashen.ts', 'boa.ts', 'mpesa.ts', 'awash.ts', 'ebirr.ts', 'zemen.ts'].includes(f));

for (const file of files) {
  const filePath = path.join(parsersDir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  content = content.replace(/input\.trim\(\)/g, "(payload.reference || payload.url || 'UNKNOWN').trim()");

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Fixed ${file}`);
}
