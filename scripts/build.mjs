#!/usr/bin/env node
// Builds mooligan.com from content/ into dist/: one page of illustrated instructions.
// The page is a single column of tasks, grouped by section; each task opens in place
// to show its steps. Each file in content/tasks is a task, in file order: a short run of
// numbered steps, each with a drawing (content/figures) or a capture from a release kit
// (media/), plus tips and do/don’t panels. The build fails on anything it can’t resolve.

import { readFile, readdir, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { Marked } from 'marked';
import YAML from 'yaml';

const ROOT = path.resolve(import.meta.dirname, '..');
const CONTENT = path.join(ROOT, 'content');
const OUT = path.join(ROOT, 'dist');

class BuildError extends Error {}
const fail = (where, message) => { throw new BuildError(`${where}: ${message}`); };
process.on('uncaughtException', e => {
  console.error(e instanceof BuildError ? `error  ${e.message}` : e);
  process.exit(1);
});

const esc = s => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const indent = (s, n) => s.split('\n').map(l => (l ? ' '.repeat(n) + l : l)).join('\n');
const rel = file => path.relative(ROOT, file);

const marked = new Marked({
  renderer: { codespan({ text }) { return `<span class="ui">${text}</span>`; } },
});
const inline = text => marked.parseInline(text).trim();

// ——— Load ———

const book = YAML.parse(await readFile(path.join(CONTENT, 'book.yml'), 'utf8')) ?? {};
for (const key of ['name', 'url', 'description', 'sections']) if (!book[key]) fail('content/book.yml', `“${key}” is required`);
if (!Array.isArray(book.sections) || !book.sections.length) fail('content/book.yml', '“sections” should be a list of section names');

const mediaFile = path.join(ROOT, 'media/manifest.json');
const media = existsSync(mediaFile) ? JSON.parse(await readFile(mediaFile, 'utf8')) : { assets: [] };

// A task body is a list of lines:
//   1. Step text. ![](figure:name)        a numbered step, with a drawing or a capture
//   > Tip text.                           a tip
//   ✓ Do this. ![](figure:name)           a do/don’t pair
//   ✗ Not this. ![](figure:name)
const FIGURE = /\s*!\[([^\]]*)\]\((figure|asset):([^)\s]+)\)\s*$/;

function parseTask(src, file) {
  const m = src.match(/^---\n([\s\S]*?)\n---\n?/);
  const data = m ? YAML.parse(m[1]) ?? {} : {};
  if (!data.title) fail(file, '“title” is required in the front matter');
  if (!data.feature) fail(file, '“feature” is required in the front matter (the feature id release kits use)');
  if (!data.summary) fail(file, '“summary” is required in the front matter (one line, shown in the contents)');
  if (!book.sections.includes(data.section)) fail(file, `“section” should be one of: ${book.sections.join(', ')}`);
  const panels = [];
  const offset = m ? m[0].split('\n').length - 1 : 0;
  let inTip = false;   // consecutive “>” lines make one tip
  for (const [i, raw] of (m ? src.slice(m[0].length) : src).split('\n').entries()) {
    const line = raw.trim();
    const where = `${file}:${i + 1 + offset}`;
    let k;
    if (!line || /^<!--.*-->$/.test(line)) { inTip = false; continue; }
    if ((k = line.match(/^>\s?(.*)$/))) {
      if (inTip) panels.at(-1).text += ' ' + k[1];
      else panels.push({ type: 'tip', text: k[1] });
      inTip = true;
      continue;
    }
    inTip = false;
    if ((k = line.match(/^\d+\.\s+(.+)$/))) panels.push({ type: 'step', ...withFigure(k[1], where) });
    else if ((k = line.match(/^([✓✗])\s+(.+)$/))) panels.push({ type: k[1] === '✓' ? 'do' : 'dont', ...withFigure(k[2], where) });
    else fail(where, `expected a step (“1. …”), a tip (“> …”) or a do/don’t (“✓ …”, “✗ …”), not “${line}”`);
  }
  if (!panels.some(p => p.type === 'step')) fail(file, 'a task needs at least one numbered step');
  return { data, panels, file };
}

function withFigure(text, where) {
  const f = text.match(FIGURE);
  if (!f) return { text, where };
  return { text: text.slice(0, f.index).trim(), where, figure: { alt: f[1], kind: f[2], ref: f[3] } };
}

const taskFiles = (await readdir(path.join(CONTENT, 'tasks')))
  .filter(f => /^\d+-.+\.md$/.test(f)).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
if (!taskFiles.length) fail('content/tasks', 'no tasks');
const tasks = [];
for (const name of taskFiles) {
  const file = path.join(CONTENT, 'tasks', name);
  tasks.push({ ...parseTask(await readFile(file, 'utf8'), rel(file)), slug: name.replace(/^\d+-|\.md$/g, '') });
}

// ——— Figures ———

let figureCount = 0;

