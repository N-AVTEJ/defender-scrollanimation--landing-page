import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const copies = [
  {
    src: path.join(rootDir, 'node_modules', 'three', 'examples', 'jsm', 'libs', 'draco', 'gltf'),
    dest: path.join(rootDir, 'public', 'draco'),
    extensions: ['.js', '.wasm'],
  },
  {
    src: path.join(rootDir, 'node_modules', 'three', 'examples', 'jsm', 'libs', 'basis'),
    dest: path.join(rootDir, 'public', 'basis'),
    extensions: ['.js', '.wasm'],
  },
];

for (const { src, dest, extensions } of copies) {
  if (!existsSync(src)) {
    console.warn(`[copy-decoders] Source directory not found (skipping): ${src}`);
    continue;
  }
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (!extensions.some((ext) => entry.name.endsWith(ext))) continue;
    cpSync(path.join(src, entry.name), path.join(dest, entry.name), { force: true });
  }
}
