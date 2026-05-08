# Gamearr UI — Sonarr Alignment Design Spec

**Date:** 2026-05-08
**Status:** Approved
**Scope:** Full UI restructure to match Sonarr's navigation architecture and information design, using the existing shadcn/ui design system.

---

## Goal

Restructure Gamearr's navigation and pages to match Sonarr's UX architecture: grouped nav with dropdowns, dedicated Activity and System sections, enriched game detail page, and Settings as the single management hub. Discover and xREL/RSS are absorbed into existing sections rather than living as standalone nav items.

---

## Navigation Architecture

### Current → New

| Current                          | New                                            | Notes                                           |
| -------------------------------- | ---------------------------------------------- | ----------------------------------------------- |
| Dashboard `/`                    | **Library** `/library`                         | Dashboard absorbed into Library as default view |
| Library `/library`               | Library `/library`                             | Inchangé, gains sub-tabs                        |
| Discover `/discover`             | Library `/library?tab=discover`                | Onglet dans Library                             |
| Downloads `/downloads`           | **Activity > Queue** `/activity/queue`         | Renommé + enrichi                               |
| Calendar `/calendar`             | Calendar `/calendar`                           | Inchangé                                        |
| Wishlist `/wishlist`             | **Wanted** `/wanted`                           | Renommé + enrichi                               |
| xREL `/xrel`                     | Settings > Sources                             | Absorbé dans Settings                           |
| RSS `/rss`                       | Settings > Sources                             | Absorbé dans Settings                           |
| Indexers `/indexers`             | Settings > Indexers                            | Absorbé dans Settings                           |
| Downloaders `/downloaders`       | Settings > Download Clients                    | Absorbé dans Settings                           |
| Root Folders `/root-folders`     | Settings > Media Management                    | Absorbé dans Settings                           |
| Library Scan `/library-scan`     | Settings > Media Management                    | Absorbé dans Settings                           |
| Import History `/import-history` | **Activity > History** `/activity/history`     | Remplacé + enrichi                              |
| Settings `/settings`             | Settings `/settings`                           | Restructuré                                     |
| —                                | **Activity > Blacklist** `/activity/blacklist` | Nouveau                                         |
| —                                | **System** `/system`                           | Nouveau                                         |
| —                                | `/games/:id`                                   | Nouveau — fiche jeu page dédiée                 |

### Redirects à maintenir

```
/                 → /library
/downloads        → /activity/queue
/discover         → /library?tab=discover
/wishlist         → /wanted
/xrel             → /settings?tab=sources
/rss              → /settings?tab=sources
/indexers         → /settings?tab=indexers
/downloaders      → /settings?tab=downloaders
/root-folders     → /settings?tab=media
/library-scan     → /settings?tab=media
/import-history   → /activity/history
```

### Nouvelle sidebar (`AppSidebar.tsx`)

Un seul groupe, items avec sous-menus collapsibles (shadcn `Collapsible` dans `SidebarMenu`) :

```
🎮 Library              /library        badge: count owned+completed+downloading
📅 Calendar             /calendar
⬇ Activity             (collapsible)
    Queue               /activity/queue  badge: count active downloads
    History             /activity/history
    Blacklist           /activity/blacklist
⭐ Wanted               /wanted          badge: count wanted games
⚙ Settings             (collapsible)
    Media Management    /settings?tab=media
    Quality Profiles    /settings?tab=quality
    Indexers            /settings?tab=indexers
    Download Clients    /settings?tab=downloaders
    Sources             /settings?tab=sources
    Connect             /settings?tab=connect
    General             /settings?tab=general
🖥 System               /system
```

Footer : user info + logout (inchangé).

---

## Pages

### Library `/library`

Barre de navigation secondaire (tabs) sous le header :

```
All | Wanted | Downloading | Owned | Discover
```

- **All / Wanted / Downloading / Owned** : filtres rapides sur `game.status`, persistés en localStorage
- **Discover** : charge le contenu actuel de `discover.tsx` inline (composant `<DiscoverTab>` extrait)

Filtres latéraux (panel rétractable, persistés localStorage) :

- Platform (multi-select)
- Genre (multi-select)
- Release year range
- Sort by : Title / Release Date / Date Added / Rating

La vue par défaut devient Library (suppression de la page Dashboard). `StatsCard` et `Dashboard.tsx` sont réintégrés comme une section optionnelle en haut de la vue "All" ou supprimés — à décider lors de l'implémentation selon la taille.

---

### Game Detail Page `/games/:id`

**Remplace `GameDetailsModal.tsx`** — devient une page dédiée. Naviguer vers une fiche depuis la Library fait un `push('/games/:id')`.

Layout deux colonnes (lg+), une colonne (mobile) :

**Colonne gauche (280px fixe) :**

- Cover art (full width)
- Boutons d'action verticaux :
  - `Search` — déclenche recherche manuelle
  - `Refresh Metadata` — re-fetch IGDB
  - `Edit` — ouvre modal d'édition (root folder, quality profile, monitored)
  - `Delete` — supprime avec confirmation

