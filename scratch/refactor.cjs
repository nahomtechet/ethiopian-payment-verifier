const fs = require('fs');
const path = require('path');

const parsersDir = path.join(__dirname, '../src/parsers');
const files = fs.readdirSync(parsersDir).filter(f => f.endsWith('.ts') && !['base.ts', 'cbe.ts', 'telebirr.ts', 'dashen.ts', 'boa.ts', 'mpesa.ts', 'awash.ts', 'ebirr.ts', 'zemen.ts'].includes(f));

for (const file of files) {
  const filePath = path.join(parsersDir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  // Fix imports
  content = content.replace(/ParseResult,\s*/g, '');
  content = content.replace(/import \{.*?\} from '\.\.\/types\.js';/s, (match) => {
      if (!match.includes('VerificationPayload')) {
          return match.replace("VerificationResult", "VerificationPayload, VerificationResult");
      }
      return match;
  });

  // Remove parseSMS
  content = content.replace(/\s*parseSMS\(.*?\):.*?\{[\s\S]*?\}\s*async verifyOnline/s, '\n\n  async verifyOnline');

  // Change verifyOnline signature
  content = content.replace(/async verifyOnline\(input: string,/g, 'async verifyOnline(payload: VerificationPayload,');
  
  // Replace references to input in verifyOnline body with payload.reference
  content = content.replace(/const clean = input\.trim\(\);/g, 'const clean = payload.reference?.trim() || "";');
  content = content.replace(/const clean = sanitizeInput\(input\);/g, 'const clean = payload.reference?.trim() || "";');

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Refactored ${file}`);
}
