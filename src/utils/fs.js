import fs from 'fs';
export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}
