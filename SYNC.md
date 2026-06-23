# Syncing the Movie Picker with upstream

`tools/movie-picker/` is a **git subtree** of
[`EthanPullan/MoviePicker`](https://github.com/EthanPullan/MoviePicker). It's
vendored **as-is** — it keeps its own cinema theme, and there is no transform or
build step. Updates are a plain `git subtree pull`.

> The `git subtree` commands must be run from a machine with git access to the
> MoviePicker repo (e.g. a local clone). The hosted Claude Code environment is
> network-scoped to this repo only, so it can't fetch MoviePicker over git.

## One-time adoption

The file currently committed at `tools/movie-picker/index.html` is an interim
plain copy of upstream so the tool works today. To turn the folder into a real
subtree (which is what makes `pull` work), run once, locally:

```bash
git rm -r tools/movie-picker
git commit -m "Drop interim Movie Picker copy"

git remote add movie-picker https://github.com/EthanPullan/MoviePicker.git
git subtree add --prefix tools/movie-picker movie-picker main --squash
```

## Updating later (the fast path)

```bash
git fetch movie-picker
git subtree pull --prefix tools/movie-picker movie-picker main --squash
```

Pull, commit, done — no transform, so it should never conflict.

## Notes

- **Extra files come along.** Upstream ships `README.md` and
  `.github/workflows/deploy-pages.yml`; under the subtree they land at
  `tools/movie-picker/README.md` and `tools/movie-picker/.github/...`. Both are
  harmless here — GitHub Pages only runs workflows in the **repo root**
  `.github/workflows`, and the stray README doesn't affect the served page.
- **Offline caveat.** MoviePicker loads its fonts from Google Fonts (a CDN), so
  this one tool does **not** meet the repo's "runs offline / no CDN / no web
  fonts" guarantee. Because it's a *pure* subtree we don't patch that here — if
  you want it offline, make the fix **upstream** in MoviePicker (inline or drop
  the web fonts) and it'll flow in on the next pull.
