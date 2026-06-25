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
- **Exception — Sudoku** (`tools/games/sudoku/`): by request, this tool is split
  across files for readability instead of being a single inlined file. `index.html`
  is an HTML+CSS shell that loads `sudoku.js` (the game) and `techniques/*.js` (one
  self-registering solving technique per file — see `techniques/README.md`). Keep
  them as **classic `<script src>` scripts** (not ES modules) so the folder still
  runs offline by double-click; no CDNs/network. Don't re-inline it back to one file.

## Commit / PR rules — IMPORTANT
- **Never include Claude session links** in commit messages, PR descriptions,
  code, comments, or any other artifact. No `Claude-Session:` trailer and no
  `https://claude.ai/code/session…` URLs anywhere. (Plain co-author attribution
  is fine.)