**Colonne droite (flex) :**

```
[Title]  [Year]  [Rating ★]
[Genres chips]  [Platforms chips]

Status: [badge]   Root Folder: [path]   Quality Profile: [dropdown]
Monitored: [toggle]

─── Tabs ───────────────────────────────────
Files | History | Manual Search
```

**Tab Files :**
Table des fichiers `gameFiles` liés à ce jeu. Colonnes : filename, size, path relatif, date ajout. Actions par ligne : rename (applique template actuel), delete.

**Tab History :**
Events liés à ce jeu depuis `gameDownloads` + `importTasks`. Colonnes : date, action (Grabbed/Imported/Failed), release name, indexeur. Bouton "Blacklist" sur les lignes Failed.

**Tab Manual Search :**
Input de recherche (pré-rempli avec le titre du jeu), bouton Search. Résultats en table : release name, indexeur, taille, seeders/age, score qualité (badge tier si quality profiles actifs). Bouton Download par ligne.

---

### Activity > Queue `/activity/queue`

Table live, polling toutes les 10 secondes via `GET /api/activity/queue`.

Colonnes : Game title (lien vers `/games/:id`), Release name, Size, Progress (barre + %), Speed, Seeders/Peers, Client, ETA.

Si vide : `EmptyState` "No active downloads."

Actions par ligne :

- **Pause/Resume** — PATCH downloader API
- **Cancel** — supprime le download
- **Blacklist** — marque la release + cancel

---

### Activity > History `/activity/history`

Table paginée (50/page), `GET /api/activity/history?page=N&action=X&search=Y`.

Colonnes : Date, Game (lien), Release name, Indexer, Action badge (Grabbed/Imported/Failed/Deleted), Size.

Filtres en haut : search (release name ou game title), action multi-select, date range.

Clic sur une ligne → panel latéral de détail : chemin complet, hash, taille, raison d'échec (si Failed), client utilisé.

Bouton "Blacklist this release" sur les lignes Failed.

---

### Activity > Blacklist `/activity/blacklist`

Table des releases bloquées, `GET /api/activity/blacklist`.

Colonnes : Release name, Game (lien), Date blacklistée, Raison.

Action par ligne : **Remove** (DELETE `/api/activity/blacklist/:id`) — réautorise la release.

Bouton global : "Clear All" avec confirmation.

---

### Wanted `/wanted`

Remplace `wishlist.tsx`. `GET /api/games?status=wanted`.

Table (pas grid) : Title, Year, Platforms, Last Search, Status (Not Searched / Searching / Not Found).

Actions :

- Par ligne : **Search Now** — déclenche recherche manuelle
- Global : **Search All** — déclenche auto-search sur tous les wanted

Badge dans la nav = count wanted games.

---

### System `/system`

Trois onglets :

**Status :**
Cards : version Gamearr, uptime, DB size, dernier auto-search (timestamp), état de chaque download client configuré (green/red ping).

**Tasks :**
Table des tâches planifiées (auto-search, RSS sync, library scan). Colonnes : nom, intervalle, dernier run (timestamp + succès/échec), prochain run. Bouton "Run Now" par ligne (POST `/api/system/tasks/:id/run`).

**Logs :**
Dernières 500 lignes de logs server. Filtre par level (INFO/WARN/ERROR). Stream via WebSocket ou polling 5s. Bouton "Clear" (dev only).

---

## Settings Restructuré `/settings`

Tous les onglets dans une seule page, URL `?tab=<slug>` pour deep-link.

| Onglet           | Slug          | Contenu                                                                                                                                                |
| ---------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| General          | `general`     | IGDB credentials, intervalles, PUID/PGID — contenu actuel General                                                                                      |
| Media Management | `media`       | Naming templates (actuel) + Root Folders (déplacé depuis `/root-folders`) + Library Scan trigger (déplacé depuis `/library-scan`)                      |
| Quality Profiles | `quality`     | Issue #6                                                                                                                                               |
| Indexers         | `indexers`    | Contenu actuel `/indexers` inline                                                                                                                      |
| Download Clients | `downloaders` | Contenu actuel `/downloaders` inline                                                                                                                   |
| Sources          | `sources`     | xREL (toggles scene/p2p) + RSS feeds (liste + add) — fusion des pages xREL et RSS                                                                      |
| Connect          | `connect`     | Webhooks/notifications : Discord webhook URL, webhook générique, événements configurables (game grabbed, import success, import failed, game released) |
| UI               | `ui`          | Vue par défaut library (grid/table), thème (dark/light/system)                                                                                         |

### Onglet Sources (nouveau)

Section **xREL** : toggles `xrelSceneReleases` / `xrelP2pReleases` (déjà dans schema).

Section **RSS Feeds** : liste des flux RSS configurés avec enable/disable/delete. Bouton "Add Feed" → modal (URL, nom, intervalle). Contenu de `RssSettings.tsx` réintégré ici.

### Onglet Connect (nouveau)

Liste de connecteurs. Chaque connecteur a : nom, type (Discord / Webhook), URL, événements activés (checkboxes), bouton Test, bouton Delete.

