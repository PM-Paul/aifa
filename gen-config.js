// Generates config.js from .env for the local browser demo.
// Run once after cloning: node gen-config.js
// config.js is .gitignored — never commit it.
import 'dotenv/config';
import { writeFileSync } from 'fs';

const anthropicKey = process.env.ANTHROPIC_API_KEY ?? '';
const gcpKey       = process.env.GCP_API_KEY ?? '';

if (!anthropicKey) {
  console.error('Warning: ANTHROPIC_API_KEY not found in .env');
}
if (!gcpKey) {
  console.warn('Warning: GCP_API_KEY not found in .env — GCP pricing will show N/A in the UI');
}

writeFileSync('config.js',
  `// Auto-generated from .env — do not commit (see .gitignore)\n` +
  `window.AIFA_ANTHROPIC_KEY = "${anthropicKey}";\n` +
  `window.AIFA_GCP_KEY = "${gcpKey}";\n`
);

console.log('config.js written — open index.html in your browser.');
