# Naming Template Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a configurable naming template engine (issue #5) so users can control how game folders and files are named on disk after import.

**Architecture:** A pure `shared/naming-engine.ts` module (regex-replace approach, zero deps) is imported by both server routes and the React client. DB gains two template columns on `user_settings`. The import pipeline's `renderGameFolderName`/`planImport` delegate to the engine. A new "Media Management" settings tab exposes the UI.

**Tech Stack:** TypeScript, Drizzle ORM + SQLite (better-sqlite3), Express, React + TanStack Query, shadcn/ui, Vitest + supertest

---

## File Map

| Action     | Path                                       | Responsibility                                                                                                      |
| ---------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Create     | `migrations/0007_naming_templates.sql`     | ALTER TABLE adds two template columns                                                                               |
| Modify     | `migrations/meta/_journal.json`            | Register migration entry                                                                                            |
| Modify     | `shared/schema.ts`                         | Add columns to Drizzle table def                                                                                    |
| **Create** | `shared/naming-engine.ts`                  | `renderTemplate`, `sanitizeFilename`, `previewAll`, `GameContext`, default constants                                |
| **Create** | `server/__tests__/naming-engine.test.ts`   | Unit tests for naming-engine                                                                                        |
| **Create** | `server/__tests__/naming-routes.test.ts`   | API tests for naming endpoints                                                                                      |
| Modify     | `server/routes.ts`                         | Add `GET/PATCH /api/naming/template`, `POST /api/naming/preview`                                                    |
| Modify     | `server/import-pipeline.ts`                | `buildGameContext` helper, updated `renderGameFolderName`, updated `planImport`, updated `processCompletedDownload` |
| **Create** | `server/__tests__/naming-pipeline.test.ts` | Unit tests for pipeline helpers                                                                                     |
| Modify     | `client/src/pages/settings.tsx`            | New "Media Management" tab with live preview                                                                        |

---

## Task 1: DB Migration + Schema

**Files:**

- Create: `migrations/0007_naming_templates.sql`
- Modify: `migrations/meta/_journal.json`
- Modify: `shared/schema.ts`

- [ ] **Step 1: Create migration SQL**

Create `migrations/0007_naming_templates.sql`:

```sql
ALTER TABLE user_settings ADD COLUMN folder_naming_template TEXT NOT NULL DEFAULT '{Title} ({Year})';
--> statement-breakpoint
ALTER TABLE user_settings ADD COLUMN file_naming_template TEXT NOT NULL DEFAULT '{Title} ({Year}) [{Group}]';
```

- [ ] **Step 2: Register migration in journal**

In `migrations/meta/_journal.json`, append to the `"entries"` array (after the existing `0006_import_tasks` entry):

```json
{
  "idx": 7,
  "version": "6",
  "when": 1746734400000,
  "tag": "0007_naming_templates",
  "breakpoints": true
}
```

- [ ] **Step 3: Add columns to Drizzle schema**

In `shared/schema.ts`, inside `export const userSettings = sqliteTable("user_settings", { ... })`, add two lines after the `xrelP2pReleases` column (around line 31):

```ts
  folderNamingTemplate: text("folder_naming_template").notNull().default("{Title} ({Year})"),
  fileNamingTemplate: text("file_naming_template")
    .notNull()
    .default("{Title} ({Year}) [{Group}]"),
```

No additional Zod schemas needed — `updateUserSettingsSchema` is built via `createInsertSchema(...).omit(...).partial()` and will automatically include the two new columns.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add migrations/0007_naming_templates.sql migrations/meta/_journal.json shared/schema.ts
git commit -m "feat(schema): add folderNamingTemplate and fileNamingTemplate to user_settings (#5)"
```

---

## Task 2: `shared/naming-engine.ts` (TDD)

**Files:**

- Create: `server/__tests__/naming-engine.test.ts`
- Create: `shared/naming-engine.ts`

- [ ] **Step 1: Write the failing tests**

Create `server/__tests__/naming-engine.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  renderTemplate,
  sanitizeFilename,
  previewAll,
  DEFAULT_FOLDER_TEMPLATE,
  DEFAULT_FILE_TEMPLATE,
  type GameContext,
} from "../../shared/naming-engine.js";

const ELDEN_RING: GameContext = {
  title: "Elden Ring",
  year: 2022,
  platform: "PC",
  version: "v1.0.2",
  group: "CODEX",
  source: "GOG",
};

