# Teaching Tools — project notes for Claude

A monorepo of small, **single-file** classroom tools for teachers, deployed as a
static site via **GitHub Pages** from the repo root.

## Layout
- `index.html` — the homepage / launcher (links to every tool).
- `tools/pdf-tools/index.html` — a sub-launcher: the home page's *PDF Tools* card opens it, and every PDF tool lives
  in its own folder beneath it (`tools/pdf-tools/<tool-name>/index.html`).
- `tools/<tool-name>/index.html` — one self-contained tool per folder. Each tool
  must run offline by double-click: inline all CSS/JS, no CDNs, no web fonts, no
  network requests.
- `STYLE_GUIDE.md` — the canonical design system. New tools copy its `:root`
  token block and base components (tokens are inlined per tool, not linked).
- `.nojekyll` — serve files as-is on GitHub Pages.

## Conventions
- Match the style guide: forest-green primary (`--board`), amber accent
  (`--accent`), monospace for data, uppercase tracked labels.
- Keep every tool dependency-free and portable.

## Commit / PR rules — IMPORTANT
- **Never include Claude session links** in commit messages, PR descriptions,
  code, comments, or any other artifact. No `Claude-Session:` trailer and no
  `https://claude.ai/code/session…` URLs anywhere. (Plain co-author attribution
  is fine.)
- **Push finished work straight to `main`** — standing instruction from the repo
  owner, no need to ask each time. Work on a branch if you like, but land it on
  `main` when it's done and tested. (Solo project; `main` is what GitHub Pages
  serves.)
