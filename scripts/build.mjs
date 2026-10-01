#!/usr/bin/env node
// Builds mooligan.com from content/ into dist/: one page that maps the whole app as a directory,
// under the logo (content/logo.svg). Each file in content/tasks is one feature of the app, in
// section order: its name and its tree of screens, sections and rows, any of which opens in place.
// A node may also hold numbered steps, with a drawing (content/figures) or a capture from a
// release kit (media/). The build fails on anything it can’t resolve, a link to a missing node
// among them.

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
  renderer: { codespan({ text }) { return `<span class="ui">${esc(text)}</span>`; } },
});
const inline = text => marked.parseInline(text).trim();

// ——— Load ———

const book = YAML.parse(await readFile(path.join(CONTENT, 'book.yml'), 'utf8')) ?? {};
for (const key of ['name', 'url', 'description', 'sections']) if (!book[key]) fail('content/book.yml', `“${key}” is required`);
if (!Array.isArray(book.sections) || !book.sections.length) fail('content/book.yml', '“sections” should be a list of section names');

const mediaFile = path.join(ROOT, 'media/manifest.json');
const media = existsSync(mediaFile) ? JSON.parse(await readFile(mediaFile, 'utf8')) : { assets: [] };

// A feature’s file is a tree. Under the front matter:
//   Where: Explore → an archetype row          where the feature, or a node, is reached from
//   - `Label` — what it is                      a row of the screen: a leaf of the tree
//     - a row inside it                        (indent two spaces to nest)
//   - Swipe to change the format → {#metagame}  an action, and the node it leads to
//   ## Screen or section {#id} [planned]        a node, one level down per extra #
//   1. Step. ![](figure:name)                   a numbered step, shown when the node opens
//   > Tip.                                      a tip
// {#id} anywhere in text links to that node, by its title. A node without an id is given one
// from its title and its parent’s. Any node opens in place to show its rows and children; each
// opened node with rows holds a placeholder for its picture until there is one.
const FIGURE = /\s*!\[([^\]]*)\]\((figure|asset):([^)\s]+)\)\s*$/;
const slugify = s => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ’']/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// Tags a node can carry in [brackets]; only these show, the rest are notes for the editor.
const TAGS = { planned: 'planned', data: 'planned', unfinished: 'unfinished', soon: 'soon' };
const ids = new Map();   // id → node, across every file

