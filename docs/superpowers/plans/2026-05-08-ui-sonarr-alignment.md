# Gamearr UI — Sonarr Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure Gamearr's navigation and pages to match Sonarr's UX architecture — grouped collapsible sidebar, Activity section (Queue/History/Blacklist), Wanted page, System page, enriched Game Detail page, and Settings as the single management hub.

**Architecture:** New DB tables (release_blacklist, notification_connectors) feed new Activity/Connectors APIs. The sidebar is rewritten with collapsible Activity+Settings submenus. Old standalone pages (Downloads, Wishlist, xREL, RSS, Indexers, etc.) are replaced or absorbed into the new structure. Wouter redirects handle backwards compatibility.

**Tech Stack:** React + Wouter v3 + TanStack Query + shadcn/ui (Sidebar, Tabs, Collapsible) + Express + Drizzle ORM + better-sqlite3 + Vitest

**Spec:** `docs/superpowers/specs/2026-05-08-ui-sonarr-alignment-design.md`

---

## Task 1: DB Migration 0008 + Schema additions

**Files:**

- Create: `migrations/0008_blacklist_connectors.sql`
- Modify: `shared/schema.ts`

- [ ] **Step 1: Write the migration file**

```sql
-- migrations/0008_blacklist_connectors.sql
CREATE TABLE release_blacklist (
  id TEXT PRIMARY KEY,
  game_id TEXT REFERENCES games(id) ON DELETE CASCADE,
  release_name TEXT NOT NULL,
  reason TEXT,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE notification_connectors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('discord','webhook')),
  url TEXT NOT NULL,
  events TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

- [ ] **Step 2: Add Drizzle table definitions to `shared/schema.ts`**

After the `rssFeeds` table definition, add:

```ts
export const releaseBlacklist = sqliteTable("release_blacklist", {
  id: text("id").primaryKey(),
  gameId: text("game_id").references(() => games.id, { onDelete: "cascade" }),
  releaseName: text("release_name").notNull(),
  reason: text("reason"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const notificationConnectors = sqliteTable("notification_connectors", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(), // 'discord' | 'webhook'
  url: text("url").notNull(),
  events: text("events", { mode: "json" }).$type<string[]>().notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});
```

- [ ] **Step 3: Add Zod schemas + TypeScript types to `shared/schema.ts`**

After the table definitions:

```ts
export const insertReleaseBlacklistSchema = createInsertSchema(releaseBlacklist).omit({
  id: true,
  createdAt: true,
});

export const insertNotificationConnectorSchema = createInsertSchema(notificationConnectors)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    type: z.enum(["discord", "webhook"]),
    events: z.array(z.enum(["grabbed", "imported", "failed", "released"])),
  });

export const updateNotificationConnectorSchema = insertNotificationConnectorSchema.partial();

export type ReleaseBlacklist = typeof releaseBlacklist.$inferSelect;
export type InsertReleaseBlacklist = (typeof insertReleaseBlacklistSchema)["_output"];
export type NotificationConnector = typeof notificationConnectors.$inferSelect;
export type InsertNotificationConnector = (typeof insertNotificationConnectorSchema)["_output"];
export type UpdateNotificationConnector = (typeof updateNotificationConnectorSchema)["_output"];
```

- [ ] **Step 4: Run the migration**

```bash
npm run db:migrate
```

Expected: Migration applied without errors.

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npm run check
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add migrations/0008_blacklist_connectors.sql shared/schema.ts
git commit -m "feat(schema): add release_blacklist and notification_connectors tables (#8)"
```

---

## Task 2: Storage CRUD — Blacklist + Connectors

**Files:**

- Modify: `server/storage.ts`

- [ ] **Step 1: Add method signatures to `IStorage` interface**

In `server/storage.ts`, find the `IStorage` interface and add at the end:

```ts
  // Blacklist methods
  getBlacklist(): Promise<ReleaseBlacklist[]>;
  addToBlacklist(entry: { gameId?: string; releaseName: string; reason?: string }): Promise<ReleaseBlacklist>;
  removeFromBlacklist(id: string): Promise<boolean>;
  clearBlacklist(): Promise<void>;
  isBlacklisted(releaseName: string): Promise<boolean>;

  // Notification connector methods
  getConnectors(): Promise<NotificationConnector[]>;
  getConnector(id: string): Promise<NotificationConnector | undefined>;
  createConnector(connector: InsertNotificationConnector): Promise<NotificationConnector>;
  updateConnector(id: string, updates: UpdateNotificationConnector): Promise<NotificationConnector | undefined>;
  deleteConnector(id: string): Promise<boolean>;
```

- [ ] **Step 2: Add imports for new types to `server/storage.ts`**

Add to the existing import block from `../shared/schema.js`:

```ts
  type ReleaseBlacklist,
  type InsertReleaseBlacklist,
  type NotificationConnector,
  type InsertNotificationConnector,
  type UpdateNotificationConnector,
  releaseBlacklist,
  notificationConnectors,
```

- [ ] **Step 3: Implement blacklist methods in `DatabaseStorage` class**

At the end of the `DatabaseStorage` class:

```ts
  async getBlacklist(): Promise<ReleaseBlacklist[]> {
    return db.select().from(releaseBlacklist).orderBy(desc(releaseBlacklist.createdAt));
  }

  async addToBlacklist(entry: {
    gameId?: string;
    releaseName: string;
    reason?: string;
  }): Promise<ReleaseBlacklist> {
    const row = {
      id: randomUUID(),
      gameId: entry.gameId ?? null,
      releaseName: entry.releaseName,
      reason: entry.reason ?? null,
      createdAt: Date.now(),
    };
    await db.insert(releaseBlacklist).values(row);
    return row as ReleaseBlacklist;
  }

  async removeFromBlacklist(id: string): Promise<boolean> {
    const result = await db.delete(releaseBlacklist).where(eq(releaseBlacklist.id, id));
    return (result.changes ?? 0) > 0;
  }

  async clearBlacklist(): Promise<void> {
    await db.delete(releaseBlacklist);
  }

  async isBlacklisted(releaseName: string): Promise<boolean> {
    const rows = await db
      .select({ id: releaseBlacklist.id })
      .from(releaseBlacklist)
      .where(eq(releaseBlacklist.releaseName, releaseName))
      .limit(1);
    return rows.length > 0;
  }
```

- [ ] **Step 4: Implement connector methods in `DatabaseStorage` class**

```ts
  async getConnectors(): Promise<NotificationConnector[]> {
    return db.select().from(notificationConnectors).orderBy(notificationConnectors.name);
  }

  async getConnector(id: string): Promise<NotificationConnector | undefined> {
    const rows = await db
      .select()
      .from(notificationConnectors)
      .where(eq(notificationConnectors.id, id))
      .limit(1);
    return rows[0];
  }

  async createConnector(connector: InsertNotificationConnector): Promise<NotificationConnector> {
    const now = Date.now();
    const row = {
      id: randomUUID(),
      ...connector,
      enabled: connector.enabled ?? true,
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(notificationConnectors).values(row);
    return row as NotificationConnector;
  }

  async updateConnector(
    id: string,
    updates: UpdateNotificationConnector
  ): Promise<NotificationConnector | undefined> {
    const existing = await this.getConnector(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates, updatedAt: Date.now() };
    await db
      .update(notificationConnectors)
      .set(updated)
      .where(eq(notificationConnectors.id, id));
    return updated;
  }

  async deleteConnector(id: string): Promise<boolean> {
    const result = await db
      .delete(notificationConnectors)
      .where(eq(notificationConnectors.id, id));
    return (result.changes ?? 0) > 0;
  }
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npm run check
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add server/storage.ts
git commit -m "feat(storage): add blacklist and notification connector CRUD methods (#8)"
```

