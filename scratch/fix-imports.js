import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

function processDirectory(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDirectory(fullPath);
    } else if (fullPath.endsWith('.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      
      // Replace import/export { ... } from './path' with './path.js'
      content = content.replace(/(import|export)\s+([\s\S]*?)\s+from\s+(['"])(\.\/|\.\.\/)(.*?)(['"])/g, (match, impExp, vars, q1, prefix, pth, q2) => {
        if (!pth.endsWith('.js') && !pth.endsWith('.json')) {
          return `${impExp} ${vars} from ${q1}${prefix}${pth}.js${q2}`;
        }
        return match;
      });

      // Also replace simple import './path'
      content = content.replace(/import\s+(['"])(\.\/|\.\.\/)(.*?)(['"])/g, (match, q1, prefix, pth, q2) => {
        if (!pth.endsWith('.js') && !pth.endsWith('.json')) {
          return `import ${q1}${prefix}${pth}.js${q2}`;
        }
        return match;
      });
      
      fs.writeFileSync(fullPath, content);
    }
  }
}

processDirectory('a:/qr-menu-et/payment-recept-verify/src');
console.log('Fixed relative imports');
