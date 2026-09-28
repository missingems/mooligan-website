#!/usr/bin/env node
// Brings a release kit into the site, and says what the instructions need as a result.
//
//   npm run import-kit -- <release kit folder>   validate the kit, copy its captures for the site’s
//                                                device into media/, and print a work order
//   npm run import-kit -- --prune                drop media no task uses (run before committing)
//
// The work order maps the kit onto the page through each task’s `feature:` front matter:
// which tasks to revise, which features have no task yet, which drawings could become
// captures. It is written for the article writer (see .claude/skills/write-edition).

import { readFile, readdir, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { validateKit } from './validate-kit.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const MEDIA = path.join(ROOT, 'media');
const MANIFEST = path.join(MEDIA, 'manifest.json');

// Every task, with its feature and the figures it uses.
async function tasks() {
  const out = [];
  const dir = path.join(ROOT, 'content/tasks');
  for (const name of (await readdir(dir)).filter(f => /^\d+-.*\.md$/.test(f)).sort((a, b) => parseInt(a, 10) - parseInt(b, 10))) {
    const file = path.join(dir, name);
    const src = await readFile(file, 'utf8');
    const fm = src.match(/^---\n([\s\S]*?)\n---/);
    const data = fm ? YAML.parse(fm[1]) ?? {} : {};
    out.push({
      file: path.relative(ROOT, file),
      title: data.title,
      feature: data.feature,
      assets: [...src.matchAll(/\]\(asset:([^)\s]+)\)/g)].map(m => m[1]),
      drawings: [...src.matchAll(/\]\(figure:([^)\s]+)\)/g)].map(m => m[1]),
    });
  }
  return out;
}

async function prune() {
  if (!existsSync(MANIFEST)) return console.log('No media/manifest.json; nothing to prune.');
  const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));
  const used = new Set((await tasks()).flatMap(c => c.assets));
  const keep = manifest.assets.filter(a => used.has(a.id));
  for (const a of manifest.assets.filter(a => !used.has(a.id))) {
    for (const f of a.files) for (const p of [f.web, f.poster].filter(Boolean)) await rm(path.join(MEDIA, p), { force: true });
  }
  await removeEmptyDirs(path.join(MEDIA, 'assets'));
  await writeFile(MANIFEST, JSON.stringify({ ...manifest, assets: keep }, null, 2) + '\n');
  console.log(`Kept ${keep.length} of ${manifest.assets.length} assets in media/ (the ones tasks use).`);
}

async function removeEmptyDirs(dir) {
  if (!existsSync(dir)) return;
  for (const e of await readdir(dir, { withFileTypes: true })) if (e.isDirectory()) await removeEmptyDirs(path.join(dir, e.name));
  if (!(await readdir(dir)).length) await rm(dir, { recursive: true });
}

async function importKit(dir) {
  const { errors, warnings, kit } = await validateKit(dir);
  for (const w of warnings) console.warn(`warning  ${w}`);
  if (errors.length) {
    for (const e of errors) console.error(`error  ${e}`);
    console.error(`\nThe kit is not valid (${errors.length} problem${errors.length === 1 ? '' : 's'}); nothing was imported.`);
    process.exit(1);
  }

  const book = YAML.parse(await readFile(path.join(ROOT, 'content/book.yml'), 'utf8'));
  const device = book.figures?.device;
  if (!kit.manifest.devices.some(d => d.id === device)) {
    console.error(`error  the site shows ${device} (content/book.yml › figures.device), which this kit did not capture`);
    process.exit(1);
  }

  // Mirror the kit’s captures for the site’s device into media/.
  await rm(path.join(MEDIA, 'assets'), { recursive: true, force: true });
  await mkdir(MEDIA, { recursive: true });
  const assets = [];
  for (const a of kit.manifest.assets) {
    const files = [];
    for (const f of a.files.filter(f => f.device === device)) {
      for (const p of [f.web, f.poster].filter(Boolean)) {
        await mkdir(path.dirname(path.join(MEDIA, p)), { recursive: true });
        await cp(path.join(dir, p), path.join(MEDIA, p));
      }
      files.push({ device: f.device, appearance: f.appearance, web: f.web, ...(f.poster && { poster: f.poster }), width: f.width, height: f.height });
    }
    assets.push({ id: a.id, feature: a.feature, use_case: a.use_case, capture: a.capture, kind: a.kind, description: a.description, files });
  }
  await writeFile(MANIFEST, JSON.stringify({ kit_version: kit.manifest.kit_version, app: kit.manifest.app, device, assets }, null, 2) + '\n');

  console.log(workOrder(kit, await tasks()));
}