**Discord webhook** : POST JSON `{ event, game, release }` vers l'URL configurée.

**Webhook générique** : même payload, configurable.

Stockage : nouvelle table `notification_connectors` (voir Backend).

---

## Backend — Nouveaux endpoints

### Activity

```
GET  /api/activity/queue
     → agrège downloads actifs depuis tous les clients configurés
     → [ { gameId, gameTitle, releaseName, size, progress, speed, seeders, client, eta } ]

GET  /api/activity/history?page=1&limit=50&action=&search=
     → paginé sur gameDownloads + importTasks joints à games
     → { items: [...], total, page, pages }

POST /api/activity/blacklist
     body: { releaseName, gameId, reason }
     → crée entrée blacklist, annule download si en cours

GET  /api/activity/blacklist
DELETE /api/activity/blacklist/:id
DELETE /api/activity/blacklist  (clear all)
```

### System

```
GET  /api/system/status
     → { version, uptime, dbSize, lastAutoSearch, downloaderHealth: [{name, ok}] }

GET  /api/system/tasks
     → [ { id, name, interval, lastRun, lastSuccess, nextRun } ]

POST /api/system/tasks/:id/run
     → déclenche la tâche immédiatement

GET  /api/system/logs?level=&limit=500
     → dernières N lignes de log (from in-memory ring buffer ou fichier)
```

### Notifications

```
GET    /api/connectors
POST   /api/connectors       body: { name, type, url, events[] }
PATCH  /api/connectors/:id
DELETE /api/connectors/:id
POST   /api/connectors/:id/test  → envoie payload de test
```

### DB Schema additions

```sql
-- Migration 0008_blacklist_connectors.sql

CREATE TABLE release_blacklist (
  id        TEXT PRIMARY KEY,
  game_id   TEXT REFERENCES games(id) ON DELETE CASCADE,
  release_name TEXT NOT NULL,
  reason    TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE notification_connectors (
  id      TEXT PRIMARY KEY,
  name    TEXT NOT NULL,
  type    TEXT NOT NULL CHECK(type IN ('discord','webhook')),
  url     TEXT NOT NULL,
  events  TEXT NOT NULL,  -- JSON array: ["grabbed","imported","failed","released"]
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

---

## File Map

| Action | Path                                         | Responsabilité                                                                                                                       |
| ------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Modify | `client/src/components/AppSidebar.tsx`       | Nouvelle nav avec collapsibles                                                                                                       |
| Modify | `client/src/main.tsx` (ou router)            | Nouvelles routes + redirects                                                                                                         |
| Modify | `client/src/pages/library.tsx`               | Sub-tabs + Discover intégré + filtres                                                                                                |
| Modify | `client/src/pages/settings.tsx`              | Nouveaux onglets Sources + Connect + UI ; intègre indexers/downloaders/root-folders/library-scan                                     |
| Modify | `client/src/pages/wishlist.tsx`              | Renommé en `wanted.tsx`, table enrichie                                                                                              |
| Delete | `client/src/pages/discover.tsx`              | Absorbé dans library.tsx                                                                                                             |
| Delete | `client/src/pages/xrel-releases.tsx`         | Absorbé dans settings Sources                                                                                                        |
| Delete | `client/src/pages/rss.tsx`                   | Absorbé dans settings Sources                                                                                                        |
| Delete | `client/src/pages/downloads.tsx`             | Remplacé par activity/queue                                                                                                          |
| Delete | `client/src/pages/import-history.tsx`        | Remplacé par activity/history                                                                                                        |
| Modify | `client/src/components/GameDetailsModal.tsx` | Refactorisé → page `/games/:id` (le composant modal est converti en page ; les usages inline du modal sont remplacés par navigation) |
| Create | `client/src/pages/game-detail.tsx`           | Nouvelle page dédiée                                                                                                                 |
| Create | `client/src/pages/activity-queue.tsx`        | Queue live                                                                                                                           |
| Create | `client/src/pages/activity-history.tsx`      | Historique paginé                                                                                                                    |
| Create | `client/src/pages/activity-blacklist.tsx`    | Blacklist releases                                                                                                                   |
| Create | `client/src/pages/system.tsx`                | Status + Tasks + Logs                                                                                                                |
| Create | `migrations/0008_blacklist_connectors.sql`   | Nouvelles tables                                                                                                                     |
| Modify | `shared/schema.ts`                           | `releaseBlacklist` + `notificationConnectors` tables                                                                                 |
| Modify | `server/routes.ts`                           | Nouveaux endpoints activity + system + connectors                                                                                    |
| Create | `server/notifications.ts`                    | Service d'envoi Discord/webhook                                                                                                      |
| Modify | `server/storage.ts`                          | CRUD blacklist + connectors                                                                                                          |

---

## Out of Scope

- Upgrade logic / cutoff (déféré, peu pertinent pour les jeux)
- Multi-utilisateur
- Bulk rename bibliothèque existante (phase suivante)
- Stats dashboard avancé (phase suivante)
- Sonarr visual design replication (on garde shadcn/ui)