---

## Task 3: Activity API endpoints (Queue, History, Blacklist)

**Files:**

- Modify: `server/routes.ts`

- [ ] **Step 1: Add Activity Queue endpoint to `server/routes.ts`**

After the existing `/api/downloads` endpoint block, add:

```ts
// ─── Activity ──────────────────────────────────────────────────────────────

app.get("/api/activity/queue", authenticateToken, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const allDownloaders = await storage.getDownloaders();
  const downloaderManager = new DownloaderManager(allDownloaders);
  const queue: {
    downloadId: string;
    gameId?: string;
    gameTitle?: string;
    releaseName: string;
    size?: number;
    progress: number;
    speed?: number;
    seeders?: number;
    client: string;
    eta?: number;
    status: string;
  }[] = [];

  for (const d of allDownloaders) {
    if (!d.enabled) continue;
    try {
      const client = downloaderManager.getClient(d.id);
      if (!client) continue;
      const downloads = await client.getDownloads();
      for (const dl of downloads) {
        // Try to associate with a game via gameDownloads table
        const gameDownloads = await storage.getGameDownloadsByHash(dl.id);
        const gameDownload = gameDownloads[0];
        const game = gameDownload ? await storage.getGame(gameDownload.gameId) : undefined;
        queue.push({
          downloadId: dl.id,
          gameId: game?.id,
          gameTitle: game?.title,
          releaseName: dl.name,
          size: dl.size,
          progress: dl.progress,
          speed: dl.downloadSpeed,
          seeders: dl.seeders,
          client: d.name,
          eta: dl.eta,
          status: dl.status,
        });
      }
    } catch {
      // downloader unreachable — skip silently
    }
  }

  res.json(queue);
});
```

- [ ] **Step 2: Add `getGameDownloadsByHash` to storage interface and implementation**

In `server/storage.ts`, add to `IStorage` interface:

```ts
  getGameDownloadsByHash(hash: string): Promise<GameDownload[]>;
```

In `DatabaseStorage` class:

```ts
  async getGameDownloadsByHash(hash: string): Promise<GameDownload[]> {
    return db
      .select()
      .from(gameDownloads)
      .where(eq(gameDownloads.downloadHash, hash));
  }
```

- [ ] **Step 3: Add Activity History endpoint**

```ts
app.get("/api/activity/history", authenticateToken, async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(String(req.query.page ?? "1")));
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "50"))));
  const actionFilter = String(req.query.action ?? "");
  const searchFilter = String(req.query.search ?? "").trim();
  const offset = (page - 1) * limit;

  // Build history from gameDownloads + importTasks joined to games
  const allDownloads = await storage.getAllGameDownloads();
  type HistoryItem = {
    id: string;
    date: number;
    gameId: string;
    gameTitle: string;
    releaseName: string;
    indexer?: string;
    action: "grabbed" | "imported" | "failed" | "deleted";
    size?: number;
    detail?: string;
  };

  const items: HistoryItem[] = [];

  for (const dl of allDownloads) {
    const game = await storage.getGame(dl.gameId);
    if (!game) continue;
    if (
      searchFilter &&
      !dl.downloadTitle.toLowerCase().includes(searchFilter.toLowerCase()) &&
      !game.title.toLowerCase().includes(searchFilter.toLowerCase())
    )
      continue;

    // Grabbed event
    if (!actionFilter || actionFilter === "grabbed") {
      items.push({
        id: `dl-${dl.id}`,
        date: dl.addedAt?.getTime() ?? Date.now(),
        gameId: game.id,
        gameTitle: game.title,
        releaseName: dl.downloadTitle,
        action: "grabbed",
      });
    }

    // Import events
    const tasks = await storage.getImportTasksByDownload(dl.id);
    for (const task of tasks) {
      const action: HistoryItem["action"] =
        task.status === "completed" ? "imported" : task.status === "failed" ? "failed" : "grabbed";
      if (actionFilter && actionFilter !== action) continue;
      items.push({
        id: `task-${task.id}`,
        date: (task.completedAt ?? task.createdAt)?.getTime() ?? Date.now(),
        gameId: game.id,
        gameTitle: game.title,
        releaseName: dl.downloadTitle,
        action,
        detail: task.errorMessage ?? undefined,
      });
    }
  }

  // Sort newest first, paginate
  items.sort((a, b) => b.date - a.date);
  const total = items.length;
  const paged = items.slice(offset, offset + limit);

  res.json({ items: paged, total, page, pages: Math.ceil(total / limit) });
});
```

- [ ] **Step 4: Add storage helpers used by history endpoint**

In `IStorage` interface:

```ts
  getAllGameDownloads(): Promise<GameDownload[]>;
  getImportTasksByDownload(gameDownloadId: string): Promise<ImportTask[]>;
```

In `DatabaseStorage`:

```ts
  async getAllGameDownloads(): Promise<GameDownload[]> {
    return db.select().from(gameDownloads).orderBy(desc(gameDownloads.addedAt));
  }

  async getImportTasksByDownload(gameDownloadId: string): Promise<ImportTask[]> {
    return db
      .select()
      .from(importTasks)
      .where(eq(importTasks.gameDownloadId, gameDownloadId))
      .orderBy(desc(importTasks.createdAt));
  }
```

- [ ] **Step 5: Add Blacklist endpoints**

```ts
app.get("/api/activity/blacklist", authenticateToken, async (_req: Request, res: Response) => {
  const list = await storage.getBlacklist();
  // Enrich with game titles
  const enriched = await Promise.all(
    list.map(async (entry) => {
      const game = entry.gameId ? await storage.getGame(entry.gameId) : undefined;
      return { ...entry, gameTitle: game?.title };
    })
  );
  res.json(enriched);
});

app.post("/api/activity/blacklist", authenticateToken, async (req: Request, res: Response) => {
  const body = z
    .object({
      releaseName: z.string().min(1),
      gameId: z.string().optional(),
      reason: z.string().optional(),
    })
    .safeParse(req.body);

  if (!body.success) {
    return res.status(400).json({ error: "Invalid request", details: body.error.issues });
  }

  const entry = await storage.addToBlacklist(body.data);
  res.status(201).json(entry);
});

app.delete("/api/activity/blacklist", authenticateToken, async (_req: Request, res: Response) => {
  await storage.clearBlacklist();
  res.json({ ok: true });
});

app.delete(
  "/api/activity/blacklist/:id",
  authenticateToken,
  async (req: Request, res: Response) => {
    const removed = await storage.removeFromBlacklist(req.params.id);
    if (!removed) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  }
);
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npm run check
```

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add server/routes.ts server/storage.ts
git commit -m "feat(api): add activity queue, history, and blacklist endpoints (#8)"
```

---

## Task 4: System API + Connectors API + Notification Service

**Files:**

- Create: `server/notifications.ts`
- Modify: `server/routes.ts`

- [ ] **Step 1: Create `server/notifications.ts`**

```ts
import { storage } from "./storage.js";
import { routesLogger } from "./logger.js";

export type NotificationEvent = "grabbed" | "imported" | "failed" | "released";

export interface NotificationPayload {
  event: NotificationEvent;
  gameTitle?: string;
  releaseName?: string;
  error?: string;
}

export async function sendNotification(payload: NotificationPayload): Promise<void> {
  const connectors = await storage.getConnectors();
  for (const connector of connectors) {
    if (!connector.enabled) continue;
    const events = connector.events as string[];
    if (!events.includes(payload.event)) continue;
    try {
      const response = await fetch(connector.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        routesLogger.warn(`Connector ${connector.name} returned HTTP ${response.status}`);
      }
    } catch (err) {
      routesLogger.warn(`Connector ${connector.name} failed: ${(err as Error).message}`);
    }
  }
}
```

- [ ] **Step 2: Add System status endpoint to `server/routes.ts`**

```ts
// ─── System ────────────────────────────────────────────────────────────────

