# mooligan-website

The website for [Mooligan](https://github.com/missingems/Mooligan), served at **mooligan.com**.

It is written as a small book, *The Mooligan Companion*: a guide to the app in five parts, one for
each colour of Magic, printed in one ink and set densely in columns.

| | Part | Chapters |
| --- | --- | --- |
| White | **The Table** | Starting a Game · Keeping Score · Ending a Game |
| Blue | **The Library** | Browsing · Searching · Filtering · The Card Page |
| Black | **The Ledger** | Printings · Prices · Pull Rates |
| Red | **The Eye** | The Scanner |
| Green | **The Field** | The Metagame · Decklists and Usage · Events |

A title page with the epigraph opens the book, then the contents and preface side by side (numbered in
roman). Each part has a banded header, and its chapters flow in up to three columns. After the parts
come a glossary, an index and a colophon, also in columns. A running head at the top shows the current
part and its pages, and the ribbon on the title page remembers where you were.

Plain static HTML, with no build step and no dependencies.

| File | |
| --- | --- |
| `index.html` | The whole book: styles, text, figures (inline SVG) and a short script for the running head and ribbon. |
| `404.html` | “This page was never printed.” |
| `favicon.svg`, `apple-touch-icon.png`, `og.png` | Icons and the link-preview image. |
| `CNAME` | Custom domain for GitHub Pages. |

## Editing

**Pages.** The page number of a chapter or section is its `data-folio`, and its `id` is `p` plus that
number (`id="p15" data-folio="15"`). The contents, the index and cross-references (`a.xr`) all link to
those ids, so if a page number changes, search for `#p15` and update the links too.

**Parts** are `<section class="part">`: a `header.band` (the filled circle in `.pips` marks which of
the five parts it is) followed by `div.cols` holding one `article.chapter` per chapter.

**Chapters** open with a `div.keep` (heading plus first paragraph, kept together across columns).
Sub-sections are run-in paragraphs: `<p class="sub" id="p16" data-folio="16"><span class="run">By
format.</span> …</p>`. Add `drop` to a first paragraph for a drop cap.

**Notes** are `<div class="note" role="note">`, placed where they should appear in the column.

**Glossary terms** are linked from the text with `<a class="gl" href="#g-term">`.

**Index entries** are `<li class="entry">` inside their letter’s section:

```html
<li class="entry" id="e-filtering">
  <p class="head">filtering, <a class="loc" href="#p15">15–17</a></p>
  <ul class="subs">
    <li>by colour, <a class="loc" href="#p15">15</a></li>
    <li><em>See also</em> <a class="xref" href="#e-searching">searching</a></li>
  </ul>
</li>
```

Type is set in New York and SF Pro on Apple devices, falling back to Iowan Old Style or Georgia and the
system sans elsewhere. Apple’s licence doesn’t allow serving SF fonts from a website, so none are
bundled.

## Preview

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

## Deploying to mooligan.com (GitHub Pages)

1. In the repository’s **Settings → Pages**, choose **Deploy from a branch**, branch `main`, folder `/ (root)`.
2. At your DNS provider, point the apex domain at GitHub Pages:
   - `A` records for `mooligan.com`: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - `AAAA` records (optional): `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153`
   - `CNAME` record for `www`: `missingems.github.io`
3. Back in **Settings → Pages**, once the domain check passes, tick **Enforce HTTPS**.

The `CNAME` file in this repository already sets the custom domain to `mooligan.com`.
