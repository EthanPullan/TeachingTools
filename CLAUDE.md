# Teaching Tools — project notes for Claude

A monorepo of small, **single-file** classroom tools for teachers, deployed as a
static site via **GitHub Pages** from the repo root.

## Layout
- `index.html` — the homepage / launcher (links to every tool).
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