app.get("/api/system/status", authenticateToken, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const settings = user ? await storage.getUserSettings(user.id) : null;

  // DB size via SQLite PRAGMA
  const [sizeRow] = await db.all<{ page_count: number; page_size: number }>(
    sql`SELECT page_count, page_size FROM pragma_page_count(), pragma_page_size()`
  );
  const dbSizeBytes = (sizeRow?.page_count ?? 0) * (sizeRow?.page_size ?? 4096);

  // Check downloader health
  const allDownloaders = await storage.getDownloaders();
  const downloaderManager = new DownloaderManager(allDownloaders);
  const downloaderHealth = await Promise.all(
    allDownloaders.map(async (d) => {
      if (!d.enabled) return { name: d.name, ok: false };
      try {
        const client = downloaderManager.getClient(d.id);
        if (!client) return { name: d.name, ok: false };
        await client.testConnection();
        return { name: d.name, ok: true };
      } catch {
        return { name: d.name, ok: false };
      }
    })
  );

  res.json({
    version: process.env.npm_package_version ?? "dev",
    uptime: Math.floor(process.uptime()),
    dbSizeBytes,
    lastAutoSearch: settings?.lastAutoSearch?.getTime() ?? null,
    downloaderHealth,
  });
});
```

- [ ] **Step 3: Add System logs endpoint**

```ts
// In-memory ring buffer for system logs (populated by logger)
// We expose the last N lines from the log file if available.
app.get("/api/system/logs", authenticateToken, async (req: Request, res: Response) => {
  const level = String(req.query.level ?? "").toUpperCase();
  const limit = Math.min(500, Math.max(1, parseInt(String(req.query.limit ?? "200"))));

  // Read from log file if it exists, otherwise return empty
  const logPath = process.env.LOG_FILE;
  if (!logPath || !fs.existsSync(logPath)) {
    return res.json({ lines: [] });
  }

  const content = fs.readFileSync(logPath, "utf-8");
  let lines = content.split("\n").filter(Boolean);
  if (level && ["INFO", "WARN", "ERROR", "DEBUG"].includes(level)) {
    lines = lines.filter((l) => l.includes(`[${level}]`));
  }
  lines = lines.slice(-limit);
  res.json({ lines });
});
```

- [ ] **Step 4: Add Connectors CRUD endpoints**

```ts
// ─── Notification Connectors ─────────────────────────────────────────────

app.get("/api/connectors", authenticateToken, async (_req: Request, res: Response) => {
  res.json(await storage.getConnectors());
});

app.post("/api/connectors", authenticateToken, async (req: Request, res: Response) => {
  const { insertNotificationConnectorSchema } = await import("../shared/schema.js");
  const body = insertNotificationConnectorSchema.safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ error: "Invalid request", details: body.error.issues });
  }
  const connector = await storage.createConnector(body.data);
  res.status(201).json(connector);
});

app.patch("/api/connectors/:id", authenticateToken, async (req: Request, res: Response) => {
  const { updateNotificationConnectorSchema } = await import("../shared/schema.js");
  const body = updateNotificationConnectorSchema.safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ error: "Invalid request", details: body.error.issues });
  }
  const updated = await storage.updateConnector(req.params.id, body.data);
  if (!updated) return res.status(404).json({ error: "Connector not found" });
  res.json(updated);
});

app.delete("/api/connectors/:id", authenticateToken, async (req: Request, res: Response) => {
  const removed = await storage.deleteConnector(req.params.id);
  if (!removed) return res.status(404).json({ error: "Connector not found" });
  res.json({ ok: true });
});

app.post("/api/connectors/:id/test", authenticateToken, async (req: Request, res: Response) => {
  const connector = await storage.getConnector(req.params.id);
  if (!connector) return res.status(404).json({ error: "Connector not found" });
  try {
    const response = await fetch(connector.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "test", message: "Gamearr test notification" }),
      signal: AbortSignal.timeout(5000),
    });
    res.json({ ok: response.ok, status: response.status });
  } catch (err) {
    res.status(502).json({ ok: false, error: (err as Error).message });
  }
});
```

Note: The dynamic `import()` in the connector POST/PATCH handlers should be replaced with a static import at the top of the file. Add to the existing import block from `../shared/schema.js`:

```ts
  insertNotificationConnectorSchema,
  updateNotificationConnectorSchema,
```

Then use them directly (remove the `await import(...)` calls).

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npm run check
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add server/notifications.ts server/routes.ts
git commit -m "feat(api): add system status/logs endpoints and notification connectors API (#8)"
```

---

## Task 5: Navigation Restructure — AppSidebar + Router

**Files:**

- Modify: `client/src/components/AppSidebar.tsx`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Rewrite `client/src/components/AppSidebar.tsx`**

Replace the full file:

