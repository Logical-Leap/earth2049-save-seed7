/*
 * Prepare a minimal Cloudflare Pages upload directory.
 * This is intentionally not a game build/bundler: it only copies the static
 * runtime files Pages needs, and excludes Worker source, git metadata, scripts,
 * package files, docs, source concept art, and unreferenced texture studies that
 * do not need to be served to players.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const out = path.join(root, 'dist-pages');
const entries = [
  'index.html',
  '_headers',
  'js',
  'lib',
  'assets/data',
  'assets/models',
  'assets/scenes',
  'assets/levels',
  'assets/textures/rebel-hub-haven-commons-v3-texture-pack',
  'assets/textures/rebel-hub-haven-commons-final'
];

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) copyRecursive(path.join(src, name), path.join(dest, name));
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const entry of entries) {
  const src = path.join(root, entry);
  if (fs.existsSync(src)) copyRecursive(src, path.join(out, entry));
}
console.log(`Prepared Cloudflare Pages static runtime in ${path.relative(root, out)}`);
