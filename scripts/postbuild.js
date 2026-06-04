#!/usr/bin/env node
// Patches crxjs build output to fix two bugs:
// 1. service-worker-loader.js imports the content script chunk instead of the background chunk
// 2. web_accessible_resources has use_dynamic_url fields and overly-restrictive match patterns
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dist = resolve(__dirname, '../dist');

// --- Fix 1: manifest.json ---
const manifestPath = resolve(dist, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

manifest.web_accessible_resources = [
  {
    matches: ['https://leetcode.com/*'],
    resources: ['page-script.js'],
  },
];

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log('[postbuild] manifest.json: web_accessible_resources patched');

// --- Fix 2: service-worker-loader.js ---
// Background chunk is an ES module (imports); content script chunk is an IIFE.
const assets = readdirSync(resolve(dist, 'assets'));
const indexChunks = assets.filter(f => /^index\.ts-.+\.js$/.test(f));

const bgChunk = indexChunks.find(f => {
  const src = readFileSync(resolve(dist, 'assets', f), 'utf8');
  return !src.trimStart().startsWith('(function(');
});

if (!bgChunk) {
  console.error('[postbuild] ERROR: could not identify background chunk — aborting');
  process.exit(1);
}

writeFileSync(resolve(dist, 'service-worker-loader.js'), `import './assets/${bgChunk}';\n`);
console.log(`[postbuild] service-worker-loader.js: now imports ./assets/${bgChunk}`);