```tsx
import {
  Library,
  Calendar,
  Download,
  Clock,
  Ban,
  Star,
  Settings,
  Monitor,
  ChevronRight,
  LogOut,
  User,
  Cpu,
  HardDrive,
  Database,
  Rss,
  Bell,
  Palette,
  FolderOpen,
} from "lucide-react";
import { useState, useMemo } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { type Game, type DownloadStatus } from "@shared/schema";
import { useAuth } from "@/lib/auth";

interface AppSidebarProps {
  activeItem?: string;
  onNavigate?: (url: string) => void;
}

export default function AppSidebar({ activeItem = "/library", onNavigate }: AppSidebarProps) {
  const { logout, user } = useAuth();
  const [activityOpen, setActivityOpen] = useState(activeItem?.startsWith("/activity") ?? false);
  const [settingsOpen, setSettingsOpen] = useState(activeItem?.startsWith("/settings") ?? false);

  const { data: games = [] } = useQuery<Game[]>({
    queryKey: ["/api/games"],
  });

  const { data: downloadsData } = useQuery<{ downloads: DownloadStatus[] }>({
    queryKey: ["/api/downloads"],
    refetchInterval: 5000,
  });

  const { libraryCount, wantedCount, activeDownloadsCount } = useMemo(() => {
    const libraryCount = games.filter((g) =>
      ["owned", "completed", "downloading"].includes(g.status)
    ).length;
    const wantedCount = games.filter((g) => g.status === "wanted").length;
    const activeDownloadsCount = downloadsData?.downloads?.length ?? 0;
    return { libraryCount, wantedCount, activeDownloadsCount };
  }, [games, downloadsData]);

  const nav = (url: string) => onNavigate?.(url);
  const isActive = (url: string) => activeItem === url;

  return (
    <Sidebar data-testid="sidebar-main">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 flex items-center justify-center">
            <img src="/Questarr.svg" alt="Gamearr Logo" className="w-8 h-8" />
          </div>
          <div>
            <span className="truncate font-semibold">Gamearr</span>
            <p className="text-xs text-muted-foreground">Game Management</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {/* Library */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isActive("/library")}
                  data-testid="nav-library"
                >
                  <button
                    onClick={() => nav("/library")}
                    className="flex items-center justify-between w-full"
                  >
                    <div className="flex items-center gap-2">
                      <Library className="w-4 h-4" />
                      <span>Library</span>
                    </div>
                    {libraryCount > 0 && (
                      <Badge variant="secondary" className="ml-auto text-xs">
                        {libraryCount}
                      </Badge>
                    )}
                  </button>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Calendar */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isActive("/calendar")}
                  data-testid="nav-calendar"
                >
                  <button
                    onClick={() => nav("/calendar")}
                    className="flex items-center gap-2 w-full"
                  >
                    <Calendar className="w-4 h-4" />
                    <span>Calendar</span>
                  </button>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Activity — collapsible */}
              <SidebarMenuItem>
                <Collapsible open={activityOpen} onOpenChange={setActivityOpen}>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton
                      data-testid="nav-activity"
                      className="flex items-center justify-between w-full"
                    >
                      <div className="flex items-center gap-2">
                        <Download className="w-4 h-4" />
                        <span>Activity</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {activeDownloadsCount > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {activeDownloadsCount}
                          </Badge>
                        )}
                        <ChevronRight
                          className={`w-3 h-3 transition-transform ${activityOpen ? "rotate-90" : ""}`}
                        />
                      </div>
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={isActive("/activity/queue")}
                          data-testid="nav-activity-queue"
                        >
                          <button
                            onClick={() => nav("/activity/queue")}
                            className="flex items-center gap-2 w-full"
                          >
                            <Download className="w-3 h-3" />
                            <span>Queue</span>
                            {activeDownloadsCount > 0 && (
                              <Badge variant="secondary" className="ml-auto text-xs">
                                {activeDownloadsCount}
                              </Badge>
                            )}
                          </button>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={isActive("/activity/history")}
                          data-testid="nav-activity-history"
                        >
                          <button
                            onClick={() => nav("/activity/history")}
                            className="flex items-center gap-2 w-full"
                          >
                            <Clock className="w-3 h-3" />
                            <span>History</span>
                          </button>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={isActive("/activity/blacklist")}
                          data-testid="nav-activity-blacklist"
                        >
                          <button
                            onClick={() => nav("/activity/blacklist")}
                            className="flex items-center gap-2 w-full"
                          >
                            <Ban className="w-3 h-3" />
                            <span>Blacklist</span>
                          </button>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </Collapsible>
              </SidebarMenuItem>

              {/* Wanted */}
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/wanted")} data-testid="nav-wanted">
                  <button
                    onClick={() => nav("/wanted")}
                    className="flex items-center justify-between w-full"
                  >
                    <div className="flex items-center gap-2">
                      <Star className="w-4 h-4" />
                      <span>Wanted</span>
                    </div>
                    {wantedCount > 0 && (
                      <Badge variant="secondary" className="ml-auto text-xs">
                        {wantedCount}
                      </Badge>
                    )}
                  </button>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Settings — collapsible */}
              <SidebarMenuItem>
                <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton
                      data-testid="nav-settings"
                      className="flex items-center justify-between w-full"
                    >
                      <div className="flex items-center gap-2">
                        <Settings className="w-4 h-4" />
                        <span>Settings</span>
                      </div>
                      <ChevronRight
                        className={`w-3 h-3 transition-transform ${settingsOpen ? "rotate-90" : ""}`}
                      />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {[
                        { label: "Media Management", tab: "media", icon: FolderOpen },
                        { label: "Indexers", tab: "indexers", icon: Database },
                        { label: "Download Clients", tab: "downloaders", icon: HardDrive },
                        { label: "Sources", tab: "sources", icon: Rss },
                        { label: "Connect", tab: "connect", icon: Bell },
                        { label: "General", tab: "general", icon: Cpu },
                      ].map(({ label, tab, icon: Icon }) => (
                        <SidebarMenuSubItem key={tab}>
                          <SidebarMenuSubButton
                            asChild
                            isActive={activeItem === `/settings?tab=${tab}`}
                          >
                            <button
                              onClick={() => nav(`/settings?tab=${tab}`)}
                              className="flex items-center gap-2 w-full"
                            >
                              <Icon className="w-3 h-3" />
                              <span>{label}</span>
                            </button>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </Collapsible>
              </SidebarMenuItem>

              {/* System */}
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/system")} data-testid="nav-system">
                  <button onClick={() => nav("/system")} className="flex items-center gap-2 w-full">
                    <Monitor className="w-4 h-4" />
                    <span>System</span>
                  </button>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              onClick={() => logout()}
              className="cursor-pointer w-full"
              tooltip="Log out"
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <User className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{user?.username ?? "User"}</span>
                <span className="truncate text-xs">Logged in</span>
              </div>
              <LogOut className="ml-auto size-4" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
```

- [ ] **Step 2: Update `client/src/App.tsx` — add new lazy imports**

Replace the lazy import block with:

```tsx
// Existing pages (kept)
const SearchPage = lazy(() => import("@/pages/search"));
const SettingsPage = lazy(() => import("@/pages/settings"));
const NotFound = lazy(() => import("@/pages/not-found"));
const LibraryPage = lazy(() => import("@/pages/library"));
const CalendarPage = lazy(() => import("@/pages/calendar"));
const LoginPage = lazy(() => import("@/pages/auth/login"));
const SetupPage = lazy(() => import("@/pages/auth/setup"));
// New pages
const GameDetailPage = lazy(() => import("@/pages/game-detail"));
const ActivityQueuePage = lazy(() => import("@/pages/activity-queue"));
const ActivityHistoryPage = lazy(() => import("@/pages/activity-history"));
const ActivityBlacklistPage = lazy(() => import("@/pages/activity-blacklist"));
const WantedPage = lazy(() => import("@/pages/wanted"));
const SystemPage = lazy(() => import("@/pages/system"));
// Legacy pages kept temporarily for redirect targets
const DownloadsPage = lazy(() => import("@/pages/downloads"));
```

- [ ] **Step 3: Update the `Router` function in `client/src/App.tsx`**

Replace the `Router` function:

```tsx
import { Switch, Route, Redirect, useLocation } from "wouter";

function Router() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <Switch>
        {/* Auth */}
        <Route path="/login" component={LoginPage} />
        <Route path="/setup" component={SetupPage} />

        {/* Core pages */}
        <Route path="/library" component={LibraryPage} />
        <Route path="/games/:id" component={GameDetailPage} />
        <Route path="/calendar" component={CalendarPage} />
        <Route path="/wanted" component={WantedPage} />
        <Route path="/search" component={SearchPage} />

        {/* Activity */}
        <Route path="/activity/queue" component={ActivityQueuePage} />
        <Route path="/activity/history" component={ActivityHistoryPage} />
        <Route path="/activity/blacklist" component={ActivityBlacklistPage} />

        {/* System + Settings */}
        <Route path="/system" component={SystemPage} />
        <Route path="/settings" component={SettingsPage} />

        {/* Backwards-compatibility redirects */}
        <Route path="/">
          <Redirect to="/library" />
        </Route>
        <Route path="/downloads">
          <Redirect to="/activity/queue" />
        </Route>
        <Route path="/discover">
          <Redirect to="/library?tab=discover" />
        </Route>
        <Route path="/wishlist">
          <Redirect to="/wanted" />
        </Route>
        <Route path="/xrel">
          <Redirect to="/settings?tab=sources" />
        </Route>
        <Route path="/rss">
          <Redirect to="/settings?tab=sources" />
        </Route>
        <Route path="/indexers">
          <Redirect to="/settings?tab=indexers" />
        </Route>
        <Route path="/downloaders">
          <Redirect to="/settings?tab=downloaders" />
        </Route>
        <Route path="/root-folders">
          <Redirect to="/settings?tab=media" />
        </Route>
        <Route path="/library-scan">
          <Redirect to="/settings?tab=media" />
        </Route>
        <Route path="/import-history">
          <Redirect to="/activity/history" />
        </Route>

        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}
```

- [ ] **Step 4: Update `getPageTitle` in `client/src/App.tsx`**

Replace the `getPageTitle` function:

