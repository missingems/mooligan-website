#!/usr/bin/env node
// Checks a release kit against docs/release-kit.md: the schemas, and every reference between
// its files (features ↔ assets ↔ changes ↔ release notes ↔ files on disk).
//
//   npm run validate-kit -- path/to/release-kit-1.4.0
//
// Also imported by scripts/import-kit.mjs.

import { readFile, readdir } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import YAML from 'yaml';

const ROOT = path.resolve(import.meta.dirname, '..');
const SCHEMAS = path.join(ROOT, 'schemas/release-kit');
export const KIT_VERSION = 1;

const WEB_MAX_BYTES = { screenshot: 400 * 1024, video: 3 * 1024 * 1024 };
const NOTE_SECTIONS = ['New', 'Improved', 'Fixed'];

async function schema(name) {
  return JSON.parse(await readFile(path.join(SCHEMAS, name), 'utf8'));
}

function frontMatter(src) {
  const m = src.match(/^---\n([\s\S]*?)\n---\n?/);
  return m ? { data: YAML.parse(m[1]) ?? {}, body: src.slice(m[0].length) } : { data: null, body: src };
}

const describe = errors => errors.map(e => `${e.instancePath || '(top)'} ${e.message}${
  e.params?.additionalProperty ? `: “${e.params.additionalProperty}”` : ''}${
  e.params?.allowedValues ? ` (${e.params.allowedValues.join(', ')})` : ''}`);

