# Naming Template Engine — Design Spec (Issue #5)

**Date:** 2026-05-08
**Status:** Approved
**Scope:** Sprint 5 — standalone module consumed by import pipeline (#4)

---

## Goal

Let the user define how games and their files are named on disk after import, following the Sonarr/Radarr naming-scheme philosophy.

---

## Architecture

```
shared/
  naming-engine.ts        ← NEW: renderTemplate, sanitizeFilename, previewAll, GameContext
  title-utils.ts          ← EXISTING: parseReleaseMetadata (provides group/version/platform/source)
  schema.ts               ← ADD: folderNamingTemplate + fileNamingTemplate columns

server/
  routes.ts               ← ADD: GET/PATCH /api/naming/template, POST /api/naming/preview
  import-pipeline.ts      ← UPDATE: renderGameFolderName uses renderTemplate; planImport applies fileNamingTemplate

migrations/
  0007_naming_templates.sql

client/src/pages/
  settings.tsx            ← ADD: "Media Management" tab
```

`naming-engine.ts` lives in `shared/` (no Node.js dependencies) so the client can import `renderTemplate` directly for live preview without API round-trips.

---

## Supported Template Variables (Sprint 5)

| Variable     | Source                                                                               |
| ------------ | ------------------------------------------------------------------------------------ |
| `{Title}`    | `game.title` (IGDB)                                                                  |
| `{TitleThe}` | `game.title` with leading "The" moved to end: `"The Witcher 3"` → `"Witcher 3, The"` |
| `{Year}`     | `new Date(game.releaseDate).getUTCFullYear()`                                        |
| `{Platform}` | `parseReleaseMetadata(downloadTitle).platform`                                       |
| `{Version}`  | `parseReleaseMetadata(downloadTitle).version`                                        |
| `{Group}`    | `parseReleaseMetadata(downloadTitle).group`                                          |
| `{Source}`   | `parseReleaseMetadata(downloadTitle).drm`                                            |

`{Edition}` and `{Quality}` are reserved identifiers (no-op, always empty) — deferred to quality profiles sprint.

---

## Module: `shared/naming-engine.ts`

### Types

```ts
export interface GameContext {
  title: string;
  year: number | null;
  platform?: string;
  version?: string;
  group?: string;
  source?: string;
}

export interface PreviewResult {
  input: GameContext;
  output: string;
}
```

### `renderTemplate(template: string, ctx: GameContext): string`

1. Build a lookup map from `ctx` including `TitleThe` derived from `title`.
2. Replace every `{VAR}` token with its value or `""` if absent/undefined.
3. Clean up artifacts from empty substitutions:
   - Collapse multiple spaces to one.
   - Remove empty bracket pairs: `()`, `[]`, `{}`.
   - Remove trailing/leading separators (`-`, ` `, `.`).
4. Return the cleaned string.

### `sanitizeFilename(name: string, os: 'windows' | 'posix'): string`

- **windows:** strip `< > : " / \ | ? *`, C0 control chars (0x00–0x1F), trailing `.` or space.
- **posix:** strip `/` and `\0` only.
- Truncate to 200 characters (safe on all common filesystems).

### `previewAll(template: string, samples: GameContext[]): PreviewResult[]`

Maps over `samples`, calls `renderTemplate` then `sanitizeFilename('windows')` on each. Returns `{ input, output }[]`.

---

## Database

### Migration `0007_naming_templates.sql`

```sql
ALTER TABLE user_settings
  ADD COLUMN folder_naming_template TEXT NOT NULL DEFAULT '{Title} ({Year})';
ALTER TABLE user_settings
  ADD COLUMN file_naming_template TEXT NOT NULL DEFAULT '{Title} ({Year}) [{Group}]';
```

### `shared/schema.ts` additions

Two `text` columns with `.notNull().default(...)` added to the `userSettings` table definition. `updateUserSettingsSchema` automatically picks them up via `createInsertSchema(...).partial()`.

---

## API

All endpoints require authentication (existing `authenticateToken` middleware).

### `GET /api/naming/template`

Returns the current user's naming templates.

**Response 200:**

```json
{
  "folderNamingTemplate": "{Title} ({Year})",
  "fileNamingTemplate": "{Title} ({Year}) [{Group}]"
}
```

### `PATCH /api/naming/template`

Updates one or both templates.

**Body (Zod-validated):**

```ts
z.object({
  folderNamingTemplate: z.string().max(200).optional(),
  fileNamingTemplate: z.string().max(200).optional(),
});
```

**Security:** reject templates containing `..`, absolute path separators outside of `{VAR}` tokens, to prevent path traversal during import.

**Response 200:** updated `{ folderNamingTemplate, fileNamingTemplate }`

### `POST /api/naming/preview`

Stateless. Renders template against provided samples.

**Body:**

```ts
z.object({
  template: z.string().max(200),
  samples: z.array(GameContextSchema).max(10),
});
```

**Response 200:**

```json
{
  "results": [
    {
      "input": { "title": "Elden Ring", "year": 2022, "group": "CODEX" },
      "output": "Elden Ring (2022) [CODEX]"
    }
  ]
}
```

---

## Import Pipeline Changes (`server/import-pipeline.ts`)

### `buildGameContext(game, downloadTitle?)` — new helper

Constructs a `GameContext` from a `Game` row and an optional release name string.
`parseReleaseMetadata(downloadTitle)` provides `group`, `version`, `platform`, `source`.
If `downloadTitle` is absent, those fields are `undefined`.

### `renderGameFolderName` → delegate to template engine

Becomes async (was sync). Signature: `renderGameFolderName(game, folderTemplate): string` — the caller (`processCompletedDownload`) fetches the template from settings and passes it in, keeping the function pure and testable without a DB call.

```ts
export function renderGameFolderName(
  game: Game,
  folderTemplate: string,
  downloadTitle?: string
): string {
  const ctx = buildGameContext(game, downloadTitle);
  return sanitizeFilename(renderTemplate(folderTemplate, ctx), "windows");
}
```

### `planImport` — updated signature

```ts
export async function planImport(
  sourcePath: string,
  game: Game,
  rootFolder: RootFolder,
  options?: {
    folderTemplate?: string;
    fileTemplate?: string;
    downloadTitle?: string;
  }
): Promise<ImportPlan>;
```

`options` defaults: `folderTemplate = '{Title} ({Year})'`, `fileTemplate = '{Title} ({Year}) [{Group}]'`.

Folder dest: `renderGameFolderName(game, folderTemplate, downloadTitle)`.
File dest per entry: `sanitizeFilename(renderTemplate(fileTemplate, ctx), 'windows') + ext` where `ext` is the original file extension. Falls back to original filename if the rendered stem is empty.

### `processCompletedDownload` — fetch templates once

Fetches `folderNamingTemplate` and `fileNamingTemplate` from `storage.getUserSettings(game.userId)` at the top of the function (after resolving `game`) and passes them down to `planImport` via `options`. Falls back to defaults if `userId` is null or settings not found.

---

## UI — Settings → "Media Management" tab

**New tab** added to the existing `<Tabs>` in `settings.tsx`.

**Layout:**

- **Folder Naming** — `<Input>` + preset `<Select>` + live preview line
- **File Naming** — `<Input>` + preset `<Select>` + live preview line (shows extension)
- **Variable Reference** — non-interactive chips displaying all supported `{VAR}` tokens
- **Save Changes** — `<Button>` calling `PATCH /api/naming/template`

**Live preview** is computed client-side by importing `renderTemplate` from `shared/naming-engine.ts`. Fixed sample: `{ title: "Elden Ring", year: 2022, platform: "PC", group: "CODEX", source: "GOG", version: "v1.0.2" }`.

**Preset dropdown options (both inputs):**

1. `{Title} ({Year})`
2. `{Title} ({Year}) [{Source}]`
3. `{TitleThe} ({Year})`
4. `{Title}`

---

## Testing

- Unit tests in `server/__tests__/naming-engine.test.ts`:
  - `renderTemplate`: unicode titles, very long titles, missing fields, all-empty context, `{TitleThe}` with and without leading "The"
  - `sanitizeFilename`: Windows reserved chars, control chars, trailing dot, 200-char truncation
  - `previewAll`: multiple samples, empty template
- Integration: `PATCH /api/naming/template` rejects path-traversal templates
- Import pipeline: `planImport` produces correctly renamed output paths when a non-default template is set

---

## Out of Scope (This Sprint)

- `{Edition}` extraction
- `{Quality}` (deferred to quality profiles)
- Conditional template syntax (`{Year?}`, `{{#Group}}`)
- Per-game template overrides
