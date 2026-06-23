#!/usr/bin/env node
/*
 * Re-theme the vendored Movie Picker into the Teaching Tools tool.
 *
 * The upstream project (EthanPullan/MoviePicker) is vendored *pristine* at
 * vendor/moviepicker/ via `git subtree` (see SYNC.md). This script reads that
 * untouched source and re-applies the Teaching Tools theme on top of it, writing
 * the final single-file tool to tools/movie-picker/index.html.
 *
 * Workflow:
 *   git subtree pull --prefix vendor/moviepicker movie-picker main --squash
 *   node scripts/sync-movie-picker.mjs
 *
 * Keeping our edits in this transform (instead of editing the served file by
 * hand) means subtree pulls never conflict: vendor/ stays pristine, and the
 * theme is reproducible on every update.
 *
 * The transform is anchor-based and FAILS LOUDLY if an anchor is missing — that
 * surfaces upstream restructuring instead of silently producing a broken file.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'vendor', 'moviepicker', 'index.html');
const OUT = join(root, 'tools', 'movie-picker', 'index.html');

if (!existsSync(SRC)) {
  console.error(
    `\n  Vendored source not found: ${SRC}\n` +
    `  Add it first (from a machine with git access to the repo):\n\n` +
    `    git remote add movie-picker https://github.com/EthanPullan/MoviePicker.git\n` +
    `    git subtree add --prefix vendor/moviepicker movie-picker main --squash\n\n` +
    `  Then re-run this script. See SYNC.md.\n`
  );
  process.exit(1);
}

let html = readFileSync(SRC, 'utf8');

/* Replace exactly once; throw if the anchor is gone (upstream drifted). */
function replaceOnce(from, to, label) {
  if (typeof from === 'string') {
    if (!html.includes(from)) throw new Error(`Anchor not found: ${label}`);
    html = html.replace(from, to);
  } else {
    if (!from.test(html)) throw new Error(`Anchor not found: ${label}`);
    html = html.replace(from, to);
  }
}

/* 1. Offline: drop all Google Fonts <link> tags (preconnect + stylesheet). */
const fontLinks = /[ \t]*<link[^>]*fonts\.(?:googleapis|gstatic)[^>]*>\r?\n/gi;
if (!fontLinks.test(html)) throw new Error('Anchor not found: Google Fonts links');
html = html.replace(fontLinks, '');

/* 2. Head: Teaching Tools title, description, theme-color, favicon. */
replaceOnce(
  '<title>Now Showing — Movie Vote</title>',
  '<meta name="description" content="A cinema-style movie voting board — tap the titles you want, move them to the ballot, cast votes, and let the weighted Surprise me draw pick the winner. Runs in your browser, works offline.">\n' +
  '<meta name="theme-color" content="#1f3d35">\n' +
  '<title>Movie Picker — Now Showing</title>\n' +
  "<link rel=\"icon\" href=\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Crect width='16' height='16' rx='4' fill='%23e0982e'/%3E%3C/svg%3E\">",
  'head meta block'
);

/* 3. Tokens: add the Teaching Tools chrome tokens at the top of :root. */
replaceOnce(
  '  :root{\n',
  '  :root{\n' +
  '    /* Teaching Tools chrome (toolbar) — matches the main site */\n' +
  '    --panel:#ffffff; --panel-2:#f4f6f8;\n' +
  '    --ink:#16241f; --muted:#67756f; --line:#d8dee2;\n' +
  '    --board:#1f3d35; --board-2:#173029; --accent:#e0982e;\n' +
  '    --sans:ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;\n',
  ':root open'
);

/* 4. Body font: use the Teaching Tools sans stack for non-theme text. */
replaceOnce(
  '    --body:"Outfit", system-ui, -apple-system, "Segoe UI", sans-serif;',
  '    --body:var(--sans);',
  '--body token'
);

/* 5. Move the page padding off <body> so the toolbar can be full-bleed. */
replaceOnce(
  'background-attachment:fixed; padding:clamp(22px,3.5vw,52px); -webkit-font-smoothing:antialiased;',
  'background-attachment:fixed; -webkit-font-smoothing:antialiased;',
  'body padding'
);

/* 6. Toolbar CSS + padded .wrap (replaces the bare .wrap rule). */
const TOOLBAR_CSS =
`  /* ---------- Teaching Tools toolbar (matches the main site) ---------- */
  .toolbar{position:relative; z-index:5; display:flex; align-items:center; gap:14px; flex-wrap:wrap;
    padding:11px 20px; background:var(--panel); border-bottom:1px solid var(--line);
    font-family:var(--sans);}
  .brand{display:flex; align-items:center; gap:9px; font-weight:700; letter-spacing:.14em;
    text-transform:uppercase; font-size:13px; color:var(--ink); white-space:nowrap;}
  .brand .mark{width:16px; height:16px; border-radius:4px; background:var(--accent);
    box-shadow:inset 0 0 0 2px rgba(0,0,0,.06); flex:none;}
  .brand small{font-weight:500; letter-spacing:.02em; text-transform:none; color:var(--muted); font-size:11px;}
  .spacer{flex:1;}
  .home-link{display:inline-flex; align-items:center; gap:6px; text-decoration:none;
    border:1px solid var(--line); background:var(--panel); color:var(--ink);
    padding:6px 11px; border-radius:8px; font-size:12.5px; font-weight:600;
    transition:background .12s, border-color .12s;}
  .home-link:hover{background:var(--panel-2); border-color:var(--accent);}
  .home-link .arr{transition:transform .12s;}
  .home-link:hover .arr{transform:translateX(-3px);}

  .wrap{position:relative; z-index:1; max-width:1640px; margin:0 auto; padding:clamp(22px,3.5vw,52px);}`;
replaceOnce(
  '  .wrap{position:relative; z-index:1; max-width:1640px; margin:0 auto;}',
  TOOLBAR_CSS,
  '.wrap rule'
);

/* 7. Inject the toolbar markup between <body> and the page wrapper. */
const TOOLBAR_HTML =
`<body>

<header class="toolbar">
  <div class="brand"><span class="mark"></span>Movie Picker <small>movie night vote</small></div>
  <div class="spacer"></div>
  <a class="home-link" href="../../index.html"><span class="arr">←</span> All tools</a>
</header>

<div class="wrap">`;
replaceOnce('<body>\n<div class="wrap">', TOOLBAR_HTML, 'body open');

writeFileSync(OUT, html);
console.log(`Re-themed Movie Picker written to ${OUT}`);
