#!/usr/bin/env node
// Builds The Mooligan Companion from content/ into dist/.
//
// The book is written as Markdown and YAML; this script works out everything a
// printer would: page numbers (folios), the contents, figure numbers, the
// glossary links and the index. It fails loudly on anything it can’t resolve,
// so a broken cross-reference never reaches the site.

import { readFile, readdir, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { Marked } from 'marked';
import YAML from 'yaml';

const ROOT = path.resolve(import.meta.dirname, '..');
const CONTENT = path.join(ROOT, 'content');
const OUT = path.join(ROOT, 'dist');

const ORDINALS = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
const FRONT_FOLIOS = ['v', 'vii', 'ix', 'xi'];
const GLOSSARY_TERMS_PER_PAGE = 20;
const INDEX_ENTRIES_PER_PAGE = 16;

class BuildError extends Error {}
const fail = (where, message) => { throw new BuildError(`${where}: ${message}`); };
const warnings = [];
const warn = (where, message) => warnings.push(`${where}: ${message}`);
process.on('uncaughtException', e => {
  console.error(e instanceof BuildError ? `error  ${e.message}` : e);
  process.exit(1);
});

// ——— Small helpers ———

const esc = s => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const slug = s => String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const nextOdd = n => (n % 2 ? n : n + 1);
const indent = (s, n) => s.split('\n').map(l => (l ? ' '.repeat(n) + l : l)).join('\n');
const byName = (a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' });
const rel = file => path.relative(ROOT, file);

async function readYaml(file) {
  try { return YAML.parse(await readFile(file, 'utf8')) ?? {}; }
  catch (e) { fail(rel(file), e.message); }
}

async function readDoc(file) {
  const src = await readFile(file, 'utf8');
  const m = src.match(/^---\n([\s\S]*?)\n---\n?/);
  let data = {};
  if (m) {
    try { data = YAML.parse(m[1]) ?? {}; } catch (e) { fail(rel(file), `front matter: ${e.message}`); }
  }
  return { file: rel(file), data, blocks: parseBlocks(m ? src.slice(m[0].length) : src, rel(file)) };
}

// Numbered entries (“1-starting-a-game.md”) in order; anything else is ignored.
async function numbered(dir, { dirs = false } = {}) {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter(e => (dirs ? e.isDirectory() : e.isFile() && e.name.endsWith('.md')) && /^\d+-/.test(e.name))
    .map(e => ({ name: e.name, n: parseInt(e.name, 10), path: path.join(dir, e.name) }))
    .sort((a, b) => a.n - b.n);
}

// ——— Blocks ———
// A document body is a run of blocks separated by blank lines:
//   paragraph · “## Heading” (a new page, run in to the next paragraph) · “> note”
//   · “![caption](figure:name)” or “![caption](asset:id)” · “- list” · “<!-- index: a; b > c -->”

function parseBlocks(body, where) {
  const out = [];
  for (const chunk of body.split(/\n[ \t]*\n/)) {
    const lines = chunk.replace(/^\n+|\s+$/g, '').split('\n');
    let i = 0;
    for (; i < lines.length; i++) {
      const line = lines[i].trim();
      let m;
      if ((m = line.match(/^##\s+(.+)$/))) out.push({ type: 'heading', text: m[1].trim() });
      else if ((m = line.match(/^<!--\s*index:\s*([\s\S]*?)\s*-->$/))) out.push({ type: 'index', terms: splitTerms(m[1]) });
      else if (/^<!--[\s\S]*-->$/.test(line)) { /* an ordinary comment */ }
      else break;
    }
    const rest = lines.slice(i);
    if (!rest.length || !rest[0].trim()) continue;
    const text = rest.join('\n');
    let m;
    if (/^#/.test(rest[0])) fail(where, `only “## ” headings are allowed: “${rest[0]}”`);
    else if (rest.every(l => l.startsWith('>'))) out.push({ type: 'note', text: rest.map(l => l.replace(/^>\s?/, '')).join('\n') });
    else if ((m = text.match(/^!\[([^\]]*)\]\((figure|asset):([^)\s]+)\)$/))) out.push({ type: 'figure', caption: m[1], kind: m[2], ref: m[3] });
    else if (/^[-*]\s+/.test(rest[0])) {
      const items = [];
      for (const l of rest) {
        if (/^[-*]\s+/.test(l)) items.push(l.replace(/^[-*]\s+/, ''));
        else if (items.length) items[items.length - 1] += ' ' + l.trim();
      }
      out.push({ type: 'list', items });
    } else out.push({ type: 'para', text });
  }
  return out;
}

function splitTerms(s) {
  return s.split(';').map(t => t.trim()).filter(Boolean);
}

// ——— Load the book ———

const book = await readYaml(path.join(CONTENT, 'book.yml'));
for (const key of ['name', 'title', 'subtitle', 'url', 'description', 'edition', 'year', 'epigraph']) {
  if (!book[key]) fail('content/book.yml', `“${key}” is required`);
}

const preface = await readDoc(path.join(CONTENT, 'front/preface.md'));
const whatsNewFile = path.join(CONTENT, 'front/whats-new.md');
const whatsNew = existsSync(whatsNewFile) ? await readDoc(whatsNewFile) : null;
const colophon = await readDoc(path.join(CONTENT, 'back/colophon.md'));
const glossary = await readYaml(path.join(CONTENT, 'back/glossary.yml'));
const crossRefs = await readYaml(path.join(CONTENT, 'back/index.yml'));

const mediaFile = path.join(ROOT, 'media/manifest.json');
const media = existsSync(mediaFile) ? JSON.parse(await readFile(mediaFile, 'utf8')) : { assets: [] };

const parts = [];
for (const dir of await numbered(path.join(CONTENT, 'parts'), { dirs: true })) {
  const meta = await readYaml(path.join(dir.path, 'part.yml'));
  for (const key of ['title', 'colour', 'motto']) if (!meta[key]) fail(rel(path.join(dir.path, 'part.yml')), `“${key}” is required`);
  const chapters = [];
  for (const f of await numbered(dir.path)) {
    const doc = await readDoc(f.path);
    if (!doc.data.title) fail(doc.file, '“title” is required in the front matter');
    if (!doc.data.feature) warn(doc.file, 'no “feature” in the front matter, so release kits cannot map to this chapter');
    chapters.push({ ...doc, slug: f.name.replace(/^\d+-|\.md$/g, '') });
  }
  if (!chapters.length) fail(rel(dir.path), 'a part needs at least one chapter');
  parts.push({ ...meta, slug: dir.name.replace(/^\d+-/, ''), chapters });
}
if (parts.length > ORDINALS.length) fail('content/parts', `at most ${ORDINALS.length} parts`);

// ——— Glossary ———

const terms = (glossary.terms ?? []).map(t => {
  if (!t.term || !t.definition) fail('content/back/glossary.yml', 'every entry needs a “term” and a “definition”');
  return { ...t, id: 'g-' + slug(t.term) };
});
const termById = new Map(terms.map(t => [t.term.toLowerCase(), t]));
const usedTerms = new Set();

// ——— Pages ———
// Front matter takes roman folios. Each part and chapter starts on a right-hand
// (odd) page; every “## ” section inside a chapter is a page of its own.

const index = new Map();        // head → { pages, subs: Map(sub → pages) }
const pageById = new Map();     // “p15” → folio
const targets = new Map();      // name used in [](page:…) → page id

function page(folio, order) { return { folio: String(folio), id: 'p' + folio, order }; }

function addTerms(list, pg, where) {
  for (const term of list) {
    const [head, sub, extra] = term.split('>').map(s => s.trim());
    if (!head || extra !== undefined) fail(where, `index term “${term}” should be “entry” or “entry > sub-entry”`);
    if (!index.has(head)) index.set(head, { pages: [], subs: new Map() });
    const entry = index.get(head);
    const list = sub ? (entry.subs.get(sub) ?? entry.subs.set(sub, []).get(sub)) : entry.pages;
    if (!list.some(p => p.folio === pg.folio)) list.push(pg);
  }
}

const front = [];
const epigraphPage = page(FRONT_FOLIOS[0], -100);
const contentsPage = page(FRONT_FOLIOS[1], -99);
const prefacePage = page(FRONT_FOLIOS[2], -98);
const whatsNewPage = whatsNew ? page(FRONT_FOLIOS[3], -97) : null;
front.push(epigraphPage, contentsPage, prefacePage);
if (whatsNewPage) front.push(whatsNewPage);
addTerms(book.epigraph.index ?? [], epigraphPage, 'content/book.yml');
targets.set('contents', contentsPage.id).set('preface', prefacePage.id);
if (whatsNewPage) targets.set('whats-new', whatsNewPage.id);

// Walk a document’s blocks, giving each “## ” section its page and collecting index terms.
function paginate(doc, firstPage, next) {
  let current = firstPage;
  let pendingHeading = null;
  for (const block of doc.blocks) {
    if (block.type === 'heading') {
      if (!next) fail(doc.file, '“## ” sections are only for chapters');
      if (pendingHeading) fail(doc.file, `“## ${pendingHeading.text}” needs a paragraph after it`);
      current = next();
      block.page = current;
      pendingHeading = block;
    } else if (block.type === 'index') {
      addTerms(block.terms, current, doc.file);
    } else if (block.type === 'para' && pendingHeading) {
      block.sub = { title: pendingHeading.text, page: pendingHeading.page };
      pendingHeading = null;
    } else if (pendingHeading) {
      fail(doc.file, `“## ${pendingHeading.text}” must be followed by a paragraph`);
    }
  }
  if (pendingHeading) fail(doc.file, `“## ${pendingHeading.text}” needs a paragraph after it`);
}

paginate(preface, prefacePage);
if (whatsNew) paginate(whatsNew, whatsNewPage);

let folio = 1;
let chapterNumber = 0;
for (const part of parts) {
  folio = nextOdd(folio);
  part.page = page(folio, folio);
  folio += 1;
  targets.set(part.slug, part.page.id);
  for (const ch of part.chapters) {
    folio = nextOdd(folio);
    ch.page = page(folio, folio);
    ch.number = ++chapterNumber;
    folio += 1;
    targets.set(ch.slug, ch.page.id);
    paginate(ch, ch.page, () => page(folio, folio++));
    for (const b of ch.blocks) if (b.sub) targets.set(`${ch.slug}/${slug(b.sub.title)}`, b.sub.page.id);
  }
}

folio = nextOdd(folio);
const glossaryPage = page(folio, folio);
folio += Math.max(1, Math.ceil(terms.length / GLOSSARY_TERMS_PER_PAGE));
addTerms(glossary.index ?? [], glossaryPage, 'content/back/glossary.yml');
targets.set('glossary', glossaryPage.id);

// Cross-references.
for (const [head, target] of Object.entries(crossRefs.see ?? {})) {
  if (index.has(head)) fail('content/back/index.yml', `“${head}” has pages of its own, so it can’t also be “see ${target}”`);
  index.set(head, { pages: [], subs: new Map(), see: target });
}
for (const [head, also] of Object.entries(crossRefs.see_also ?? {})) {
  if (!index.has(head)) fail('content/back/index.yml', `“see also” for “${head}”, which is not in the index`);
  index.get(head).seeAlso = also;
}
for (const [head, entry] of index) {
  for (const target of [entry.see, ...(entry.seeAlso ?? [])].filter(Boolean)) {
    if (!index.has(target)) fail('content/back/index.yml', `“${head}” points to “${target}”, which is not in the index`);
  }
}

folio = nextOdd(folio);
const indexPage = page(folio, folio);
folio += Math.max(1, Math.ceil(index.size / INDEX_ENTRIES_PER_PAGE));
targets.set('index', indexPage.id);

folio = nextOdd(folio);
const colophonPage = page(folio, folio);
targets.set('colophon', colophonPage.id);

// ——— Inline text ———

const marked = new Marked({
  renderer: {
    codespan({ text }) { return `<span class="ui">${text}</span>`; },
    link({ href, tokens }) {
      const label = this.parser.parseInline(tokens);
      if (href.startsWith('page:')) {
        const id = targets.get(href.slice(5));
        if (!id) fail(currentWhere, `no page called “${href.slice(5)}” (try one of: ${[...targets.keys()].join(', ')})`);
        return `<a class="xr" href="#${id}">${label || 'p. ' + id.slice(1)}</a>`;
      }
      return `<a href="${esc(href)}">${label}</a>`;
    },
  },
});

let currentWhere = '';
function inline(text, where) {
  currentWhere = where;
  const withTerms = text.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, shown, name) => {
    const term = termById.get((name ?? shown).trim().toLowerCase());
    if (!term) fail(where, `“${(name ?? shown).trim()}” is not in the glossary`);
    usedTerms.add(term.id);
    return `<a class="gl" href="#${term.id}">${shown.trim()}</a>`;
  });
  return marked.parseInline(withTerms.replace(/\n/g, ' ')).trim();
}

// ——— Figures ———

let figureNumber = 0;

async function figure(block, where) {
  const n = ++figureNumber;
  const caption = `<figcaption><span class="kicker">Fig. ${n}</span>${inline(block.caption, where)}</figcaption>`;
  if (block.kind === 'figure') {
    const file = path.join(CONTENT, 'figures', block.ref + '.svg');
    if (!existsSync(file)) fail(where, `no drawing at ${rel(file)}`);
    let svg = (await readFile(file, 'utf8')).trim();
    if (!/<title>[^<]+<\/title>/.test(svg)) fail(rel(file), 'a drawing needs a <title> describing it');
    svg = svg
      .replace(/^<svg([^>]*?)\s+xmlns="[^"]*"([^>]*)>/, '<svg$1$2>')
      .replace(/^<svg/, `<svg role="img" aria-labelledby="fig${n}"`)
      .replace('<title>', `<title id="fig${n}">`);
    return `<figure class="fig">\n${indent(svg, 2)}\n  ${caption}\n</figure>`;
  }
  return assetFigure(block, n, caption, where);
}

// A capture from a release kit, copied into media/ (see docs/release-kit.md).
function assetFigure(block, n, caption, where) {
  const asset = media.assets.find(a => a.id === block.ref);
  if (!asset) fail(where, `asset “${block.ref}” is not in media/manifest.json`);
  const device = book.figures?.device;
  const files = asset.files.filter(f => f.device === device);
  if (!files.length) fail(where, `asset “${block.ref}” has no capture for ${device}`);
  const light = files.find(f => f.appearance === 'light') ?? files[0];
  const dark = files.find(f => f.appearance === 'dark');
  const src = f => 'media/' + f.web;
  for (const f of [light, dark].filter(Boolean)) {
    if (!existsSync(path.join(ROOT, src(f)))) fail(where, `missing file ${src(f)}`);
  }
  const size = light.width && light.height ? ` width="${light.width}" height="${light.height}"` : '';
  const alt = esc(asset.description ?? block.caption);
  let body;
  if (asset.kind === 'video') {
    const poster = light.poster ? ` poster="media/${esc(light.poster)}"` : '';
    body = `<video${size}${poster} autoplay muted loop playsinline preload="metadata" aria-label="${alt}">\n` +
      (dark ? `    <source src="${esc(src(dark))}" type="video/mp4" media="(prefers-color-scheme: dark)">\n` : '') +
      `    <source src="${esc(src(light))}" type="video/mp4">\n  </video>`;
  } else {
    body = `<picture>\n` +
      (dark ? `    <source srcset="${esc(src(dark))}" media="(prefers-color-scheme: dark)">\n` : '') +
      `    <img src="${esc(src(light))}" alt="${alt}"${size} loading="lazy" decoding="async">\n  </picture>`;
  }
  return `<figure class="fig shot">\n  ${body}\n  ${caption}\n</figure>`;
}

// ——— Rendering ———

function runIn(title) {
  return /[.?!:]$/.test(title) ? title : title + '.';
}

async function renderBlocks(blocks, where, { firstClass } = {}) {
  const html = [];
  let first = true;
  for (const b of blocks) {
    if (b.type === 'para') {
      if (b.sub) {
        const p = b.sub.page;
        html.push(`<p class="sub" id="${p.id}" data-folio="${p.folio}"><span class="run">${inline(runIn(b.sub.title), where)}</span> ${inline(b.text, where)}</p>`);
      } else {
        const cls = first && firstClass ? ` class="${firstClass}"` : '';
        html.push(`<p${cls}>${inline(b.text, where)}</p>`);
      }
      first = false;
    } else if (b.type === 'note') {
      html.push(`<div class="note" role="note">${inline(b.text, where)}</div>`);
    } else if (b.type === 'figure') {
      html.push(await figure(b, where));
    } else if (b.type === 'list') {
      html.push(`<ul class="list">\n${b.items.map(i => `  <li>${inline(i, where)}</li>`).join('\n')}\n</ul>`);
    }
  }
  return html.join('\n');
}

const pips = (on, total) => `<span class="pips" aria-hidden="true">${
  Array.from({ length: total }, (_, i) => (on === 'all' || i === on ? '<i class="on"></i>' : '<i></i>')).join('')}</span>`;

function band({ id, folio, kicker, title, motto, head, small, meta }) {
  return `<header class="band${small ? ' small' : ''}" id="${id}" data-folio="${folio}"${head ? ` data-head="${esc(head)}"` : ''}>
  <p class="kicker">${esc(kicker)}</p>
  <p class="meta">${meta ?? ''}<span class="folio">${folio}</span></p>
  <h2>${esc(title)}</h2>${motto ? `\n  <p class="motto">${esc(motto)}</p>` : ''}
</header>`;
}

async function renderChapter(ch, firstInPart) {
  const where = ch.file;
  const blocks = ch.blocks.filter(b => b.type !== 'index' && b.type !== 'heading');
  const [opening, ...rest] = blocks;
  if (!opening || opening.type !== 'para' || opening.sub) fail(where, 'a chapter must open with a paragraph');
  return `<article class="chapter">
  <div class="keep">
    <header class="ch" id="${ch.page.id}" data-folio="${ch.page.folio}">
      <p class="kicker">Chapter ${ch.number}</p>
      <h3>${esc(ch.data.title)}</h3>
    </header>
    <p class="first${firstInPart ? ' drop' : ''}">${inline(opening.text, where)}</p>
  </div>
${indent(await renderBlocks(rest, where), 2)}
</article>`;
}

async function renderPart(part, i) {
  const chapters = [];
  for (const [j, ch] of part.chapters.entries()) chapters.push(await renderChapter(ch, j === 0));
  return `<section class="part" id="part-${i + 1}">
${indent(band({
    id: part.page.id, folio: part.page.folio, head: part.title,
    kicker: `Part ${ORDINALS[i]} · ${part.colour}`, title: part.title, motto: part.motto,
    meta: pips(i, parts.length),
  }), 2)}

  <div class="cols">
${indent(chapters.join('\n\n'), 4)}
  </div>
</section>`;
}

function tocRow(href, title, folio, num = '', cls = '') {
  return `<a${cls ? ` class="${cls}"` : ''} href="#${href}">${cls ? '' : `<span class="num">${num}</span>`}<span class="t">${esc(title)}</span><span class="dots"></span><span class="n">${folio}</span></a>`;
}

function renderContents() {
  const groups = [];
  if (whatsNew) {
    groups.push(`<li>
  <span class="kicker">Front matter</span>
  <ol class="chapters">
    <li>${tocRow(whatsNewPage.id, whatsNew.data.title ?? 'What’s New', whatsNewPage.folio)}</li>
  </ol>
</li>`);
  }
  parts.forEach((part, i) => {
    groups.push(`<li>
  <span class="kicker">Part ${ORDINALS[i]} · ${esc(part.colour)}</span>
  ${tocRow(part.page.id, part.title, part.page.folio, '', 'part-row')}
  <ol class="chapters">
${part.chapters.map(ch => `    <li>${tocRow(ch.page.id, ch.data.title, ch.page.folio, ch.number)}</li>`).join('\n')}
  </ol>
</li>`);
  });
  groups.push(`<li>
  <span class="kicker">Back matter</span>
  <ol class="chapters">
    <li>${tocRow(glossaryPage.id, 'Glossary', glossaryPage.folio)}</li>
    <li>${tocRow(indexPage.id, 'Index', indexPage.folio)}</li>
    <li>${tocRow(colophonPage.id, 'Colophon', colophonPage.folio)}</li>
  </ol>
</li>`);
  return `<ol class="toc">\n${indent(groups.join('\n'), 2)}\n</ol>`;
}

function renderGlossary() {
  const rows = [...terms].sort((a, b) => byName(a.term, b.term))
    .map(t => `  <div class="gl-e" id="${t.id}"><dt>${esc(t.term)}</dt><dd>${inline(t.definition, 'content/back/glossary.yml')}</dd></div>`);
  return `<dl class="glossary">\n${rows.join('\n')}\n</dl>`;
}

function locators(pages) {
  const sorted = [...pages].sort((a, b) => a.order - b.order);
  const runs = [];
  for (const p of sorted) {
    const last = runs.at(-1);
    const n = Number(p.folio);
    if (last && Number.isInteger(n) && Number(last.at(-1).folio) === n - 1) last.push(p);
    else runs.push([p]);
  }
  return runs.map(r => `<a class="loc" href="#${r[0].id}">${r[0].folio}${r.length > 1 ? '–' + r.at(-1).folio : ''}</a>`).join(', ');
}

function renderIndex() {
  const idOf = head => 'e-' + slug(head);
  const xref = head => `<a class="xref" href="#${idOf(head)}">${esc(head)}</a>`;
  const letters = new Map();
  for (const head of [...index.keys()].sort(byName)) {
    const letter = head[0].toUpperCase();
    if (!letters.has(letter)) letters.set(letter, []);
    letters.get(letter).push(head);
  }
  const seen = new Set();
  const sections = [...letters].map(([letter, heads]) => {
    const items = heads.map(head => {
      const e = index.get(head);
      const id = idOf(head);
      if (seen.has(id)) fail('index', `two entries share the anchor “${id}”`);
      seen.add(id);
      if (e.see) return `<li class="entry" id="${id}"><p class="head">${esc(head)}. <em>See</em> ${xref(e.see)}</p></li>`;
      const also = e.seeAlso?.length ? `<em>See also</em> ${e.seeAlso.map(xref).join('; ')}` : '';
      const subs = [...e.subs].sort(([a], [b]) => byName(a, b))
        .map(([sub, pages]) => `    <li>${esc(sub)}, ${locators(pages)}</li>`);
      let headLine = esc(head) + (e.pages.length ? ', ' + locators(e.pages) : '');
      if (also && !subs.length) headLine += `. ${also}`;
      else if (also) subs.push(`    <li>${also}</li>`);
      if (!subs.length) return `<li class="entry" id="${id}"><p class="head">${headLine}</p></li>`;
      return `<li class="entry" id="${id}">\n  <p class="head">${headLine}</p>\n  <ul class="subs">\n${subs.join('\n')}\n  </ul>\n</li>`;
    });
    return `<section class="letter" id="${letter}" aria-label="${letter}">
  <h3>${letter}</h3>
  <ul class="entries">
${indent(items.join('\n'), 4)}
  </ul>
</section>`;
  });
  const thumbs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
    .map(l => (letters.has(l) ? `<a href="#${l}">${l}</a>` : `<span aria-hidden="true">${l}</span>`)).join('');
  return { thumbs, sections: sections.join('\n\n') };
}

// ——— The page ———

const css = (await readFile(path.join(ROOT, 'src/style.css'), 'utf8')).trimEnd();
const js = (await readFile(path.join(ROOT, 'src/book.js'), 'utf8')).trimEnd();

const partsHtml = [];
for (const [i, part] of parts.entries()) partsHtml.push(await renderPart(part, i));
const prefaceHtml = await renderBlocks(preface.blocks, preface.file, { firstClass: 'first drop' });
const whatsNewHtml = whatsNew ? await renderBlocks(whatsNew.blocks, whatsNew.file, { firstClass: 'first' }) : '';
const colophonHtml = await renderBlocks(colophon.blocks, colophon.file);
const { thumbs, sections: indexHtml } = renderIndex();
const glossaryHtml = renderGlossary();
const edition = `Printed on the web at ${esc(new URL(book.url).host)}. ${esc(book.edition)} edition, ${esc(book.year)}${
  book.app_version ? `, describing Mooligan ${esc(book.app_version)}` : ''}.`;
const E = book.epigraph;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(book.name)}</title>
<meta name="description" content="${esc(book.description)}">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#f4f1ea" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#141412" media="(prefers-color-scheme: dark)">
<link rel="canonical" href="${esc(book.url)}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta property="og:type" content="book">
<meta property="og:url" content="${esc(book.url)}">
<meta property="og:title" content="${esc(book.name)}">
<meta property="og:description" content="${esc(book.og_description ?? book.description)}">
<meta property="og:image" content="${esc(new URL('og.png', book.url))}">
<meta name="twitter:card" content="summary_large_image">
<!-- Generated by scripts/build.mjs from content/. Edit the content, not this file. -->
<style>
${indent(css, 2)}
</style>
<script>document.documentElement.classList.add('js');</script>
</head>
<body>

<div class="runhead smallcaps">
  <a href="#contents"><span class="brand-long">${esc(book.name)}</span><span class="brand-short">Contents</span></a>
  <span class="where" aria-hidden="true"><span id="rh-title"></span><span class="n" id="rh-folio"></span></span>
</div>

<div class="sheet">

<header class="title-page" id="cover">
  <a class="ribbon" id="ribbon" href="#contents" aria-label="Open to the contents"><span></span></a>
  <div class="runner smallcaps"><span>${esc(new URL(book.url).host)} · ${esc(book.edition)} Edition</span></div>
  <div class="tp">
    <div>
      <span class="the smallcaps">The</span>
      <h1>${esc(book.title)}</h1>
      <span class="companion smallcaps">Companion</span>
      <p class="subtitle">${inline(book.subtitle, 'content/book.yml')}</p>
    </div>
    <div class="tp-side" id="${epigraphPage.id}" data-folio="${epigraphPage.folio}" data-head="Epigraph">
      <blockquote>
        <p>${inline(E.text, 'content/book.yml')}</p>
        <cite class="smallcaps">${esc(E.source)}</cite>
      </blockquote>${E.aside ? `\n      <p class="aside">${inline(E.aside, 'content/book.yml')}</p>` : ''}
      ${pips('all', parts.length)}
    </div>
  </div>
</header>

<main>

<div class="front section">
  <section id="contents" data-head="Contents">
${indent(band({ id: contentsPage.id, folio: contentsPage.folio, kicker: 'Front matter', title: 'Contents', small: true }), 4)}
${indent(renderContents(), 4)}
  </section>

  <section class="preface" data-head="Preface">
${indent(band({ id: prefacePage.id, folio: prefacePage.folio, kicker: 'Front matter', title: preface.data.title ?? 'Preface', small: true }), 4)}
${indent(prefaceHtml, 4)}
  </section>
</div>
${whatsNew ? `
<section class="section whats-new" data-head="${esc(whatsNew.data.title ?? 'What’s New')}">
${indent(band({ id: whatsNewPage.id, folio: whatsNewPage.folio, kicker: whatsNew.data.version ? `Mooligan ${whatsNew.data.version}` : 'Front matter', title: whatsNew.data.title ?? 'What’s New', small: true }), 2)}
  <div class="cols">
${indent(whatsNewHtml, 4)}
  </div>
</section>
` : ''}
${partsHtml.join('\n\n')}

<section class="section" data-head="Glossary">
${indent(band({ id: glossaryPage.id, folio: glossaryPage.folio, kicker: 'Back matter', title: 'Glossary', small: true }), 2)}
${indent(glossaryHtml, 2)}
</section>

<section class="section" id="index" data-head="Index">
${indent(band({ id: indexPage.id, folio: indexPage.folio, kicker: 'Back matter', title: 'Index', small: true }), 2)}

  <nav class="thumbs smallcaps" aria-label="Index letters">
    ${thumbs}
  </nav>

  <div class="index-cols">
${indent(indexHtml, 4)}
  </div>
</section>

</main>

<section class="section colophon" aria-label="Colophon" data-head="Colophon">
${indent(band({ id: colophonPage.id, folio: colophonPage.folio, kicker: 'Back matter', title: colophon.data.title ?? 'Colophon', small: true }), 2)}
  <div class="cols">
${indent(colophonHtml, 4)}
    <p>${edition}</p>
  </div>
  <div class="finis">
    ${pips('all', parts.length)}
    <p>Here ends ${esc(book.name.replace(/^The /, 'the '))}.</p>
    <a class="smallcaps" href="#cover">Mulligan to the beginning ↑</a>
  </div>
</section>

</div>

<script>
${js}
</script>
</body>
</html>
`;

for (const t of terms) if (!usedTerms.has(t.id)) warn('content/back/glossary.yml', `“${t.term}” is never linked from the text`);

// ——— Write dist/ ———

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
await cp(path.join(ROOT, 'public'), OUT, { recursive: true });
if (existsSync(path.join(ROOT, 'media'))) await cp(path.join(ROOT, 'media'), path.join(OUT, 'media'), { recursive: true });
await writeFile(path.join(OUT, 'index.html'), html);

for (const w of warnings) console.warn(`warning  ${w}`);
console.log(`Built ${rel(OUT)}/index.html: ${parts.length} parts, ${chapterNumber} chapters, ${figureNumber} figures, ` +
  `${index.size} index entries, ${colophonPage.folio} pages.`);