async function figure(fig, where) {
  const n = ++figureCount;
  if (fig.kind === 'figure') {
    const file = path.join(CONTENT, 'figures', fig.ref + '.svg');
    if (!existsSync(file)) fail(where, `no drawing at ${rel(file)}`);
    let svg = (await readFile(file, 'utf8')).trim();
    if (!/<title>[^<]+<\/title>/.test(svg)) fail(rel(file), 'a drawing needs a <title> describing it');
    if (fig.alt) svg = svg.replace(/<title>[^<]*<\/title>/, `<title>${esc(fig.alt)}</title>`);
    return svg
      .replace(/^<svg([^>]*?)\s+xmlns="[^"]*"([^>]*)>/, '<svg$1$2>')
      .replace(/^<svg/, `<svg role="img" aria-labelledby="f${n}"`)
      .replace('<title>', `<title id="f${n}">`);
  }
  // A capture from a release kit, copied into media/ by `npm run import-kit`.
  const asset = media.assets.find(a => a.id === fig.ref);
  if (!asset) fail(where, `capture “${fig.ref}” is not in media/manifest.json (run npm run import-kit)`);
  const files = asset.files.filter(f => f.device === book.figures?.device);
  if (!files.length) fail(where, `capture “${fig.ref}” has nothing for ${book.figures?.device}`);
  const light = files.find(f => f.appearance === 'light') ?? files[0];
  const dark = files.find(f => f.appearance === 'dark');
  for (const f of [light, dark].filter(Boolean)) {
    if (!existsSync(path.join(ROOT, 'media', f.web))) fail(where, `missing file media/${f.web}`);
  }
  const src = f => esc('media/' + f.web);
  const size = light.width && light.height ? ` width="${light.width}" height="${light.height}"` : '';
  const alt = esc(fig.alt || asset.description);
  if (asset.kind === 'video') {
    return `<video${size}${light.poster ? ` poster="${esc('media/' + light.poster)}"` : ''} autoplay muted loop playsinline preload="metadata" aria-label="${alt}">` +
      (dark ? `<source src="${src(dark)}" type="video/mp4" media="(prefers-color-scheme: dark)">` : '') +
      `<source src="${src(light)}" type="video/mp4"></video>`;
  }
  return `<picture>${dark ? `<source srcset="${src(dark)}" media="(prefers-color-scheme: dark)">` : ''}` +
    `<img src="${src(light)}" alt="${alt}"${size} loading="lazy" decoding="async"></picture>`;
}

// ——— Render ———

async function renderTask(task, i) {
  const items = [];
  let step = 0;
  for (const p of task.panels) {
    const art = p.figure ? '\n' + indent(await figure(p.figure, p.where), 2) : '';
    if (p.type === 'step') {
      items.push(`<li class="panel">\n  <span class="k" aria-hidden="true">${++step}</span>${art}\n  <p><span class="vh">Step ${step}: </span>${inline(p.text)}</p>\n</li>`);
    } else if (p.type === 'tip') {
      items.push(`<li class="panel tip" role="note">\n  <span class="k" aria-hidden="true">!</span>\n  <p><span class="vh">Tip: </span>${inline(p.text)}</p>\n</li>`);
    } else {
      const [mark, label] = p.type === 'do' ? ['✓', 'Do'] : ['✗', 'Don’t'];
      items.push(`<li class="panel ${p.type}">\n  <span class="k" aria-hidden="true">${mark}</span>${art}\n  <p><span class="vh">${label}: </span>${inline(p.text)}</p>\n</li>`);
    }
  }
  const isNew = task.data.new ? `<span class="new">New</span>` : '';
  const startsSection = i > 0 && tasks[i - 1].data.section !== task.data.section;
  return `<details class="task${startsSection ? ' gs' : ''}" id="${task.slug}">
  <summary>
    <span class="name">${esc(task.data.title)}</span>${isNew}
    <span class="sum">${inline(task.data.summary)}</span>
  </summary>
  <ol class="panels">
${indent(items.join('\n'), 4)}
  </ol>
</details>`;
}

// Tasks run in section order (file order within a section); the section names aren’t shown,
// only a little extra space where one ends (the “gs” class on its first task).
const css = (await readFile(path.join(ROOT, 'src/style.css'), 'utf8')).trimEnd();
const script = (await readFile(path.join(ROOT, 'src/page.js'), 'utf8')).trimEnd();
tasks.sort((a, b) => book.sections.indexOf(a.data.section) - book.sections.indexOf(b.data.section));
const taskHtml = [];
for (const [i, t] of tasks.entries()) taskHtml.push(await renderTask(t, i));

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(book.name)}${book.label ? ` · ${esc(book.label)}` : ''}</title>
<meta name="description" content="${esc(book.description)}">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0f0f0f" media="(prefers-color-scheme: dark)">
<link rel="canonical" href="${esc(book.url)}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta property="og:type" content="website">
<meta property="og:url" content="${esc(book.url)}">
<meta property="og:title" content="${esc(book.name)}${book.label ? ` · ${esc(book.label)}` : ''}">
<meta property="og:description" content="${esc(book.description)}">
<meta property="og:image" content="${esc(new URL('og.png', book.url))}">
<meta name="twitter:card" content="summary_large_image">
<!-- Generated by scripts/build.mjs from content/. Edit the content, not this file. -->
<style>
${indent(css, 2)}
</style>
</head>
<body>
<div class="page">

<h1 class="vh">${esc(book.name)}${book.label ? ` ${esc(book.label)}` : ''}</h1>

<main class="contents">
${taskHtml.join("\n\n")}
</main>

</div>
<script>
${indent(script, 2)}
</script>
</body>
</html>
`;

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
await cp(path.join(ROOT, 'public'), OUT, { recursive: true });
if (existsSync(path.join(ROOT, 'media'))) await cp(path.join(ROOT, 'media'), path.join(OUT, 'media'), { recursive: true });
await writeFile(path.join(OUT, 'index.html'), html);

const steps = tasks.reduce((n, t) => n + t.panels.filter(p => p.type === 'step').length, 0);
console.log(`Built ${rel(OUT)}/index.html: ${tasks.length} tasks, ${steps} steps, ${figureCount} figures.`);
