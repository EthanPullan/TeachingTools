# Syncing the Movie Picker with upstream

The **Movie Picker** tool is imported from a separate repo,
[`EthanPullan/MoviePicker`](https://github.com/EthanPullan/MoviePicker), and
re-themed to fit Teaching Tools (toolbar + tokens, web fonts removed for offline
use). This doc explains how to pull upstream changes in quickly.

## How it's wired

Because every tool here must be a **single self-contained offline file**, we
can't link to upstream at runtime — the code has to live in the repo. And because
we deliberately re-theme the file, we keep the two concerns separate:

| Path | Role | Edited by hand? |
|---|---|---|
| `vendor/moviepicker/` | **Pristine** upstream, vendored via `git subtree` | **No** — never edit |
| `scripts/sync-movie-picker.mjs` | Re-applies the Teaching Tools theme | Yes (when the theme changes) |
| `tools/movie-picker/index.html` | The served tool — **generated** output | No — regenerate instead |

Keeping `vendor/` pristine is what makes updates fast: `git subtree pull` never
conflicts, and the theme is re-applied deterministically by the script.

> The `git subtree` commands must be run from a machine with git access to the
> MoviePicker repo (e.g. a local clone). The hosted Claude Code environment is
> network-scoped to this repo only, so it can't fetch MoviePicker over git.

## First-time setup (once)

```bash
git remote add movie-picker https://github.com/EthanPullan/MoviePicker.git
git subtree add --prefix vendor/moviepicker movie-picker main --squash
node scripts/sync-movie-picker.mjs      # regenerate the themed tool
git add tools/movie-picker/index.html
git commit -m "Sync Movie Picker"
```

## Updating later (the fast path)

```bash
git subtree pull --prefix vendor/moviepicker movie-picker main --squash
node scripts/sync-movie-picker.mjs
git add vendor/moviepicker tools/movie-picker/index.html
git commit -m "Sync Movie Picker"
```

That's it — pull, regenerate, commit.

## If the script errors with "Anchor not found"

The re-theme is anchor-based and **fails loudly** rather than emitting a broken
file. An error means upstream moved or changed one of the spots the theme hooks
into (the `<head>`, the `:root` block, the `<body>` opening, the font `<link>`s,
or the `.wrap` rule). Open `scripts/sync-movie-picker.mjs`, update the matching
anchor string to the new upstream text, and re-run. Each step says which anchor
it's looking for.

## Changing the theme itself

Edit the toolbar markup / tokens / head block inside
`scripts/sync-movie-picker.mjs` (not the generated file), then re-run the script
so the change is reproducible on the next upstream pull.
