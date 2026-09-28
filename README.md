# mooligan-website

The website for [Mooligan](https://github.com/missingems/Mooligan), served at **mooligan.com**.

It is one page, designed as the index at the back of a book. The index *is* the manual: entries are
alphabetical, sub-entries are indented, and each number is a page. Tapping a number opens that page
over the index; ← and → turn pages, Esc closes. With JavaScript off, the pages simply follow the index.

Plain static HTML — no build step, no dependencies.

| File | |
| --- | --- |
| `index.html` | The whole site: styles, index, pages and the small script that opens them. |
| `404.html` | “This page was never printed.” |
| `favicon.svg`, `apple-touch-icon.png`, `og.png` | Icons and the link-preview image. |
| `CNAME` | Custom domain for GitHub Pages. |

## Editing

**A page** is an `<article class="page" id="pN" data-section="…">` in the `The Pages` section of
`index.html`. The `id` is its page number, `data-section` is the running head shown on the open
page, and the order in the file is the order pages turn in.

**An entry** is an `<li class="entry">` inside its letter’s `<section>`:

```html
<li class="entry" id="e-filtering">
  <p class="head">filtering, <a class="loc" href="#p8">8–10</a></p>
  <ul class="subs">
    <li>by colour, <a class="loc" href="#p8">8</a></li>
    <li><em>See also</em> <a class="xref" href="#e-searching">searching</a></li>
  </ul>
</li>
```

`a.loc` is a page number (links to `#pN`); `a.xref` is a *see* / *see also* reference (links to
another entry’s `id`). Adding a new letter means adding its `<section class="letter" id="X">` and
turning its `<span>` in the letter row (`nav.thumbs`) into `<a href="#X">`.

Type is set in New York and SF Pro on Apple devices, falling back to Iowan Old Style / Georgia and the
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