function workOrder(kit, chs) {
  const { manifest, changes, features } = kit;
  const byFeature = new Map();
  for (const c of chs) if (c.feature) (byFeature.get(c.feature) ?? byFeature.set(c.feature, []).get(c.feature)).push(c);
  const list = cs => cs.map(c => `${c.file} (“${c.title}”)`).join(', ');
  const lines = [];
  const section = (title, items) => { if (items.length) lines.push(`\n## ${title}\n`, ...items.map(i => `- ${i}`)); };

  lines.push(`# Work order: Mooligan ${manifest.app.version}`,
    '', `Kit: ${kit.dir}`, `Previous: ${manifest.previous ?? 'none (first kit)'} · build ${manifest.app.build} · commit ${manifest.app.commit} · released ${manifest.app.released}`,
    `Captures for ${manifest.devices.length} device${manifest.devices.length === 1 ? '' : 's'} in the kit; the site’s device copied to media/.`);

  section('Version', [
    `Set app_version: ${manifest.app.version} in content/book.yml. Mark tasks for new features with new: ${manifest.app.version}, and clear older marks.`,
  ]);

  section('New features: need a task', (changes.features.new ?? []).map(id => {
    const f = features.get(id);
    const has = byFeature.get(id);
    return has ? `${id}: already has ${list(has)}; revise it` : `${id} (“${f.title}”): ${f.summary} Give it a task, from its main use case’s flow.`;
  }));

  section('Changed features: revise these tasks', (changes.features.changed ?? []).map(c => {
    const has = byFeature.get(c.id);
    const where = has ? list(has) : 'no task yet: give it one';
    return `${c.id}: ${c.summary}${c.use_cases?.length ? ` (use cases: ${c.use_cases.join(', ')})` : ''}. ${where}`;
  }));

  section('Removed features: take out or rewrite', (changes.features.removed ?? []).map(r => {
    const has = byFeature.get(r.id);
    return `${r.id}: ${r.summary}${has ? ` ${list(has)}` : ' (no task)'}`;
  }));

  const usedAssets = new Map();
  for (const c of chs) for (const a of c.assets) (usedAssets.get(a) ?? usedAssets.set(a, []).get(a)).push(c);
  section('Changed captures: check their captions still match', (changes.assets.changed ?? [])
    .filter(c => usedAssets.has(c.id))
    .map(c => `${c.id} (${Math.round(c.difference * 100)}% of pixels): ${list(usedAssets.get(c.id))}`));

  const gone = new Set(manifest.assets.map(a => a.id));
  section('Figures that point at captures no longer in the kit', [...usedAssets]
    .filter(([id]) => !gone.has(id)).map(([id, cs]) => `${id}: ${list(cs)}`));

  section('Drawings that could become captures', chs
    .filter(c => c.drawings.length && manifest.assets.some(a => a.feature === c.feature))
    .map(c => `${c.file}: draws ${c.drawings.join(', ')}; the kit has ${manifest.assets.filter(a => a.feature === c.feature).map(a => a.id).join(', ')}`));

  section('Tasks whose feature is not in the kit’s catalogue', chs
    .filter(c => c.feature && !features.has(c.feature) && !(changes.features.removed ?? []).some(r => r.id === c.feature))
    .map(c => `${c.file}: feature “${c.feature}”. Check the id, or whether the feature is gone.`));

  section('Features with no task', [...features.keys()]
    .filter(id => !byFeature.has(id) && !(changes.features.new ?? []).includes(id))
    .map(id => `${id} (“${features.get(id).title}”)`));

  lines.push('', 'Then: npm run import-kit -- --prune && npm run build && npm run check');
  return lines.join('\n');
}

const arg = process.argv[2];
if (arg === '--prune') await prune();
else if (arg) await importKit(path.resolve(arg));
else {
  console.error('usage: npm run import-kit -- <release kit folder>\n       npm run import-kit -- --prune');
  process.exit(2);
}