```tsx
const getPageTitle = (path: string) => {
  if (path.startsWith("/games/")) return "Game Details";
  if (path.startsWith("/settings")) return "Settings";
  switch (path) {
    case "/library":
      return "Library";
    case "/calendar":
      return "Calendar";
    case "/wanted":
      return "Wanted";
    case "/search":
      return "Search";
    case "/activity/queue":
      return "Queue";
    case "/activity/history":
      return "History";
    case "/activity/blacklist":
      return "Blacklist";
    case "/system":
      return "System";
    default:
      return "Gamearr";
  }
};
```

- [ ] **Step 5: Verify TypeScript + build**

```bash
npm run check && npm run build
```

Expected: No TypeScript errors. Build succeeds (missing page files will cause build errors — create placeholder files if needed by Task 6-8 implementers).

- [ ] **Step 6: Commit**

```bash
git add client/src/components/AppSidebar.tsx client/src/App.tsx
git commit -m "feat(nav): restructure sidebar with collapsible Activity/Settings + update router (#8)"
```

---

## Task 6: Library Sub-tabs + Game Detail Page

**Files:**

- Modify: `client/src/pages/library.tsx`
- Create: `client/src/pages/game-detail.tsx`

- [ ] **Step 1: Add secondary tab bar to `client/src/pages/library.tsx`**

At the top of the file, add to imports:

```tsx
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useSearch, useLocation } from "wouter";
import DiscoverPage from "@/pages/discover";
```

Replace the existing `LibraryPage` component with one that adds tab state driven by `?tab=` query param:

