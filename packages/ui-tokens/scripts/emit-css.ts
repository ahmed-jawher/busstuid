import { mkdirSync, writeFileSync } from 'node:fs';
import { buildTokensCss } from '../src/index';

mkdirSync('dist', { recursive: true });
writeFileSync('dist/tokens.css', buildTokensCss());
console.log('✓ dist/tokens.css written');
