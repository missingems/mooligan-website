#!/usr/bin/env node
// Checks the built site in dist/: valid HTML, every in-page link lands, no id is used twice.
// Run after `npm run build`; CI runs both on every pull request.

import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { HtmlValidate, FileSystemConfigLoader } from 'html-validate';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');
const problems = [];

if (!existsSync(path.join(DIST, 'index.html'))) {
  console.error('error  dist/index.html is missing; run `npm run build` first');
  process.exit(1);
}

const pages = (await readdir(DIST)).filter(f => f.endsWith('.html'));
const validator = new HtmlValidate(new FileSystemConfigLoader());

for (const name of pages) {
  const file = path.join(DIST, name);
  const html = await readFile(file, 'utf8');

  const report = await validator.validateString(html, file);
  for (const result of report.results) {
    for (const m of result.messages) problems.push(`dist/${name}:${m.line}:${m.column}  ${m.message} (${m.ruleId})`);
  }

  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) problems.push(`dist/${name}  id “${id}” is used more than once`);
    seen.add(id);
  }
  for (const [, target] of html.matchAll(/\shref="#([^"]*)"/g)) {
    if (target && !seen.has(target)) problems.push(`dist/${name}  link to “#${target}” has nowhere to land`);
  }
  for (const [, src] of html.matchAll(/\s(?:src|srcset|poster)="(media\/[^"]+)"/g)) {
    if (!existsSync(path.join(DIST, src))) problems.push(`dist/${name}  missing file ${src}`);
  }
}

for (const p of problems) console.error(`error  ${p}`);
if (problems.length) process.exit(1);
console.log(`Checked ${pages.length} pages in dist/: no problems.`);