function parseTask(src, file) {
  const m = src.match(/^---\n([\s\S]*?)\n---\n?/);
  let data = {};
  try { data = m ? YAML.parse(m[1]) ?? {} : {}; }
  catch (e) { fail(file, `the front matter isn’t valid YAML (${e.message.split('\n')[0]}); quote a value that holds “: ”`); }
  if (!data.title) fail(file, '“title” is required in the front matter');
  if (!data.feature) fail(file, '“feature” is required in the front matter (the feature id release kits use)');
  if (!book.sections.includes(data.section)) fail(file, `“section” should be one of: ${book.sections.join(', ')}`);
  const slug = path.basename(file).replace(/^\d+-|\.md$/g, '');
  const root = { title: data.title, id: data.id ?? slug, depth: 0, items: [], panels: [], tags: [], file };
  claim(root, file);
  const stack = [root];
  const offset = m ? m[0].split('\n').length - 1 : 0;
  let inTip = false;
  let leafStack = [];   // the open leaves, by indent level
  for (const [i, raw] of (m ? src.slice(m[0].length) : src).split('\n').entries()) {
    const where = `${file}:${i + 1 + offset}`;
    const line = raw.trim();
    let k;
    if (!line || /^<!--.*-->$/.test(line)) { inTip = false; continue; }
    if ((k = line.match(/^(#{2,6})\s+(.+)$/))) {
      const depth = k[1].length - 1;
      while (stack.at(-1).depth >= depth) stack.pop();
      const parent = stack.at(-1);
      if (depth !== parent.depth + 1) fail(where, `a “${k[1]}” heading needs a heading one level up above it`);
      let title = k[2].trim(), id, tags = [];
      title = title.replace(/\s*\[([a-z, -]+)\]\s*$/i, (_, t) => { tags = t.split(/[ ,]+/).filter(Boolean).map(s => s.toLowerCase()); return ''; });
      title = title.replace(/\s*\{#([a-z0-9-]+)\}\s*$/, (_, x) => { id = x; return ''; }).trim();
      const node = { title, id: id ?? `${parent.id}-${slugify(title)}`, depth, items: [], panels: [], tags, where, file };
      claim(node, where);
      parent.items.push({ type: 'node', node });
      stack.push(node);
      leafStack = [];
      inTip = false;
      continue;
    }
    const node = stack.at(-1);
    if ((k = line.match(/^Where:\s*(.+)$/i))) { node.from = k[1]; continue; }
    if ((k = raw.match(/^(\s*)[-*]\s+(.+)$/))) {
      const level = Math.floor(k[1].replace(/\t/g, '  ').length / 2);
      const leaf = { type: 'leaf', text: k[2].trim(), items: [], where };
      if (level === 0) { node.items.push(leaf); leafStack = [leaf]; }
      else {
        const parent = leafStack[level - 1];
        if (!parent) fail(where, 'an indented row needs a row above it, one level out');
        parent.items.push(leaf);
        leafStack = leafStack.slice(0, level).concat(leaf);
      }
      inTip = false;
      continue;
    }
    if ((k = line.match(/^>\s?(.*)$/))) {
      if (inTip) node.panels.at(-1).text += ' ' + k[1];
      else node.panels.push({ type: 'tip', text: k[1], where });
      inTip = true;
      continue;
    }
    inTip = false;
    if ((k = line.match(/^\d+\.\s+(.+)$/))) node.panels.push({ type: 'step', ...withFigure(k[1], where) });
    else if ((k = line.match(/^([✓✗])\s+(.+)$/))) node.panels.push({ type: k[1] === '✓' ? 'do' : 'dont', ...withFigure(k[2], where) });
    else fail(where, `expected a node (“## …”), a row (“- …”), “Where: …”, a step (“1. …”) or a tip (“> …”), not “${line}”`);
  }
  return { data, root, file, slug };
}

function claim(node, where) {
  if (ids.has(node.id)) fail(where, `the id “${node.id}” is already used by “${ids.get(node.id).title}” (${ids.get(node.id).file})`);
  ids.set(node.id, node);
}

function withFigure(text, where) {
  const f = text.match(FIGURE);
  if (!f) return { text, where };
  return { text: text.slice(0, f.index).trim(), where, figure: { alt: f[1], kind: f[2], ref: f[3] } };
}

// Inline Markdown, with {#id} turned into a link to that node, named by its title.
function rich(text, where) {
  const refs = [];
  const marked_ = text.replace(/\{#([a-z0-9-]+)\}/g, (_, id) => {
    if (!ids.has(id)) fail(where, `nothing has the id “${id}”`);
    refs.push(id);
    return `\u0000${refs.length - 1}\u0000`;
  });
  // Angle brackets outside `code` are text (“<n> cards”), not HTML.
  const safe = marked_.split(/(`[^`]*`)/).map((part, i) => (i % 2 ? part : part.replace(/</g, '&lt;').replace(/>/g, '&gt;'))).join('');
  return inline(safe).replace(/\u0000(\d+)\u0000/g, (_, n) => `<a href="#${refs[n]}">${esc(ids.get(refs[n]).title)}</a>`);
}

const taskFiles = (await readdir(path.join(CONTENT, 'tasks')))
  .filter(f => /^\d+-.+\.md$/.test(f)).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
if (!taskFiles.length) fail('content/tasks', 'no tasks');
const tasks = [];
for (const name of taskFiles) {
  const file = path.join(CONTENT, 'tasks', name);
  tasks.push(parseTask(await readFile(file, 'utf8'), rel(file)));
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

// The steps of a task or part. Steps with pictures sit in a grid of panels; a run of steps
// without any picture (yet) reads as a plain numbered list.
async function renderPanels(panels) {
  const items = [];
  let step = 0;
  for (const p of panels) {
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
  const pictured = panels.some(p => p.figure);
  return `<ol class="panels${pictured ? '' : ' list'}">\n${indent(items.join('\n'), 2)}\n</ol>`;
}

// A row: its text, with what it is after a “—” in grey, and the rows inside it.
function renderLeaf(leaf, branch) {
  const [head, ...rest] = leaf.text.split(' — ');
  const text = rich(head, leaf.where) + (rest.length ? ` <span class="desc">— ${rich(rest.join(' — '), leaf.where)}</span>` : '');
  return `<li class="leaf"><span class="br" aria-hidden="true">${branch}</span><span class="txt">${text}</span>${renderItems(leaf.items)}</li>`;
}

// A node: its name, which opens to show where it is reached from, a placeholder for its picture,
// its steps, and its rows and children, as a directory one level further in.
async function renderNode(node, branch, inherited = []) {
  // A tag shows once, on the outermost node that carries it.
  const shown = node.tags.filter(t => TAGS[t]).map(t => TAGS[t]);
  const tags = shown.filter(t => !inherited.includes(t)).map(t => ` <span class="tag">${t}</span>`).join('');
  const passed = inherited.concat(shown);
  const leaves = node.items.some(x => x.type === 'leaf');
  const body = [
    node.from ? `<p class="from"><span aria-hidden="true">↳ </span><span class="vh">Reached from: </span>${rich(node.from, node.where)}</p>` : '',
    leaves ? `<p class="ph" aria-hidden="true">[ picture ]</p>` : '',
    node.panels.length ? await renderPanels(node.panels) : '',
    await renderItemsAsync(node.items, passed),
  ].filter(Boolean).join('\n');
  return `<li class="node">
  <details id="${node.id}">
    <summary><span class="br" aria-hidden="true">${branch}</span><span><span class="name">${esc(node.title)}</span>${tags}</span></summary>
    <div class="body">
${indent(body, 6)}
    </div>
  </details>
</li>`;
}

const branchOf = (i, list) => (i === list.length - 1 ? '└' : '├');
function renderItems(items) {
  if (!items.length) return '';
  return `<ul class="tree">${items.map((x, i) => renderLeaf(x, branchOf(i, items))).join('')}</ul>`;
}
async function renderItemsAsync(items, inherited = []) {
  if (!items.length) return '';
  const out = [];
  for (const [i, x] of items.entries()) out.push(x.type === 'node' ? await renderNode(x.node, branchOf(i, items), inherited) : renderLeaf(x, branchOf(i, items)));
  return `<ul class="tree">\n${indent(out.join('\n'), 2)}\n</ul>`;
}

// A feature: its name, where it is, and its tree.
async function renderTask(task, i) {
  const { root } = task;
  const isNew = task.data.new ? `<span class="new">New</span>` : '';
  const startsSection = i > 0 && tasks[i - 1].data.section !== task.data.section;
  const rootTags = root.tags.concat(task.data.status ? [task.data.status] : []).filter(t => TAGS[t]).map(t => TAGS[t]);
  const tags = rootTags.map(t => ` <span class="tag">${t}</span>`).join('');
  const parts = [
    `<h2 class="fname">${esc(root.title)}${isNew}${tags}</h2>`,
    root.from ? `<p class="from"><span aria-hidden="true">↳ </span><span class="vh">Reached from: </span>${rich(root.from, task.file)}</p>` : '',
    root.panels.length ? await renderPanels(root.panels) : '',
    await renderItemsAsync(root.items, rootTags),
  ].filter(Boolean).join('\n');
  return `<div class="feature${startsSection ? ' gs' : ''}" id="${root.id}">
${indent(parts, 2)}
</div>`;
}

// Tasks run in section order (file order within a section); the section names aren’t shown,
// only a little extra space where one ends (the “gs” class on its first task).
const css = (await readFile(path.join(ROOT, 'src/style.css'), 'utf8')).trimEnd();
// The logo, inline so it takes the page’s ink in light and dark.
const logoFile = path.join(CONTENT, 'logo.svg');
let logo = (await readFile(logoFile, 'utf8')).trim();
if (!/<title>[^<]+<\/title>/.test(logo)) fail(rel(logoFile), 'the logo needs a <title> naming it');
logo = logo.replace(/^<svg([^>]*?)\s+xmlns="[^"]*"([^>]*)>/, '<svg$1$2>')
  .replace(/^<svg/, '<svg role="img" aria-labelledby="logo"').replace('<title>', '<title id="logo">');
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

<h1 class="logo">${logo}<span class="vh">${book.label ? ` ${esc(book.label)}` : ''}</span></h1>

<main class="contents">
${taskHtml.join("\n\n")}
</main>
${book.notice ? `\n<p class="notice">${inline(book.notice)}</p>\n` : ''}
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

const all = [...ids.values()];
const panelsOf = all.flatMap(n => n.panels);
const rowCount = n => n.items.reduce((c, x) => c + (x.type === 'leaf' ? 1 + rowCount(x) : 0), 0);
const rows = all.reduce((c, n) => c + rowCount(n), 0);
console.log(`Built ${rel(OUT)}/index.html: ${tasks.length} features, ${all.length - tasks.length} nodes, ${rows} rows, ${panelsOf.filter(p => p.type === 'step').length} steps, ${figureCount} figures.`);