describe("renderTemplate", () => {
  it("substitutes all defined variables", () => {
    expect(renderTemplate("{Title} ({Year}) [{Group}]", ELDEN_RING)).toBe(
      "Elden Ring (2022) [CODEX]"
    );
  });

  it("removes empty [] when group is absent", () => {
    const ctx: GameContext = { title: "Elden Ring", year: 2022 };
    expect(renderTemplate("{Title} ({Year}) [{Group}]", ctx)).toBe("Elden Ring (2022)");
  });

  it("removes empty () when year is null", () => {
    const ctx: GameContext = { title: "Elden Ring", year: null };
    expect(renderTemplate("{Title} ({Year})", ctx)).toBe("Elden Ring");
  });

  it("TitleThe moves leading 'The' to the end", () => {
    const ctx: GameContext = { title: "The Witcher 3", year: 2015 };
    expect(renderTemplate("{TitleThe} ({Year})", ctx)).toBe("Witcher 3, The (2015)");
  });

  it("TitleThe is unchanged when title has no leading 'The'", () => {
    expect(renderTemplate("{TitleThe}", ELDEN_RING)).toBe("Elden Ring");
  });

  it("handles unicode titles without corruption", () => {
    const ctx: GameContext = { title: "サイバーパンク 2077", year: 2020 };
    expect(renderTemplate("{Title} ({Year})", ctx)).toBe("サイバーパンク 2077 (2020)");
  });

  it("collapses multiple spaces when several variables are empty", () => {
    const ctx: GameContext = { title: "Game", year: null };
    expect(renderTemplate("{Title} {Platform} ({Year})", ctx)).toBe("Game");
  });

  it("keeps unknown tokens verbatim", () => {
    expect(renderTemplate("{Title} {Unknown}", ELDEN_RING)).toBe("Elden Ring {Unknown}");
  });

  it("Edition and Quality always resolve to empty (deferred)", () => {
    expect(renderTemplate("{Title} [{Edition}] [{Quality}]", ELDEN_RING)).toBe("Elden Ring");
  });

  it("DEFAULT_FOLDER_TEMPLATE renders correctly", () => {
    expect(renderTemplate(DEFAULT_FOLDER_TEMPLATE, ELDEN_RING)).toBe("Elden Ring (2022)");
  });

  it("DEFAULT_FILE_TEMPLATE renders correctly", () => {
    expect(renderTemplate(DEFAULT_FILE_TEMPLATE, ELDEN_RING)).toBe("Elden Ring (2022) [CODEX]");
  });
});

describe("sanitizeFilename — windows", () => {
  it("strips Windows-illegal characters", () => {
    expect(sanitizeFilename('Game: A "Subtitle" <test> | x', "windows")).toBe(
      "Game A Subtitle test  x"
    );
  });

  it("strips trailing dot and space", () => {
    expect(sanitizeFilename("Game name.  ", "windows")).toBe("Game name");
  });

  it("strips C0 control characters", () => {
    expect(sanitizeFilename("Game\x00Name\x1f", "windows")).toBe("GameName");
  });

  it("truncates to 200 characters", () => {
    expect(sanitizeFilename("A".repeat(300), "windows").length).toBe(200);
  });
});

describe("sanitizeFilename — posix", () => {
  it("strips only forward slash and null byte", () => {
    expect(sanitizeFilename("Game: A/B\x00C", "posix")).toBe("Game: ABC");
  });

  it("preserves colons and other special chars on posix", () => {
    expect(sanitizeFilename('Game: "Part 2"', "posix")).toBe('Game: "Part 2"');
  });
});