export async function validateKit(dir) {
  const errors = [];
  const warnings = [];
  const err = (file, msg) => errors.push(`${file}: ${msg}`);
  const kit = { dir, features: new Map() };

  for (const required of ['manifest.json', 'changes.json', 'release-notes.md', 'features']) {
    if (!existsSync(path.join(dir, required))) err(required, 'missing');
  }
  if (errors.length) return { errors, warnings, kit };

  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const check = async (file, schemaName, value) => {
    const validate = ajv.compile(await schema(schemaName));
    if (!validate(value)) for (const d of describe(validate.errors)) err(file, d);
  };

  // manifest.json
  let manifest;
  try { manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8')); }
  catch (e) { err('manifest.json', e.message); return { errors, warnings, kit }; }
  if (manifest.kit_version !== KIT_VERSION) {
    err('manifest.json', `kit_version ${manifest.kit_version} is not one this site understands (${KIT_VERSION})`);
    return { errors, warnings, kit };
  }
  await check('manifest.json', 'manifest.schema.json', manifest);
  kit.manifest = manifest;

  // changes.json
  let changes;
  try { changes = JSON.parse(await readFile(path.join(dir, 'changes.json'), 'utf8')); }
  catch (e) { err('changes.json', e.message); }
  if (changes) await check('changes.json', 'changes.schema.json', changes);
  kit.changes = changes;

  // features/*.md
  const featureSchema = await schema('feature.schema.json');
  for (const name of (await readdir(path.join(dir, 'features'))).filter(f => f.endsWith('.md')).sort()) {
    const file = `features/${name}`;
    const { data, body } = frontMatter(await readFile(path.join(dir, file), 'utf8'));
    if (!data) { err(file, 'no front matter'); continue; }
    const validate = ajv.compile(featureSchema);
    if (!validate(data)) { for (const d of describe(validate.errors)) err(file, d); continue; }
    if (`${data.id}.md` !== name) err(file, `id “${data.id}” does not match the file name`);
    if (!body.trim()) err(file, 'needs a description after the front matter');
    const ids = data.use_cases.map(u => u.id);
    for (const dup of ids.filter((id, i) => ids.indexOf(id) !== i)) err(file, `use case “${dup}” appears twice`);
    kit.features.set(data.id, { ...data, description: body.trim(), file });
  }
  if (!kit.features.size) err('features', 'the catalogue is empty');

  // Every capture a flow names is an asset, and every asset belongs to a flow.
  const assets = new Map((manifest.assets ?? []).map(a => [a.id, a]));
  const named = new Set();
  for (const f of kit.features.values()) {
    for (const u of f.use_cases) {
      const captures = [...u.flow.map(s => s.capture).filter(Boolean), u.video].filter(Boolean);
      for (const c of captures) {
        const id = `${f.id}/${u.id}/${c}`;
        named.add(id);
        const asset = assets.get(id);
        if (!asset) err(f.file, `use case “${u.id}” names capture “${c}”, but there is no asset “${id}” in manifest.json`);
        else if (c === u.video && asset.kind !== 'video') err('manifest.json', `“${id}” is a flow’s video, so its kind must be “video”`);
      }
    }
  }

  const devices = new Set((manifest.devices ?? []).map(d => d.id));
  const appearances = manifest.appearances ?? [];
  for (const a of manifest.assets ?? []) {
    const where = `manifest.json › ${a.id}`;
    if (a.id !== `${a.feature}/${a.use_case}/${a.capture}`) err(where, 'id must be “feature/use_case/capture”');
    if (!kit.features.has(a.feature)) err(where, `feature “${a.feature}” is not in features/`);
    else if (!kit.features.get(a.feature).use_cases.some(u => u.id === a.use_case)) err(where, `feature “${a.feature}” has no use case “${a.use_case}”`);
    if (!named.has(a.id)) warnings.push(`${where}: no flow step names this capture`);
    for (const d of devices) for (const ap of appearances) {
      if (!a.files?.some(f => f.device === d && f.appearance === ap)) err(where, `no file for ${d}, ${ap}`);
    }
    for (const f of a.files ?? []) {
      if (!devices.has(f.device)) err(where, `device “${f.device}” is not listed in devices`);
      if (!appearances.includes(f.appearance)) err(where, `appearance “${f.appearance}” is not listed in appearances`);
      if (a.kind === 'video' && !f.poster) err(where, `${f.device}, ${f.appearance}: a video needs a poster`);
      for (const key of ['framed', 'web', 'raw', 'poster']) {
        if (!f[key]) continue;
        const p = path.join(dir, f[key]);
        if (!existsSync(p)) { err(where, `missing file ${f[key]}`); continue; }
        const ext = path.extname(f[key]);
        const wanted = a.kind === 'video' && key !== 'poster' && key !== 'raw' ? '.mp4' : '.png';
        if (ext !== wanted && !(a.kind === 'video' && key === 'raw' && ext === '.mp4')) err(where, `${key} should be a ${wanted} file, not ${f[key]}`);
        if (key === 'web' && statSync(p).size > WEB_MAX_BYTES[a.kind]) err(where, `${f[key]} is larger than ${WEB_MAX_BYTES[a.kind] / 1024} KB`);
      }
    }
  }

  // changes.json refers to real things.
  if (changes) {
    if (changes.to !== manifest.app?.version) err('changes.json', `“to” is ${changes.to}, but the app version is ${manifest.app?.version}`);
    if ((changes.from ?? null) !== (manifest.previous ?? null)) err('changes.json', `“from” is ${changes.from}, but manifest “previous” is ${manifest.previous ?? null}`);
    for (const id of changes.features?.new ?? []) if (!kit.features.has(id)) err('changes.json', `new feature “${id}” is not in features/`);
    for (const c of changes.features?.changed ?? []) {
      const f = kit.features.get(c.id);
      if (!f) { err('changes.json', `changed feature “${c.id}” is not in features/`); continue; }
      for (const u of c.use_cases ?? []) if (!f.use_cases.some(x => x.id === u)) err('changes.json', `“${c.id}” has no use case “${u}”`);
    }
    for (const r of changes.features?.removed ?? []) if (kit.features.has(r.id)) err('changes.json', `removed feature “${r.id}” is still in features/`);
    for (const id of [...(changes.assets?.new ?? []), ...(changes.assets?.changed ?? []).map(c => c.id)]) {
      if (!assets.has(id)) err('changes.json', `asset “${id}” is not in manifest.json`);
    }
    for (const id of changes.assets?.removed ?? []) if (assets.has(id)) err('changes.json', `removed asset “${id}” is still in manifest.json`);
  }

  // release-notes.md
  const notesSrc = await readFile(path.join(dir, 'release-notes.md'), 'utf8');
  const notes = frontMatter(notesSrc);
  if (!notes.data) err('release-notes.md', 'no front matter');
  else {
    if (String(notes.data.version) !== manifest.app?.version) err('release-notes.md', `version is ${notes.data.version}, but the app version is ${manifest.app?.version}`);
    if (!notes.data.date) err('release-notes.md', 'needs a date');
  }
  const sections = [...notes.body.matchAll(/^##\s+(.+)$/gm)].map(m => m[1].trim());
  for (const s of sections) if (!NOTE_SECTIONS.includes(s)) err('release-notes.md', `section “${s}” should be one of ${NOTE_SECTIONS.join(', ')}`);
  const order = sections.map(s => NOTE_SECTIONS.indexOf(s));
  if (order.some((n, i) => i && n <= order[i - 1])) err('release-notes.md', `sections go in the order ${NOTE_SECTIONS.join(', ')}`);
  for (const [, id] of notes.body.matchAll(/\[feature:\s*([a-z0-9-]+)\]/g)) {
    if (!kit.features.has(id)) err('release-notes.md', `[feature: ${id}] is not in features/`);
  }
  kit.releaseNotes = { ...notes.data, body: notes.body.trim() };

  return { errors, warnings, kit };
}

// ——— Command line ———

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('usage: npm run validate-kit -- <release kit folder>');
    process.exit(2);
  }
  const { errors, warnings, kit } = await validateKit(path.resolve(dir));
  for (const w of warnings) console.warn(`warning  ${w}`);
  for (const e of errors) console.error(`error  ${e}`);
  if (errors.length) {
    console.error(`\n${errors.length} problem${errors.length === 1 ? '' : 's'} in ${dir}`);
    process.exit(1);
  }
  console.log(`Release kit for Mooligan ${kit.manifest.app.version} is valid: ` +
    `${kit.features.size} features, ${kit.manifest.assets.length} assets, ${kit.manifest.devices.length} device${kit.manifest.devices.length === 1 ? "" : "s"}.`);
}
