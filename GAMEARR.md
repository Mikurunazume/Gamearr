# Gamearr — Fork of Questarr

**Gamearr** is a hard fork of [Doezer/Questarr](https://github.com/Doezer/Questarr) that aims to be a **true *arr for PC games** — feature parity with Sonarr/Radarr for the core library/import workflow.

## Upstream

- Original project: https://github.com/Doezer/Questarr (GPL-3.0)
- This fork: https://github.com/Mikurunazume/Gamearr
- License: GPL-3.0 (inherited)

All Questarr features (IGDB discovery, Torznab/Newznab indexers, 5 download clients, RSS, xREL.to scene feed, cron jobs) are preserved. Gamearr **adds**:

## Roadmap

### Phase 1 — Foundation
- [ ] **Root folders** — manage multiple library paths (`/games`, `/games/gog`, `/games/retail`, etc.) via UI
- [ ] **Game files tracking** — new `game_files` table recording actual on-disk files per game (path, size, checksum)
- [ ] **Library scanner** — recursive walker on root folders → fuzzy match against IGDB → auto-mark games as `owned`

### Phase 2 — Import Pipeline
- [ ] **Naming template engine** — configurable templates like `{Title} ({Year}) [{Platform}] [{Group}]`
- [ ] **Post-download import** — when a download completes, auto-move (or hardlink) files from the download path to the correct root folder with proper naming
- [ ] **Import history** — traceable log of every import with retry on failure

### Phase 3 — Matching & Filters
- [ ] **Quality profiles** — tiered preferences (e.g., `1080p > 720p`, `Repack > Release`) applied to search results and auto-download
- [ ] **Unwanted words** — blacklist patterns filtered out of search results
- [ ] **Release blocklist** — block specific releases or groups permanently

## Why a fork?

Questarr is excellent for the **wishlist/tracker** side but intentionally leaves filesystem management to the user. Gamearr bridges that gap so the same app handles:

1. Discovery (Questarr) →
2. Search + download (Questarr) →
3. **Import + organize on disk (Gamearr new)** →
4. Library tracking with real file paths (Gamearr new)

## Docker

Gamearr ships as `ghcr.io/mikurunazume/gamearr:latest`, a drop-in replacement for `ghcr.io/doezer/questarr` with the same env vars and volume paths. No migration needed; the SQLite DB schema is backwards-compatible (Gamearr only adds tables).

## Contributing upstream

Fixes and generic features are PR'd back to Doezer/Questarr where applicable. Gamearr-specific features (library scanner, import pipeline) live only in this fork.
