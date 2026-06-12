# CLAUDE.md — Gamearr (dev autonome)

Monorepo TypeScript : `client/` (Vite + React + Tailwind/shadcn), `server/` (tsx + Drizzle/Postgres), `shared/`. App = gestionnaire de jeux vidéo (-arr), Postgres + IGDB, port 5000.

## Workflow autonome OBLIGATOIRE (mode non-interactif)

Tu es lancé via `claude -p` pour réaliser UN objectif décrit dans une issue. Étapes :

1. Lis l'objectif (passé dans le prompt + issue référencée). Reste DANS son périmètre.
2. Implémente le minimum qui résout l'objectif. Préceptes : changements chirurgicaux, simplicité, pas de refacto hors scope.
3. Vérifie en local, dans l'ordre, jusqu'au vert (≤ 3 tentatives de fix) :

```
npm ci
npm run check     # tsc
npm test          # vitest
npm run build     # vite + tsc
```

4. Commit conventionnel référençant l'issue : `feat(scope): … (#N)`.
5. Push la branche `auto/issue-N`, puis `gh pr create` (base `main`).
6. **NE MERGE PAS** — l'orchestrateur Hermes attend la CI verte et merge lui-même.

## Conditions d'arrêt (ne PAS insister)

Arrête-toi et émets un rapport `status:"blocked"` si : build/test KO après 3 fix, ambiguïté d'architecture hors scope, ou accès/secret externe manquant. Mets la question précise dans `blocker_question`.

## Sortie finale OBLIGATOIRE

Ton tout dernier message ne contient QUE ce bloc JSON (rien avant/après) :

```json
{"run_id":"issue-N","status":"success|blocked|failed","summary":"…","files_changed":["…"],"pr_url":"…","how_to_test":"…","blocker_question":""}
```