describe("previewAll", () => {
  it("returns one rendered output per sample", () => {
    const results = previewAll("{Title} ({Year})", [
      ELDEN_RING,
      { title: "Hades", year: 2020, group: "FLT" },
    ]);
    expect(results).toHaveLength(2);
    expect(results[0].output).toBe("Elden Ring (2022)");
    expect(results[1].output).toBe("Hades (2020)");
  });

  it("input reference is preserved in result", () => {
    const results = previewAll("{Title}", [ELDEN_RING]);
    expect(results[0].input).toBe(ELDEN_RING);
  });

  it("applies windows sanitization to outputs", () => {
    const results = previewAll("{Title}", [{ title: "Game: Part 2", year: null }]);
    expect(results[0].output).toBe("Game Part 2");
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run server/__tests__/naming-engine.test.ts
```

Expected: FAIL with `Cannot find module '../../shared/naming-engine.js'`.

- [ ] **Step 3: Implement `shared/naming-engine.ts`**

Create `shared/naming-engine.ts`:

```ts
export const DEFAULT_FOLDER_TEMPLATE = "{Title} ({Year})";
export const DEFAULT_FILE_TEMPLATE = "{Title} ({Year}) [{Group}]";

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

function titleThe(title: string): string {
  return /^the\s+/i.test(title) ? title.replace(/^the\s+/i, "") + ", The" : title;
}

export function renderTemplate(template: string, ctx: GameContext): string {
  const vars: Record<string, string> = {
    Title: ctx.title ?? "",
    TitleThe: titleThe(ctx.title ?? ""),
    Year: ctx.year != null ? String(ctx.year) : "",
    Platform: ctx.platform ?? "",
    Version: ctx.version ?? "",
    Group: ctx.group ?? "",
    Source: ctx.source ?? "",
    Edition: "",
    Quality: "",
  };

  let result = template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? vars[key] : match
  );

  result = result
    .replace(/\(\s*\)/g, "")
    .replace(/\[\s*\]/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s\-_.]+|[\s\-_.]+$/g, "");

  return result;
}

// eslint-disable-next-line no-control-regex
const WIN_ILLEGAL = /[<>:"/\\|?*\x00-\x1f]/g;
const WIN_TRAILING = /[. ]+$/;

export function sanitizeFilename(name: string, os: "windows" | "posix"): string {
  let s = name;
  if (os === "windows") {
    s = s.replace(WIN_ILLEGAL, "").replace(WIN_TRAILING, "");
  } else {
    // eslint-disable-next-line no-control-regex
    s = s.replace(/[/\x00]/g, "");
  }
  return s.slice(0, 200);
}

export function previewAll(template: string, samples: GameContext[]): PreviewResult[] {
  return samples.map((input) => ({
    input,
    output: sanitizeFilename(renderTemplate(template, input), "windows"),
  }));
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run server/__tests__/naming-engine.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/naming-engine.ts server/__tests__/naming-engine.test.ts
git commit -m "feat(naming): add naming-engine module with renderTemplate, sanitizeFilename, previewAll (#5)"
```

---

## Task 3: API Routes (TDD)

**Files:**

- Create: `server/__tests__/naming-routes.test.ts`
- Modify: `server/routes.ts`

- [ ] **Step 1: Write failing API tests**

Create `server/__tests__/naming-routes.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";
import { registerRoutes } from "../routes.js";
import { storage } from "../storage.js";
import type { User, UserSettings } from "../../shared/schema.js";

const DEFAULT_SETTINGS: Partial<UserSettings> = {
  folderNamingTemplate: "{Title} ({Year})",
  fileNamingTemplate: "{Title} ({Year}) [{Group}]",
};

vi.mock("../storage.js", () => ({
  storage: {
    getUserSettings: vi.fn().mockResolvedValue(DEFAULT_SETTINGS),
    updateUserSettings: vi
      .fn()
      .mockImplementation((_id, updates) => Promise.resolve({ ...DEFAULT_SETTINGS, ...updates })),
    createUserSettings: vi.fn().mockResolvedValue(DEFAULT_SETTINGS),
    getUserGames: vi.fn().mockResolvedValue([]),
    searchUserGames: vi.fn().mockResolvedValue([]),
    addGame: vi.fn(),
    removeGame: vi.fn(),
    getUser: vi.fn(),
    getUserByUsername: vi.fn(),
    countUsers: vi.fn().mockResolvedValue(1),
    registerSetupUser: vi.fn(),
    setSystemConfig: vi.fn(),
    getSystemConfig: vi.fn(),
    assignOrphanGamesToUser: vi.fn(),
    updateGameStatus: vi.fn(),
    updateGameHidden: vi.fn(),
    getRootFolders: vi.fn().mockResolvedValue([]),
    getEnabledRootFolders: vi.fn().mockResolvedValue([]),
    getIndexers: vi.fn().mockResolvedValue([]),
    getDownloaders: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../auth.js", async () => {
  const actual = await vi.importActual("../auth.js");
  return {
    ...actual,
    authenticateToken: (req: Request, _res: Response, next: NextFunction) => {
      (req as Request).user = { id: "user-1", username: "testuser" } as unknown as User;
      next();
    },
  };
});

vi.mock("../db.js", () => ({ db: { select: vi.fn(), run: vi.fn(), get: vi.fn() } }));
vi.mock("../igdb.js", () => ({
  igdbClient: { searchGames: vi.fn(), getPopularGames: vi.fn(), formatGameData: vi.fn((g) => g) },
}));
vi.mock("../prowlarr.js", () => ({ prowlarrClient: {} }));
vi.mock("../rss.js", () => ({ rssService: { startPolling: vi.fn() } }));
vi.mock("../downloaders.js", () => ({ DownloaderManager: { getDownloaders: vi.fn() } }));
vi.mock("../socket.js", () => ({ setupWebSocket: vi.fn() }));
vi.mock("../logger.js", () => ({
  routesLogger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
  igdbLogger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));
vi.mock("../ssl.js", () => ({ sslService: {} }));
vi.mock("../search.js", () => ({ searchAllIndexers: vi.fn() }));
vi.mock("../xrel.js", () => ({ xrelClient: {}, DEFAULT_XREL_BASE: "", ALLOWED_XREL_DOMAINS: [] }));
vi.mock("../config.js", () => ({ config: { igdb: { configured: false } } }));
vi.mock("../config-loader.js", () => ({
  configLoader: { getConfig: vi.fn().mockResolvedValue({}) },
}));
vi.mock("../cron.js", () => ({}));
vi.mock("../import-pipeline.js", () => ({}));
vi.mock("../torznab.js", () => ({ torznabClient: {} }));
vi.mock("../ssrf.js", () => ({ isSafeUrl: vi.fn().mockReturnValue(true), safeFetch: vi.fn() }));
vi.mock("../middleware.js", () => ({
  igdbRateLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  sensitiveEndpointLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  authRateLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  validateRequest: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  sanitizeSearchQuery: (_req: unknown, _res: unknown, next: () => void) => next(),
  sanitizeGameId: (_req: unknown, _res: unknown, next: () => void) => next(),
  sanitizeIgdbId: (_req: unknown, _res: unknown, next: () => void) => next(),
  sanitizeGameStatus: (_req: unknown, _res: unknown, next: () => void) => next(),
  sanitizeGameData: (_req: unknown, _res: unknown, next: () => void) => next(),
  sanitizeIndexerData: (_req: unknown, _res: unknown, next: () => void) => next(),
  sanitizeIndexerUpdateData: (_req: unknown, _res: unknown, next: () => void) => next(),
  sanitizeDownloaderData: (_req: unknown, _res: unknown, next: () => void) => next(),
  sanitizeDownloaderUpdateData: (_req: unknown, _res: unknown, next: () => void) => next(),
  sanitizeDownloaderDownloadData: (_req: unknown, _res: unknown, next: () => void) => next(),
  sanitizeRootFolderData: (_req: unknown, _res: unknown, next: () => void) => next(),
  sanitizeRootFolderUpdateData: (_req: unknown, _res: unknown, next: () => void) => next(),
  sanitizeIndexerSearchQuery: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

let app: express.Express;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.mocked(storage.getUserSettings).mockResolvedValue(DEFAULT_SETTINGS as UserSettings);
  vi.mocked(storage.updateUserSettings).mockImplementation((_id, updates) =>
    Promise.resolve({ ...DEFAULT_SETTINGS, ...updates } as UserSettings)
  );
  app = express();
  app.use(express.json());
  await registerRoutes(app);
});

describe("GET /api/naming/template", () => {
  it("returns folderNamingTemplate and fileNamingTemplate from settings", async () => {
    const res = await request(app).get("/api/naming/template");
    expect(res.status).toBe(200);
    expect(res.body.folderNamingTemplate).toBe("{Title} ({Year})");
    expect(res.body.fileNamingTemplate).toBe("{Title} ({Year}) [{Group}]");
  });

  it("creates default settings when none exist", async () => {
    vi.mocked(storage.getUserSettings).mockResolvedValueOnce(undefined);
    vi.mocked(storage.createUserSettings).mockResolvedValueOnce(DEFAULT_SETTINGS as UserSettings);
    const res = await request(app).get("/api/naming/template");
    expect(res.status).toBe(200);
    expect(storage.createUserSettings).toHaveBeenCalledWith({ userId: "user-1" });
  });
});

describe("PATCH /api/naming/template", () => {
  it("updates folderNamingTemplate", async () => {
    const res = await request(app)
      .patch("/api/naming/template")
      .send({ folderNamingTemplate: "{Title}" });
    expect(res.status).toBe(200);
    expect(storage.updateUserSettings).toHaveBeenCalledWith("user-1", {
      folderNamingTemplate: "{Title}",
    });
  });

  it("rejects template containing ..", async () => {
    const res = await request(app)
      .patch("/api/naming/template")
      .send({ folderNamingTemplate: "{Title}/../escape" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/path traversal/i);
  });

  it("rejects template starting with /", async () => {
    const res = await request(app)
      .patch("/api/naming/template")
      .send({ fileNamingTemplate: "/absolute/{Title}" });
    expect(res.status).toBe(400);
  });

  it("rejects template longer than 200 chars", async () => {
    const res = await request(app)
      .patch("/api/naming/template")
      .send({ folderNamingTemplate: "A".repeat(201) });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/naming/preview", () => {
  it("returns rendered preview for each sample", async () => {
    const res = await request(app)
      .post("/api/naming/preview")
      .send({
        template: "{Title} ({Year})",
        samples: [{ title: "Elden Ring", year: 2022 }],
      });
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0].output).toBe("Elden Ring (2022)");
  });

  it("rejects more than 10 samples", async () => {
    const samples = Array.from({ length: 11 }, (_, i) => ({ title: `Game ${i}`, year: 2020 }));
    const res = await request(app)
      .post("/api/naming/preview")
      .send({ template: "{Title}", samples });
    expect(res.status).toBe(400);
  });

  it("rejects template longer than 200 chars", async () => {
    const res = await request(app)
      .post("/api/naming/preview")
      .send({ template: "A".repeat(201), samples: [] });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run server/__tests__/naming-routes.test.ts
```

Expected: FAIL — endpoints return 404 (not yet implemented).

- [ ] **Step 3: Add import in `server/routes.ts`**

At the top of `server/routes.ts`, add after the existing imports (around line 70):

```ts
import { previewAll, type GameContext } from "../shared/naming-engine.js";
```

- [ ] **Step 4: Add Zod schemas and helper in `server/routes.ts`**

Right after the `storageCache` block (around line 80), add:

```ts
const updateNamingTemplateSchema = z.object({
  folderNamingTemplate: z.string().max(200).optional(),
  fileNamingTemplate: z.string().max(200).optional(),
});

const gameContextSchema = z.object({
  title: z.string(),
  year: z.number().int().nullable(),
  platform: z.string().optional(),
  version: z.string().optional(),
  group: z.string().optional(),
  source: z.string().optional(),
});

const previewRequestSchema = z.object({
  template: z.string().max(200),
  samples: z.array(gameContextSchema).max(10),
});

function isTemplateSafe(template: string): boolean {
  return !template.includes("..") && !/^[/\\]/.test(template) && !/^[A-Za-z]:/.test(template);
}
```

- [ ] **Step 5: Add the three endpoints in `server/routes.ts`**

Inside the `registerRoutes` function, right after the `PATCH /api/settings` block (after line ~2623), add:

```ts
app.get("/api/naming/template", authenticateToken, async (req, res) => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userId = (req as any).user.id;
    let settings = await storage.getUserSettings(userId);
    if (!settings) {
      settings = await storage.createUserSettings({ userId });
    }
    res.json({
      folderNamingTemplate: settings.folderNamingTemplate,
      fileNamingTemplate: settings.fileNamingTemplate,
    });
  } catch (error) {
    routesLogger.error({ error }, "error fetching naming templates");
    res.status(500).json({ error: "Failed to fetch naming templates" });
  }
});

app.patch("/api/naming/template", authenticateToken, async (req, res) => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userId = (req as any).user.id;
    const updates = updateNamingTemplateSchema.parse(req.body);

    if (updates.folderNamingTemplate && !isTemplateSafe(updates.folderNamingTemplate)) {
      return res.status(400).json({ error: "Invalid template: path traversal detected" });
    }
    if (updates.fileNamingTemplate && !isTemplateSafe(updates.fileNamingTemplate)) {
      return res.status(400).json({ error: "Invalid template: path traversal detected" });
    }

    let settings = await storage.getUserSettings(userId);
    if (!settings) {
      settings = await storage.createUserSettings({ userId, ...updates });
    } else {
      settings = await storage.updateUserSettings(userId, updates);
    }

    if (!settings) {
      return res.status(404).json({ error: "Settings not found" });
    }

    res.json({
      folderNamingTemplate: settings.folderNamingTemplate,
      fileNamingTemplate: settings.fileNamingTemplate,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid template data", details: error.errors });
    }
    routesLogger.error({ error }, "error updating naming templates");
    res.status(500).json({ error: "Failed to update naming templates" });
  }
});

app.post("/api/naming/preview", authenticateToken, async (req, res) => {
  try {
    const { template, samples } = previewRequestSchema.parse(req.body);
    const results = previewAll(template, samples as GameContext[]);
    res.json({ results });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid preview request", details: error.errors });
    }
    routesLogger.error({ error }, "error generating naming preview");
    res.status(500).json({ error: "Failed to generate preview" });
  }
});
```

- [ ] **Step 6: Run tests to confirm they pass**

```bash
npx vitest run server/__tests__/naming-routes.test.ts
```

Expected: all tests PASS.

- [ ] **Step 7: Run full test suite to check for regressions**

```bash
npx vitest run
```

Expected: no new failures.

- [ ] **Step 8: Commit**

```bash
git add server/routes.ts server/__tests__/naming-routes.test.ts
git commit -m "feat(api): add GET/PATCH /api/naming/template and POST /api/naming/preview (#5)"
```

---

## Task 4: Import Pipeline Refactor

**Files:**

- Create: `server/__tests__/naming-pipeline.test.ts`
- Modify: `server/import-pipeline.ts`

- [ ] **Step 1: Write failing tests for `buildGameContext` and `renderGameFolderName`**

Create `server/__tests__/naming-pipeline.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { buildGameContext, renderGameFolderName } from "../import-pipeline.js";
import type { Game } from "../../shared/schema.js";

// vi.mock calls are hoisted by Vitest above all imports at runtime
vi.mock("../db.js", () => ({ db: {} }));
vi.mock("../storage.js", () => ({ storage: {} }));
vi.mock("../downloaders.js", () => ({ DownloaderManager: {} }));
vi.mock("../library-scanner.js", () => ({ classifyFile: vi.fn() }));
vi.mock("../logger.js", () => ({
  igdbLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  routesLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const BASE_GAME: Game = {
  id: "g1",
  userId: "u1",
  igdbId: 1,
  title: "Elden Ring",
  summary: null,
  coverUrl: null,
  releaseDate: "2022-02-25",
  rating: null,
  platforms: [],
  genres: [],
  publishers: [],
  developers: [],
  screenshots: [],
  status: "wanted",
  originalReleaseDate: null,
  releaseStatus: "released",
  hidden: false,
  addedAt: new Date(),
  completedAt: null,
};

describe("buildGameContext", () => {
  it("builds context from game with releaseDate", () => {
    const ctx = buildGameContext(BASE_GAME);
    expect(ctx.title).toBe("Elden Ring");
    expect(ctx.year).toBe(2022);
    expect(ctx.group).toBeUndefined();
  });

  it("extracts group/version/platform/source from downloadTitle", () => {
    const ctx = buildGameContext(BASE_GAME, "Elden.Ring-CODEX");
    expect(ctx.group).toBe("CODEX");
  });

  it("year is null when releaseDate is absent", () => {
    const ctx = buildGameContext({ ...BASE_GAME, releaseDate: null });
    expect(ctx.year).toBeNull();
  });

  it("title falls back to Unknown when game.title is empty", () => {
    const ctx = buildGameContext({ ...BASE_GAME, title: "" });
    expect(ctx.title).toBe("Unknown");
  });
});

describe("renderGameFolderName", () => {
  it("renders folder name using template", () => {
    expect(renderGameFolderName(BASE_GAME, "{Title} ({Year})")).toBe("Elden Ring (2022)");
  });

  it("uses downloadTitle to populate group", () => {
    expect(renderGameFolderName(BASE_GAME, "{Title} [{Group}]", "Elden.Ring-CODEX")).toBe(
      "Elden Ring [CODEX]"
    );
  });

  it("omits year bracket when year is null", () => {
    expect(renderGameFolderName({ ...BASE_GAME, releaseDate: null }, "{Title} ({Year})")).toBe(
      "Elden Ring"
    );
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run server/__tests__/naming-pipeline.test.ts
```

Expected: FAIL — `buildGameContext` and updated `renderGameFolderName` signatures do not exist yet.

- [ ] **Step 3: Update imports in `server/import-pipeline.ts`**

Replace the existing import block at the top (lines 22–36) with:

```ts
import fs from "fs";
import path from "path";
import { storage } from "./storage.js";
import { DownloaderManager } from "./downloaders.js";
import { igdbLogger, routesLogger } from "./logger.js";
import { cleanReleaseName, parseReleaseMetadata } from "../shared/title-utils.js";
import { classifyFile } from "./library-scanner.js";
import {
  renderTemplate,
  sanitizeFilename,
  DEFAULT_FOLDER_TEMPLATE,
  DEFAULT_FILE_TEMPLATE,
  type GameContext,
} from "../shared/naming-engine.js";
import type {
  Game,
  ImportStrategy,
  ImportTask,
  RootFolder,
  Downloader,
  InsertGameFile,
} from "../shared/schema.js";
```

- [ ] **Step 4: Replace `SAFE_CHARS` + `renderGameFolderName` with new helpers**

Remove the `SAFE_CHARS` constant and the old `renderGameFolderName` function (lines 52–70 in the original file). Replace them with:

```ts
// ---------- Naming ----------

export function buildGameContext(game: Game, downloadTitle?: string): GameContext {
  const year = game.releaseDate ? new Date(game.releaseDate).getUTCFullYear() : null;
  const meta = downloadTitle ? parseReleaseMetadata(downloadTitle) : undefined;
  return {
    title: game.title || "Unknown",
    year: year && !Number.isNaN(year) ? year : null,
    platform: meta?.platform,
    version: meta?.version,
    group: meta?.group,
    source: meta?.drm,
  };
}

export function renderGameFolderName(
  game: Game,
  folderTemplate: string,
  downloadTitle?: string
): string {
  return sanitizeFilename(
    renderTemplate(folderTemplate, buildGameContext(game, downloadTitle)),
    "windows"
  );
}
```

- [ ] **Step 5: Update `planImport` signature and body**

Replace the existing `planImport` function (lines 184–215 in original) with:

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
): Promise<ImportPlan> {
  const folderTemplate = options?.folderTemplate ?? DEFAULT_FOLDER_TEMPLATE;
  const fileTemplate = options?.fileTemplate ?? DEFAULT_FILE_TEMPLATE;
  const downloadTitle = options?.downloadTitle;

  const targetDirRelative = renderGameFolderName(game, folderTemplate, downloadTitle);
  const ctx = buildGameContext(game, downloadTitle);
  const files = await listFilesRecursively(sourcePath);

  const sourceStat = await fs.promises.stat(sourcePath);
  const sourceRoot = sourceStat.isDirectory() ? sourcePath : path.dirname(sourcePath);

  const plan: ImportFilePlan[] = [];
  for (const f of files) {
    if (classifyFile(f.absolute) === "ignore") continue;

    let relativeToSource: string;
    if (sourceStat.isFile()) {
      relativeToSource = path.basename(f.absolute);
    } else {
      relativeToSource = path.relative(sourceRoot, f.absolute);
    }

    const ext = path.extname(relativeToSource);
    const subdir = path.dirname(relativeToSource);
    const renderedStem = sanitizeFilename(renderTemplate(fileTemplate, ctx), "windows");
    const filename = (renderedStem || path.basename(relativeToSource, ext)) + ext;
    const newRelative = subdir === "." ? filename : path.join(subdir, filename);

    plan.push({
      sourceAbsolute: f.absolute,
      targetRelative: path.join(targetDirRelative, newRelative),
      sizeBytes: f.sizeBytes,
    });
  }

  return { rootFolder, targetDirRelative, files: plan };
}
```

- [ ] **Step 6: Update `processCompletedDownload`**

In `processCompletedDownload`, after the two `Promise.all` lines that resolve `game` and `downloader` (around line 381), add:

```ts
const namingSettings = game.userId ? await storage.getUserSettings(game.userId) : null;
const folderTemplate = namingSettings?.folderNamingTemplate ?? DEFAULT_FOLDER_TEMPLATE;
const fileTemplate = namingSettings?.fileNamingTemplate ?? DEFAULT_FILE_TEMPLATE;
```

Then replace the `previewTargetRelative` line (around line 406):

```ts
// Before (old):
const previewTargetRelative = game.title
  ? renderGameFolderName(game)
  : cleanReleaseName(gameDownload.downloadTitle);

// After (new):
const previewTargetRelative = game.title
  ? renderGameFolderName(game, folderTemplate, gameDownload.downloadTitle)
  : cleanReleaseName(gameDownload.downloadTitle);
```

Then replace the `planImport` call (around line 447):

```ts
// Before (old):
const plan = await planImport(sourcePath, game, rootFolder);

// After (new):
const plan = await planImport(sourcePath, game, rootFolder, {
  folderTemplate,
  fileTemplate,
  downloadTitle: gameDownload.downloadTitle,
});
```

- [ ] **Step 7: Update `__testing` export at the bottom of the file**

```ts
export const __testing = { renderGameFolderName, planImport, buildGameContext };
```

- [ ] **Step 8: Run tests to confirm they pass**

```bash
npx vitest run server/__tests__/naming-pipeline.test.ts
```

Expected: all tests PASS.

- [ ] **Step 9: Run full test suite**

```bash
npx vitest run
```

Expected: no regressions.

- [ ] **Step 10: Commit**

```bash
git add server/import-pipeline.ts server/__tests__/naming-pipeline.test.ts
git commit -m "feat(import): use naming-engine in planImport and renderGameFolderName (#5)"
```

---

## Task 5: Settings UI — "Media Management" Tab

**Files:**

- Modify: `client/src/pages/settings.tsx`

- [ ] **Step 1: Add `renderTemplate` import**

At the top of `client/src/pages/settings.tsx`, add after the existing imports:

```ts
import {
  renderTemplate,
  DEFAULT_FOLDER_TEMPLATE,
  DEFAULT_FILE_TEMPLATE,
} from "@shared/naming-engine";
import type { GameContext } from "@shared/naming-engine";
```

- [ ] **Step 2: Add naming state variables**

Inside `SettingsPage`, after the `xrelP2pReleases` state (around line 90), add:

```ts
const [folderNamingTemplate, setFolderNamingTemplate] = useState(DEFAULT_FOLDER_TEMPLATE);
const [fileNamingTemplate, setFileNamingTemplate] = useState(DEFAULT_FILE_TEMPLATE);
```

- [ ] **Step 3: Sync naming state from fetched settings**

Inside the `useEffect` that syncs `userSettings` (around line 93), add inside the `if (userSettings)` block:

```ts
setFolderNamingTemplate(userSettings.folderNamingTemplate ?? DEFAULT_FOLDER_TEMPLATE);
setFileNamingTemplate(userSettings.fileNamingTemplate ?? DEFAULT_FILE_TEMPLATE);
```

- [ ] **Step 4: Add save mutation and preview sample**

After the existing mutations (around line 200, after other mutation declarations), add:

```ts
const NAMING_SAMPLE: GameContext = {
  title: "Elden Ring",
  year: 2022,
  platform: "PC",
  group: "CODEX",
  source: "GOG",
  version: "v1.0.2",
};

const FOLDER_PRESETS = [
  { label: "{Title} ({Year})", value: "{Title} ({Year})" },
  { label: "{Title} ({Year}) [{Source}]", value: "{Title} ({Year}) [{Source}]" },
  { label: "{TitleThe} ({Year})", value: "{TitleThe} ({Year})" },
  { label: "{Title}", value: "{Title}" },
];

const FILE_PRESETS = [
  { label: "{Title} ({Year}) [{Group}]", value: "{Title} ({Year}) [{Group}]" },
  { label: "{Title} ({Year})", value: "{Title} ({Year})" },
  { label: "{Title} [{Group}]", value: "{Title} [{Group}]" },
  { label: "{Title}", value: "{Title}" },
];

const saveNamingMutation = useMutation({
  mutationFn: (data: { folderNamingTemplate?: string; fileNamingTemplate?: string }) =>
    apiRequest("PATCH", "/api/naming/template", data),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
    toast({ title: "Naming templates saved" });
  },
  onError: () => {
    toast({ title: "Failed to save naming templates", variant: "destructive" });
  },
});
```

- [ ] **Step 5: Expand the Tabs grid and add the new trigger**

Find this line (around line 465):

```tsx
          <TabsList className="grid w-full grid-cols-6 mb-8">
```

Change `grid-cols-6` to `grid-cols-7`:

```tsx
          <TabsList className="grid w-full grid-cols-7 mb-8">
```

Then add the new trigger after the existing six `<TabsTrigger>` elements (after the `system` trigger, around line 471):

```tsx
<TabsTrigger value="media-management">Media Management</TabsTrigger>
```

- [ ] **Step 6: Add the tab content**

After the last `</TabsContent>` closing tag (after the `security` tab, around line 1050), add:

```tsx
<TabsContent value="media-management" className="space-y-6">
  <Card>
    <CardHeader>
      <CardTitle>Naming Templates</CardTitle>
      <CardDescription>
        Define how game folders and files are named on disk after import. Uses{" "}
        <code className="text-xs bg-muted px-1 rounded">{"{Variable}"}</code> tokens.
      </CardDescription>
    </CardHeader>
    <CardContent className="space-y-6">
      {/* Folder Template */}
      <div className="space-y-2">
        <Label htmlFor="folder-template">Folder Naming</Label>
        <div className="flex gap-2">
          <Input
            id="folder-template"
            value={folderNamingTemplate}
            onChange={(e) => setFolderNamingTemplate(e.target.value)}
            placeholder="{Title} ({Year})"
            className="font-mono"
          />
          <Select value="" onValueChange={(v) => setFolderNamingTemplate(v)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Presets…" />
            </SelectTrigger>
            <SelectContent>
              {FOLDER_PRESETS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-sm text-muted-foreground font-mono">
          Preview:{" "}
          <span className="text-foreground">
            {renderTemplate(folderNamingTemplate || DEFAULT_FOLDER_TEMPLATE, NAMING_SAMPLE) || "—"}
          </span>
        </p>
      </div>

      {/* File Template */}
      <div className="space-y-2">
        <Label htmlFor="file-template">File Naming</Label>
        <div className="flex gap-2">
          <Input
            id="file-template"
            value={fileNamingTemplate}
            onChange={(e) => setFileNamingTemplate(e.target.value)}
            placeholder="{Title} ({Year}) [{Group}]"
            className="font-mono"
          />
          <Select value="" onValueChange={(v) => setFileNamingTemplate(v)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Presets…" />
            </SelectTrigger>
            <SelectContent>
              {FILE_PRESETS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-sm text-muted-foreground font-mono">
          Preview:{" "}
          <span className="text-foreground">
            {renderTemplate(fileNamingTemplate || DEFAULT_FILE_TEMPLATE, NAMING_SAMPLE) || "—"}
            .iso
          </span>
        </p>
      </div>

      {/* Variable Reference */}
      <div className="space-y-2">
        <Label>Available Variables</Label>
        <div className="flex flex-wrap gap-2">
          {[
            "{Title}",
            "{TitleThe}",
            "{Year}",
            "{Platform}",
            "{Version}",
            "{Group}",
            "{Source}",
          ].map((v) => (
            <code
              key={v}
              className="text-xs bg-muted px-2 py-1 rounded cursor-pointer hover:bg-muted/80"
              onClick={() => {
                const active = document.activeElement as HTMLInputElement | null;
                if (active?.id === "folder-template") {
                  setFolderNamingTemplate((t) => t + v);
                } else {
                  setFileNamingTemplate((t) => t + v);
                }
              }}
            >
              {v}
            </code>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Click a variable to append it to the focused input field.
        </p>
      </div>

      <Button
        onClick={() => saveNamingMutation.mutate({ folderNamingTemplate, fileNamingTemplate })}
        disabled={saveNamingMutation.isPending}
      >
        {saveNamingMutation.isPending ? "Saving…" : "Save Changes"}
      </Button>
    </CardContent>
  </Card>
</TabsContent>
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8: Run full test suite**

```bash
npx vitest run
```

Expected: no regressions.

- [ ] **Step 9: Manual UI verification**

Start the dev server: `npm run dev`

1. Navigate to Settings → Media Management tab.
2. Confirm folder and file template inputs are pre-filled from DB defaults.
3. Edit the folder template to `{TitleThe} ({Year})` — preview should update live to `"Ring, Elden (2022)"`. _(Wait — sample title is "Elden Ring", so TitleThe gives "Elden Ring" — no "The" prefix. Change sample note: try template `{Title} [{Source}]` → preview shows `"Elden Ring [GOG]"`)_
4. Select a preset from the dropdown — input should update to match.
5. Click a variable chip — it appends the variable to the active input.
6. Click Save Changes — toast "Naming templates saved" appears.
7. Refresh the page — templates persist (fetched from DB).

- [ ] **Step 10: Commit**

```bash
git add client/src/pages/settings.tsx
git commit -m "feat(ui): add Media Management tab with naming template live preview (#5)"
```

---

## Post-Implementation

- [ ] **Close issue #5 on GitHub**

```bash
gh issue comment 5 --repo Mikurunazume/Gamearr --body "## Résultat

Naming template engine implémenté :
- \`shared/naming-engine.ts\` : renderTemplate, sanitizeFilename, previewAll
- Migration 0007 : colonnes folderNamingTemplate + fileNamingTemplate
- API : GET/PATCH /api/naming/template, POST /api/naming/preview
- Import pipeline : renderGameFolderName et planImport utilisent les templates
- UI : onglet Media Management dans Settings avec live preview"

gh issue close 5 --repo Mikurunazume/Gamearr
```