```tsx
export default function LibraryPage() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const initialTab = params.get("tab") ?? "all";
  const [activeTab, setActiveTab] = useState(initialTab);
  const [, setLocation] = useLocation();

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (tab === "discover") {
      setLocation("/library?tab=discover", { replace: true });
    } else {
      setLocation("/library", { replace: true });
    }
  };

  // ... existing viewMode, listDensity, query logic stays unchanged ...

  const tabGames = useMemo(() => {
    switch (activeTab) {
      case "wanted":
        return games.filter((g) => g.status === "wanted");
      case "downloading":
        return games.filter((g) => g.status === "downloading");
      case "owned":
        return games.filter((g) => ["owned", "completed"].includes(g.status));
      default:
        return games; // "all"
    }
  }, [games, activeTab]);

  // Replace the return JSX: wrap existing content in <Tabs> with the tab bar at top
  return (
    <div className="flex flex-col h-full">
      <Tabs value={activeTab} onValueChange={handleTabChange} className="flex flex-col h-full">
        <div className="border-b px-6 pt-4">
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="wanted">Wanted</TabsTrigger>
            <TabsTrigger value="downloading">Downloading</TabsTrigger>
            <TabsTrigger value="owned">Owned</TabsTrigger>
            <TabsTrigger value="discover">Discover</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="all" className="flex-1 overflow-hidden m-0">
          {/* existing grid/list rendering using tabGames */}
        </TabsContent>
        <TabsContent value="wanted" className="flex-1 overflow-hidden m-0">
          {/* same grid/list rendering */}
        </TabsContent>
        <TabsContent value="downloading" className="flex-1 overflow-hidden m-0">
          {/* same grid/list rendering */}
        </TabsContent>
        <TabsContent value="owned" className="flex-1 overflow-hidden m-0">
          {/* same grid/list rendering */}
        </TabsContent>
        <TabsContent value="discover" className="flex-1 overflow-auto m-0">
          <DiscoverPage />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

**Note:** The `tabGames` variable replaces `libraryGames` for the grid/list content tabs. Extract the existing game grid/list JSX into a shared `<GameTabContent games={tabGames} ...props />` sub-component within the file to avoid repeating it across 4 tabs.

- [ ] **Step 2: Create `client/src/pages/game-detail.tsx`**

```tsx
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type Game, type GameFile } from "@shared/schema";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, RefreshCw, Search, Edit, Trash2, Star } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState } from "react";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export default function GameDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const { data: game, isLoading } = useQuery<Game>({
    queryKey: [`/api/games/${id}`],
    queryFn: () =>
      fetch(`/api/games/${id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      }).then((r) => {
        if (!r.ok) throw new Error("Game not found");
        return r.json();
      }),
  });

  const { data: files = [] } = useQuery<GameFile[]>({
    queryKey: [`/api/games/${id}/files`],
    queryFn: () =>
      fetch(`/api/games/${id}/files`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      }).then((r) => r.json()),
    enabled: !!game,
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      fetch(`/api/games/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      }).then((r) => {
        if (!r.ok) throw new Error("Delete failed");
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/games"] });
      navigate("/library");
    },
    onError: () => toast({ title: "Failed to delete game", variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (!game) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-muted-foreground">Game not found</p>
        <Button variant="outline" onClick={() => navigate("/library")}>
          Back to Library
        </Button>
      </div>
    );
  }

  const year = game.releaseDate ? new Date(game.releaseDate).getUTCFullYear() : null;

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Back navigation */}
      <div className="px-6 pt-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/library")}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          Library
        </Button>
      </div>

      {/* Two-column layout */}
      <div className="flex flex-col lg:flex-row gap-6 px-6 pb-6 flex-1 min-h-0">
        {/* Left column — cover + actions */}
        <div className="lg:w-[280px] flex-shrink-0 flex flex-col gap-4">
          {game.coverUrl ? (
            <img
              src={game.coverUrl}
              alt={game.title}
              className="w-full rounded-lg object-cover shadow-md"
            />
          ) : (
            <div className="w-full aspect-[3/4] rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
              No cover
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Button variant="outline" size="sm" className="justify-start gap-2">
              <Search className="w-4 h-4" /> Search
            </Button>
            <Button variant="outline" size="sm" className="justify-start gap-2">
              <RefreshCw className="w-4 h-4" /> Refresh Metadata
            </Button>
            <Button variant="outline" size="sm" className="justify-start gap-2">
              <Edit className="w-4 h-4" /> Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="justify-start gap-2 text-destructive hover:text-destructive"
              onClick={() => setShowDeleteDialog(true)}
            >
              <Trash2 className="w-4 h-4" /> Delete
            </Button>
          </div>
        </div>

        {/* Right column — metadata + tabs */}
        <div className="flex-1 flex flex-col gap-4 min-w-0">
          {/* Title + metadata */}
          <div>
            <div className="flex items-baseline gap-3 flex-wrap">
              <h1 className="text-2xl font-bold">{game.title}</h1>
              {year && <span className="text-muted-foreground text-lg">{year}</span>}
              {game.rating && (
                <div className="flex items-center gap-1 text-yellow-500">
                  <Star className="w-4 h-4 fill-current" />
                  <span className="text-sm">{(game.rating / 10).toFixed(1)}</span>
                </div>
              )}
            </div>

            {game.genres && game.genres.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {game.genres.map((g) => (
                  <Badge key={g} variant="secondary">
                    {g}
                  </Badge>
                ))}
              </div>
            )}

            {game.platforms && game.platforms.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {game.platforms.map((p) => (
                  <Badge key={p} variant="outline">
                    {p}
                  </Badge>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-4 mt-3 text-sm text-muted-foreground">
              <span>
                Status: <Badge>{game.status}</Badge>
              </span>
            </div>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="files" className="flex-1 flex flex-col">
            <TabsList className="w-fit">
              <TabsTrigger value="files">Files</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
              <TabsTrigger value="search">Manual Search</TabsTrigger>
            </TabsList>

            <TabsContent value="files" className="flex-1 overflow-auto">
              {files.length === 0 ? (
                <p className="text-muted-foreground text-sm pt-4">
                  No files tracked for this game.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Filename</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Type</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {files.map((f) => (
                      <TableRow key={f.id}>
                        <TableCell className="font-mono text-xs">{f.relativePath}</TableCell>
                        <TableCell>{formatBytes(f.sizeBytes)}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{f.fileType}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            <TabsContent value="history" className="flex-1 overflow-auto">
              <p className="text-muted-foreground text-sm pt-4">
                Download history for this game will appear here.
              </p>
            </TabsContent>

            <TabsContent value="search" className="flex-1 overflow-auto">
              <p className="text-muted-foreground text-sm pt-4">
                Manual search for <strong>{game.title}</strong> coming in a future update.
              </p>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {game.title}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the game from Gamearr. Files on disk are not deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleteMutation.mutate()}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

- [ ] **Step 3: Verify build compiles**

```bash
npm run check
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/library.tsx client/src/pages/game-detail.tsx
git commit -m "feat(ui): library sub-tabs and game detail page (#8)"
```

---

## Task 7: Activity Pages (Queue, History, Blacklist)

**Files:**

- Create: `client/src/pages/activity-queue.tsx`
- Create: `client/src/pages/activity-history.tsx`
- Create: `client/src/pages/activity-blacklist.tsx`

- [ ] **Step 1: Create `client/src/pages/activity-queue.tsx`**

```tsx
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Ban, X } from "lucide-react";

interface QueueItem {
  downloadId: string;
  gameId?: string;
  gameTitle?: string;
  releaseName: string;
  size?: number;
  progress: number;
  speed?: number;
  seeders?: number;
  client: string;
  eta?: number;
  status: string;
}

function formatBytes(bytes?: number): string {
  if (!bytes) return "—";
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function formatEta(seconds?: number): string {
  if (!seconds) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatSpeed(bytesPerSec?: number): string {
  if (!bytesPerSec) return "—";
  return `${(bytesPerSec / 1024 ** 2).toFixed(1)} MB/s`;
}

export default function ActivityQueuePage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const authHeaders = { Authorization: `Bearer ${localStorage.getItem("token")}` };

  const { data: queue = [], isLoading } = useQuery<QueueItem[]>({
    queryKey: ["/api/activity/queue"],
    queryFn: () => fetch("/api/activity/queue", { headers: authHeaders }).then((r) => r.json()),
    refetchInterval: 10000,
  });

  const blacklistMutation = useMutation({
    mutationFn: ({ releaseName, gameId }: { releaseName: string; gameId?: string }) =>
      fetch("/api/activity/blacklist", {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ releaseName, gameId, reason: "Manually blacklisted from queue" }),
      }).then((r) => {
        if (!r.ok) throw new Error("Blacklist failed");
      }),
    onSuccess: () => {
      toast({ title: "Release blacklisted" });
      queryClient.invalidateQueries({ queryKey: ["/api/activity/queue"] });
    },
    onError: () => toast({ title: "Failed to blacklist", variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (queue.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
        <X className="w-8 h-8" />
        <p>No active downloads.</p>
      </div>
    );
  }

  return (
    <div className="p-6 overflow-auto h-full">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Game</TableHead>
            <TableHead>Release</TableHead>
            <TableHead>Size</TableHead>
            <TableHead>Progress</TableHead>
            <TableHead>Speed</TableHead>
            <TableHead>Seeders</TableHead>
            <TableHead>Client</TableHead>
            <TableHead>ETA</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {queue.map((item) => (
            <TableRow key={item.downloadId}>
              <TableCell>
                {item.gameId ? (
                  <button
                    className="text-left hover:underline font-medium"
                    onClick={() => navigate(`/games/${item.gameId}`)}
                  >
                    {item.gameTitle ?? "Unknown"}
                  </button>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="font-mono text-xs max-w-[200px] truncate">
                {item.releaseName}
              </TableCell>
              <TableCell>{formatBytes(item.size)}</TableCell>
              <TableCell className="min-w-[120px]">
                <div className="flex items-center gap-2">
                  <Progress value={item.progress} className="h-2 flex-1" />
                  <span className="text-xs text-muted-foreground">{item.progress.toFixed(0)}%</span>
                </div>
              </TableCell>
              <TableCell>{formatSpeed(item.speed)}</TableCell>
              <TableCell>{item.seeders ?? "—"}</TableCell>
              <TableCell>{item.client}</TableCell>
              <TableCell>{formatEta(item.eta)}</TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Blacklist"
                  onClick={() =>
                    blacklistMutation.mutate({
                      releaseName: item.releaseName,
                      gameId: item.gameId,
                    })
                  }
                >
                  <Ban className="w-4 h-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 2: Create `client/src/pages/activity-history.tsx`**

```tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";

interface HistoryItem {
  id: string;
  date: number;
  gameId: string;
  gameTitle: string;
  releaseName: string;
  indexer?: string;
  action: "grabbed" | "imported" | "failed" | "deleted";
  size?: number;
  detail?: string;
}

interface HistoryResponse {
  items: HistoryItem[];
  total: number;
  page: number;
  pages: number;
}

const ACTION_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  grabbed: "secondary",
  imported: "default",
  failed: "destructive",
  deleted: "outline",
};

export default function ActivityHistoryPage() {
  const [, navigate] = useLocation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const authHeader = { Authorization: `Bearer ${localStorage.getItem("token")}` };

  const params = new URLSearchParams({ page: String(page), limit: "50" });
  if (search) params.set("search", search);
  if (actionFilter) params.set("action", actionFilter);

  const { data, isLoading } = useQuery<HistoryResponse>({
    queryKey: ["/api/activity/history", page, search, actionFilter],
    queryFn: () =>
      fetch(`/api/activity/history?${params}`, { headers: authHeader }).then((r) => r.json()),
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Filters */}
      <div className="flex items-center gap-3 p-4 border-b">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search release or game…"
            className="pl-8"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="flex gap-1">
          {(["", "grabbed", "imported", "failed"] as const).map((action) => (
            <Button
              key={action || "all"}
              variant={actionFilter === action ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setActionFilter(action);
                setPage(1);
              }}
            >
              {action || "All"}
            </Button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Loading…
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Game</TableHead>
                <TableHead>Release</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.items ?? []).map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(item.date).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <button
                      className="hover:underline font-medium text-left"
                      onClick={() => navigate(`/games/${item.gameId}`)}
                    >
                      {item.gameTitle}
                    </button>
                  </TableCell>
                  <TableCell className="font-mono text-xs max-w-[240px] truncate">
                    {item.releaseName}
                  </TableCell>
                  <TableCell>
                    <Badge variant={ACTION_COLORS[item.action] ?? "secondary"}>{item.action}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Pagination */}
      {data && data.pages > 1 && (
        <div className="flex items-center justify-between p-4 border-t text-sm text-muted-foreground">
          <span>{data.total} records</span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span>
              Page {data.page} / {data.pages}
            </span>
            <Button
              variant="outline"
              size="icon"
              disabled={page >= data.pages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create `client/src/pages/activity-blacklist.tsx`**

```tsx
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Ban } from "lucide-react";
import { useState } from "react";

interface BlacklistEntry {
  id: string;
  releaseName: string;
  gameId?: string;
  gameTitle?: string;
  reason?: string;
  createdAt: number;
}

export default function ActivityBlacklistPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showClearDialog, setShowClearDialog] = useState(false);
  const authHeaders = { Authorization: `Bearer ${localStorage.getItem("token")}` };

  const { data: entries = [], isLoading } = useQuery<BlacklistEntry[]>({
    queryKey: ["/api/activity/blacklist"],
    queryFn: () => fetch("/api/activity/blacklist", { headers: authHeaders }).then((r) => r.json()),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/activity/blacklist/${id}`, { method: "DELETE", headers: authHeaders }).then(
        (r) => {
          if (!r.ok) throw new Error();
        }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/activity/blacklist"] });
      toast({ title: "Entry removed from blacklist" });
    },
    onError: () => toast({ title: "Failed to remove", variant: "destructive" }),
  });

  const clearMutation = useMutation({
    mutationFn: () =>
      fetch("/api/activity/blacklist", { method: "DELETE", headers: authHeaders }).then((r) => {
        if (!r.ok) throw new Error();
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/activity/blacklist"] });
      toast({ title: "Blacklist cleared" });
      setShowClearDialog(false);
    },
    onError: () => toast({ title: "Failed to clear blacklist", variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">Loading…</div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Ban className="w-4 h-4" />
          <span>
            {entries.length} blacklisted release{entries.length !== 1 ? "s" : ""}
          </span>
        </div>
        {entries.length > 0 && (
          <Button variant="destructive" size="sm" onClick={() => setShowClearDialog(true)}>
            Clear All
          </Button>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="flex items-center justify-center flex-1 text-muted-foreground">
          No blacklisted releases.
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Release</TableHead>
                <TableHead>Game</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Date</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="font-mono text-xs">{entry.releaseName}</TableCell>
                  <TableCell>
                    {entry.gameId ? (
                      <button
                        className="hover:underline text-left"
                        onClick={() => navigate(`/games/${entry.gameId}`)}
                      >
                        {entry.gameTitle ?? entry.gameId}
                      </button>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {entry.reason ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(entry.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeMutation.mutate(entry.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear entire blacklist?</AlertDialogTitle>
            <AlertDialogDescription>
              All {entries.length} blacklisted releases will be re-authorized.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => clearMutation.mutate()}
            >
              Clear All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npm run check
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/activity-queue.tsx client/src/pages/activity-history.tsx client/src/pages/activity-blacklist.tsx
git commit -m "feat(ui): Activity Queue, History, and Blacklist pages (#8)"
```

---

## Task 8: Wanted + System Pages

**Files:**

- Create: `client/src/pages/wanted.tsx`
- Create: `client/src/pages/system.tsx`

- [ ] **Step 1: Create `client/src/pages/wanted.tsx`**

```tsx
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type Game } from "@shared/schema";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Search, Star } from "lucide-react";

const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

export default function WantedPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: games = [], isLoading } = useQuery<Game[]>({
    queryKey: ["/api/games", "wanted"],
    queryFn: () =>
      fetch("/api/games?status=wanted", { headers: authHeader() }).then((r) => r.json()),
  });

  const searchOneMutation = useMutation({
    mutationFn: (gameId: string) =>
      fetch(`/api/games/${gameId}/search`, { method: "POST", headers: authHeader() }).then((r) => {
        if (!r.ok) throw new Error();
      }),
    onSuccess: () => toast({ title: "Search triggered" }),
    onError: () => toast({ title: "Search failed", variant: "destructive" }),
  });

  const searchAllMutation = useMutation({
    mutationFn: () =>
      Promise.all(
        games.map((g) =>
          fetch(`/api/games/${g.id}/search`, { method: "POST", headers: authHeader() })
        )
      ),
    onSuccess: () => {
      toast({ title: `Search triggered for ${games.length} games` });
      queryClient.invalidateQueries({ queryKey: ["/api/games", "wanted"] });
    },
    onError: () => toast({ title: "Search failed", variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">Loading…</div>
    );
  }

  if (games.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
        <Star className="w-8 h-8" />
        <p>No games in Wanted list.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b">
        <span className="text-sm text-muted-foreground">
          {games.length} game{games.length !== 1 ? "s" : ""} wanted
        </span>
        <Button
          size="sm"
          onClick={() => searchAllMutation.mutate()}
          disabled={searchAllMutation.isPending}
        >
          <Search className="w-4 h-4 mr-1" />
          Search All
        </Button>
      </div>

      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Year</TableHead>
              <TableHead>Platforms</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {games.map((game) => {
              const year = game.releaseDate ? new Date(game.releaseDate).getUTCFullYear() : null;
              return (
                <TableRow key={game.id}>
                  <TableCell className="font-medium">{game.title}</TableCell>
                  <TableCell className="text-muted-foreground">{year ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(game.platforms ?? []).slice(0, 3).map((p) => (
                        <Badge key={p} variant="outline" className="text-xs">
                          {p}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{game.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => searchOneMutation.mutate(game.id)}
                      disabled={searchOneMutation.isPending}
                    >
                      <Search className="w-3 h-3 mr-1" />
                      Search
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `client/src/pages/system.tsx`**

```tsx
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, XCircle, Play, RefreshCw } from "lucide-react";

const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

interface SystemStatus {
  version: string;
  uptime: number;
  dbSizeBytes: number;
  lastAutoSearch: number | null;
  downloaderHealth: { name: string; ok: boolean }[];
}

interface SystemLog {
  lines: string[];
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export default function SystemPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: status, isLoading: statusLoading } = useQuery<SystemStatus>({
    queryKey: ["/api/system/status"],
    queryFn: () => fetch("/api/system/status", { headers: authHeader() }).then((r) => r.json()),
    refetchInterval: 30000,
  });

  const { data: logs } = useQuery<SystemLog>({
    queryKey: ["/api/system/logs"],
    queryFn: () =>
      fetch("/api/system/logs?limit=200", { headers: authHeader() }).then((r) => r.json()),
    refetchInterval: 5000,
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Tabs defaultValue="status" className="flex flex-col h-full">
        <div className="border-b px-6 pt-4">
          <TabsList>
            <TabsTrigger value="status">Status</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
          </TabsList>
        </div>

        {/* Status tab */}
        <TabsContent value="status" className="flex-1 overflow-auto p-6 m-0">
          {statusLoading ? (
            <div className="text-muted-foreground">Loading…</div>
          ) : status ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Version</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-mono">{status.version}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Uptime</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-mono">{formatUptime(status.uptime)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Database Size</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-mono">{formatBytes(status.dbSizeBytes)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Last Auto-Search</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">
                    {status.lastAutoSearch
                      ? new Date(status.lastAutoSearch).toLocaleString()
                      : "Never"}
                  </p>
                </CardContent>
              </Card>

              {/* Downloader health */}
              {status.downloaderHealth.length > 0 && (
                <Card className="col-span-full md:col-span-2">
                  <CardHeader>
                    <CardTitle className="text-sm">Download Clients</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-3">
                      {status.downloaderHealth.map((d) => (
                        <div key={d.name} className="flex items-center gap-2">
                          {d.ok ? (
                            <CheckCircle className="w-4 h-4 text-green-500" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-500" />
                          )}
                          <span className="text-sm">{d.name}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : null}
        </TabsContent>

        {/* Logs tab */}
        <TabsContent value="logs" className="flex-1 overflow-hidden m-0 flex flex-col">
          <div className="flex items-center gap-2 px-4 py-2 border-b">
            <Button
              variant="outline"
              size="sm"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/system/logs"] })}
            >
              <RefreshCw className="w-3 h-3 mr-1" /> Refresh
            </Button>
            <span className="text-xs text-muted-foreground">
              Last {logs?.lines.length ?? 0} lines (auto-refreshes every 5s)
            </span>
          </div>
          <div className="flex-1 overflow-auto p-4 bg-black/20">
            <pre className="text-xs font-mono leading-5 whitespace-pre-wrap break-all">
              {(logs?.lines ?? []).join("\n") || "No logs available."}
            </pre>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npm run check
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/wanted.tsx client/src/pages/system.tsx
git commit -m "feat(ui): Wanted and System pages (#8)"
```

---

## Task 9: Settings Restructure — Sources + Connect tabs + inline management

**Files:**

- Modify: `client/src/pages/settings.tsx`

- [ ] **Step 1: Read current settings.tsx to understand existing tab structure**

Read `client/src/pages/settings.tsx` before modifying (required by Edit tool). Note current tab count (`grid-cols-7`) and existing tabs.

- [ ] **Step 2: Add Sources tab content to settings.tsx**

The Sources tab combines xREL toggles (already in General/settings) + RSS feed management (from the existing `/rss` page patterns).

First, add this import near the top of `settings.tsx`:

```tsx
import { type RssFeed } from "@shared/schema";
```

Then add a `SourcesTab` section within the component (before the return JSX, or as an inline section in the TabsContent):

```tsx
// Inside the component, alongside other useQuery calls:
const { data: rssFeeds = [] } = useQuery<RssFeed[]>({
  queryKey: ["/api/rss/feeds"],
  queryFn: () => fetch("/api/rss/feeds", { headers: authHeaders }).then((r) => r.json()),
});

const deleteRssFeedMutation = useMutation({
  mutationFn: (feedId: string) =>
    fetch(`/api/rss/feeds/${feedId}`, { method: "DELETE", headers: authHeaders }).then((r) => {
      if (!r.ok) throw new Error();
    }),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["/api/rss/feeds"] });
    toast({ title: "RSS feed removed" });
  },
});
```

Add the Sources `<TabsContent>` after the existing tabs:

```tsx
<TabsContent value="sources" className="space-y-6">
  {/* xREL section */}
  <Card>
    <CardHeader>
      <CardTitle>xREL.to</CardTitle>
      <CardDescription>Enable xREL release monitoring sources</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Label>Scene Releases</Label>
          <p className="text-xs text-muted-foreground">Monitor scene group releases</p>
        </div>
        <Switch
          checked={formData.xrelSceneReleases}
          onCheckedChange={(v) => setFormData((p) => ({ ...p, xrelSceneReleases: v }))}
        />
      </div>
      <div className="flex items-center justify-between">
        <div>
          <Label>P2P Releases</Label>
          <p className="text-xs text-muted-foreground">Monitor peer-to-peer releases</p>
        </div>
        <Switch
          checked={formData.xrelP2pReleases}
          onCheckedChange={(v) => setFormData((p) => ({ ...p, xrelP2pReleases: v }))}
        />
      </div>
    </CardContent>
  </Card>

  {/* RSS Feeds section */}
  <Card>
    <CardHeader>
      <div className="flex items-center justify-between">
        <div>
          <CardTitle>RSS Feeds</CardTitle>
          <CardDescription>Configured RSS feed sources</CardDescription>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            /* open add feed modal */
          }}
        >
          + Add Feed
        </Button>
      </div>
    </CardHeader>
    <CardContent>
      {rssFeeds.length === 0 ? (
        <p className="text-sm text-muted-foreground">No RSS feeds configured.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>URL</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rssFeeds.map((feed) => (
              <TableRow key={feed.id}>
                <TableCell>{feed.name}</TableCell>
                <TableCell className="font-mono text-xs truncate max-w-[200px]">
                  {feed.url}
                </TableCell>
                <TableCell>
                  <Badge variant={feed.status === "ok" ? "default" : "destructive"}>
                    {feed.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteRssFeedMutation.mutate(feed.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </CardContent>
  </Card>
</TabsContent>
```

- [ ] **Step 3: Add Connect tab content to settings.tsx**

Add connector state management inside the component:

```tsx
const { data: connectors = [] } = useQuery({
  queryKey: ["/api/connectors"],
  queryFn: () => fetch("/api/connectors", { headers: authHeaders }).then((r) => r.json()),
});

const deleteConnectorMutation = useMutation({
  mutationFn: (id: string) =>
    fetch(`/api/connectors/${id}`, { method: "DELETE", headers: authHeaders }).then((r) => {
      if (!r.ok) throw new Error();
    }),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["/api/connectors"] });
    toast({ title: "Connector removed" });
  },
});

const testConnectorMutation = useMutation({
  mutationFn: (id: string) =>
    fetch(`/api/connectors/${id}/test`, { method: "POST", headers: authHeaders }).then((r) =>
      r.json()
    ),
  onSuccess: (data) =>
    toast({
      title: data.ok ? "Test notification sent!" : `Test failed (HTTP ${data.status})`,
      variant: data.ok ? "default" : "destructive",
    }),
});
```

Add the Connect `<TabsContent>`:

```tsx
<TabsContent value="connect" className="space-y-6">
  <Card>
    <CardHeader>
      <div className="flex items-center justify-between">
        <div>
          <CardTitle>Notification Connectors</CardTitle>
          <CardDescription>Discord webhooks and generic HTTP webhooks</CardDescription>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            /* open add connector modal */
          }}
        >
          + Add Connector
        </Button>
      </div>
    </CardHeader>
    <CardContent>
      {connectors.length === 0 ? (
        <p className="text-sm text-muted-foreground">No connectors configured.</p>
      ) : (
        <div className="space-y-3">
          {connectors.map((c: any) => (
            <div key={c.id} className="flex items-center justify-between border rounded-md p-3">
              <div>
                <p className="font-medium text-sm">{c.name}</p>
                <p className="text-xs text-muted-foreground">
                  {c.type} · {c.url}
                </p>
                <div className="flex gap-1 mt-1">
                  {(c.events as string[]).map((e: string) => (
                    <Badge key={e} variant="secondary" className="text-xs">
                      {e}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => testConnectorMutation.mutate(c.id)}
                  disabled={testConnectorMutation.isPending}
                >
                  Test
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => deleteConnectorMutation.mutate(c.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </CardContent>
  </Card>
</TabsContent>
```

- [ ] **Step 4: Update TabsList to include new tabs**

In the `<TabsList>`, change `grid-cols-7` to `grid-cols-9` and add:

```tsx
<TabsTrigger value="sources">Sources</TabsTrigger>
<TabsTrigger value="connect">Connect</TabsTrigger>
```

Also add the new tab values to match the URL deep-link pattern — the settings page should read `?tab` from the URL to set the initial active tab. Add at the top of the component:

```tsx
import { useSearch } from "wouter";

// Inside component:
const search = useSearch();
const urlTab = new URLSearchParams(search).get("tab") ?? "general";
const [activeSettingsTab, setActiveSettingsTab] = useState(urlTab);
```

Then set `value={activeSettingsTab}` and `onValueChange={setActiveSettingsTab}` on the `<Tabs>` component.

- [ ] **Step 5: Add missing imports to settings.tsx**

Verify these are imported (add if missing):

```tsx
import { Trash2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useSearch } from "wouter";
```

- [ ] **Step 6: Verify build**

```bash
npm run check && npm run build
```

Expected: No TypeScript errors. Build completes without errors.

- [ ] **Step 7: Run tests**

```bash
npx vitest run
```

Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add client/src/pages/settings.tsx
git commit -m "feat(ui): add Sources and Connect tabs to Settings; URL deep-link tab routing (#8)"
```

---

## Final Verification

After all tasks are complete:

- [ ] **Test key navigation flows:**
  1. Navigate to `/` → should redirect to `/library`
  2. Click Activity in sidebar → should expand with Queue/History/Blacklist sub-items
  3. Click a game in Library → should navigate to `/games/:id`
  4. Navigate to `/downloads` → should redirect to `/activity/queue`
  5. Navigate to `/wishlist` → should redirect to `/wanted`
  6. Click Settings > Sources in sidebar → should open Settings at sources tab

- [ ] **Verify full test suite**

```bash
npx vitest run
```

Expected: All tests pass.

- [ ] **Final commit (if any cleanup needed)**

```bash
git add -A
git commit -m "chore(ui): cleanup post-sonarr-alignment (#8)"
```
